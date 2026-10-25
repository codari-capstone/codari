#!/usr/bin/env python3
"""실행 슬롯 동시 실행 검증 (#66).

  cd judge && python3 verify/concurrency_check.py [--heavy-mb 450]

접속 주소와 토큰은 smoke와 같이 JUDGE0_URL·JUDGE0_AUTHN_TOKEN, 없으면 judge/.env에서 읽는다.
1단계: CPU를 1.5초 쓰는 작업 4개(Python 2·C++ 2, 컴파일 포함)를 한꺼번에 제출한다. 각 작업이 샌드박스 안에서
       시작·종료 시각을 출력하고, 그 구간이 최대 몇 개 겹쳤는지로 동시 실행 수를 잰다(judge0.conf의 COUNT개).
       /workers는 호출할 때마다 워커 등록을 지워 working이 0으로 오므로(README 운영 명령 절) 큐 대기 수만 참고로 본다.
2단계: 메모리를 heavy-mb만큼 실제로 쓰는 Python 작업 2개를 동시에 돌린다(memory_limit는 그보다 크게).
       두 작업이 실제로 겹쳐 돌아야 두 개분의 메모리 여유를 잰 것이라, 이 단계도 겹침을 확인한다.
리눅스 호스트(채점 VM)에서 실행하면 /proc/meminfo의 MemAvailable 최솟값과 컨테이너 재시작 횟수도 기록한다.
맥(Docker Desktop)에서는 호스트 메모리 수치를 재지 않는다 — 서버와 조건이 달라 의미가 없다.

합격 기준(채점 VM): 두 단계 모두 동시 실행이 min(COUNT, 작업 수), 모든 작업 status 3,
MemAvailable 최소 256 MiB 이상(측정이 끊기지 않았을 것), 재시작 없음.
"""

import argparse
import os
import platform
import subprocess
import sys
import threading
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"))
from judge0_client import CPP_COMPILER_OPTIONS, CPP_ID, PYTHON_ID  # noqa: E402
from smoke import JUDGE_DIR, client_from_env, conf_values, max_overlap  # noqa: E402

PY_CPU = "import time\nstart = time.time()\nwhile time.process_time() < 1.5:\n    pass\nprint(start, time.time())\n"
CPP_CPU = (
    "#include <chrono>\n#include <cstdio>\n#include <ctime>\n"
    "static double now() {\n"
    "    return std::chrono::duration<double>(std::chrono::system_clock::now().time_since_epoch()).count();\n}\n"
    "int main() {\n    double start = now();\n    while (std::clock() < 1.5 * CLOCKS_PER_SEC) {}\n"
    "    std::printf(\"%.6f %.6f\\n\", start, now());\n}\n"
)
PY_HEAVY = (
    "import time\nstart = time.time()\nn = {mb} * 1024 * 1024\nb = bytearray(n)\n"
    "for i in range(0, n, 4096):\n    b[i] = 1\ntime.sleep(1)\nprint(start, time.time())\n"
)
MIN_AVAILABLE_MB = 256
# 2단계 memory_limit = heavy-mb + 이 값. Python 인터프리터가 쓰는 몫이다.
HEAVY_HEADROOM_MB = 50


def mem_available_mb():
    with open("/proc/meminfo") as f:
        for line in f:
            if line.startswith("MemAvailable:"):
                return int(line.split()[1]) // 1024
    return None


def restart_counts():
    """이 judge 폴더에서 띄운 compose 컨테이너의 재시작 횟수. 찾지 못하면 None이다(검사하지 못함).
    compose 프로젝트 이름은 환경마다 달라(맥은 judge0-local) 이름이 아니라 작업 폴더 라벨로 찾는다."""
    label = f"label=com.docker.compose.project.working_dir={JUDGE_DIR}"
    try:
        ids = subprocess.run(["docker", "ps", "-q", "--filter", label],
                             capture_output=True, text=True, timeout=10).stdout.split()
        if not ids:
            return None
        out = subprocess.run(["docker", "inspect", "-f", "{{.Name}} {{.RestartCount}}", *ids],
                             capture_output=True, text=True, timeout=10).stdout
        return dict(line.split() for line in out.splitlines() if line.strip())
    except (OSError, subprocess.SubprocessError, ValueError):
        return None


class Sampler:
    """호스트 메모리 여유와 큐 대기를 0.1초마다 잰다. 둘을 다른 스레드에서 재, /workers가 늦거나 실패해도
    메모리 측정은 끊기지 않는다. 측정 스레드가 예외로 멈추면 error에 남겨 본 흐름이 실패로 본다."""

    def __init__(self, client):
        self.client, self.stop = client, threading.Event()
        self.max_queue, self.min_available, self.samples, self.queue_errors, self.error = 0, None, 0, 0, None
        self.threads = [threading.Thread(target=self._guard, args=(loop,), daemon=True)
                        for loop in (self._memory, self._queue)]

    def start(self):
        for thread in self.threads:
            thread.start()

    def join(self):
        self.stop.set()
        for thread in self.threads:
            thread.join()

    def _guard(self, loop):
        try:
            loop()
        except Exception as e:  # noqa: BLE001
            self.error = e

    def _memory(self):
        if platform.system() != "Linux":
            return
        while not self.stop.is_set():
            avail = mem_available_mb()
            self.min_available = avail if self.min_available is None else min(self.min_available, avail)
            self.samples += 1
            time.sleep(0.1)

    def _queue(self):
        while not self.stop.is_set():
            try:
                _, workers = self.client.request("GET", "/workers")
                for q in workers if isinstance(workers, list) else []:
                    self.max_queue = max(self.max_queue, q.get("size", 0))
            except OSError:
                # 연결 오류·타임아웃. 큐 대기는 참고값이라 세기만 한다.
                self.queue_errors += 1
            time.sleep(0.1)


def run_phase(client, title, jobs):
    sampler = Sampler(client)
    sampler.start()
    started = time.monotonic()
    tokens = [client.submit(src, lang, compiler_options=opts, **limits) for src, lang, opts, limits in jobs]
    results = [client.wait(t, deadline_s=300) for t in tokens]
    sampler.join()
    statuses = [r["status"]["id"] for r in results]
    intervals = []
    for r in results:
        try:
            a, b = map(float, (r.get("stdout") or "").split()[:2])
            intervals.append((a, b))
        except ValueError:
            pass
    print(f"[{title}] 작업 {len(jobs)}개, 경과 {time.monotonic() - started:.1f}초")
    print(f"  status {statuses}, memory(KB) {[r.get('memory') for r in results]}")
    sampler.overlap = max_overlap(intervals) if len(intervals) == len(results) else None
    if sampler.overlap is not None:
        print(f"  샌드박스 실행 구간 최대 겹침 {sampler.overlap}")
    print(f"  /workers 큐 대기 최대 {sampler.max_queue}(참고)" + (f", 조회 실패 {sampler.queue_errors}번" if sampler.queue_errors else ""))
    if sampler.min_available is not None:
        print(f"  호스트 MemAvailable 최소 {sampler.min_available} MiB")
    return statuses, sampler


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--heavy-mb", type=int, default=450, help="2단계에서 작업 하나가 실제로 쓸 메모리(MiB)")
    args = parser.parse_args(argv)
    conf = conf_values()
    count = int(conf.get("count", 2))
    max_memory_kb = int(conf.get("max_memory_limit", 524288))
    heavy_limit_kb = (args.heavy_mb + HEAVY_HEADROOM_MB) * 1024
    if heavy_limit_kb > max_memory_kb:
        parser.error(f"--heavy-mb는 {max_memory_kb // 1024 - HEAVY_HEADROOM_MB} 이하여야 한다 "
                     f"(memory_limit이 MAX_MEMORY_LIMIT {max_memory_kb} KB를 넘으면 422)")
    client = client_from_env()
    linux = platform.system() == "Linux"
    before = restart_counts()

    cpu_jobs = [(PY_CPU, PYTHON_ID, None, {}), (CPP_CPU, CPP_ID, CPP_COMPILER_OPTIONS, {})] * 2
    heavy = [(PY_HEAVY.format(mb=args.heavy_mb), PYTHON_ID, None, {"memory_limit": heavy_limit_kb})] * 2
    phases = []
    for title, jobs in (("CPU 4개", cpu_jobs), (f"메모리 {args.heavy_mb} MiB × 2", heavy)):
        statuses, sampler = run_phase(client, title, jobs)
        phases.append((title, len(jobs), statuses, sampler))
    after = restart_counts()

    problems = []
    for title, n_jobs, statuses, sampler in phases:
        expected = min(count, n_jobs)
        if sampler.overlap != expected:
            problems.append(f"{title}: 동시 실행 최대가 {sampler.overlap} (기대 {expected}, COUNT={count})")
        if any(s != 3 for s in statuses):
            problems.append(f"{title}: status 3이 아닌 작업이 있음")
        if sampler.error is not None:
            problems.append(f"{title}: 측정 스레드가 멈춤 ({sampler.error!r})")
        if linux and sampler.samples == 0:
            problems.append(f"{title}: 호스트 메모리 여유를 재지 못함")
    if before is None or after is None:
        problems.append("judge 폴더에서 띄운 컨테이너를 찾지 못해 재시작 여부를 확인하지 못함")
    elif before != after:
        problems.append(f"컨테이너 재시작 발생 {before} → {after}")
    mins = [s.min_available for _, _, _, s in phases if s.min_available is not None]
    if linux and mins and min(mins) < MIN_AVAILABLE_MB:
        problems.append(f"MemAvailable 최소 {min(mins)} MiB < {MIN_AVAILABLE_MB} MiB")
    if not linux:
        print("\n(리눅스 호스트가 아니라 메모리 여유는 재지 않았다. 채점 VM에서 다시 실행한다)")
    print("\n통과" if not problems else "\n실패: " + "; ".join(problems))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())

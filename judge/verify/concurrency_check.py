#!/usr/bin/env python3
"""실행 슬롯 2개 동시 실행 검증 (#66).

  cd judge && python3 verify/concurrency_check.py [--heavy-mb 450]

1단계: CPU를 1.5초 쓰는 작업 4개(Python 2·C++ 2, 컴파일 포함)를 한꺼번에 제출한다. 각 작업이 샌드박스 안에서
       시작·종료 시각을 출력하고, 그 구간이 최대 몇 개 겹쳤는지로 동시 실행 수를 잰다(최대 2여야 한다).
       /workers는 호출할 때마다 워커 등록을 지워 working이 0으로 오므로(README 운영 명령 절) 큐 대기 수만 참고로 본다.
2단계: 메모리를 heavy-mb만큼 실제로 쓰는 Python 작업 2개를 동시에 돌린다(memory_limit는 그보다 크게).
리눅스 호스트(채점 VM)에서 실행하면 /proc/meminfo의 MemAvailable 최솟값과 컨테이너 재시작 횟수도 기록한다.
맥(Docker Desktop)에서는 호스트 메모리 수치를 재지 않는다 — 서버와 조건이 달라 의미가 없다.

합격 기준(채점 VM): 동시 실행 최대 2, 모든 작업 status 3, MemAvailable 최소 256 MiB 이상, 재시작 없음.
"""

import argparse
import os
import platform
import subprocess
import sys
import threading
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"))
from judge0_client import CPP_COMPILER_OPTIONS, CPP_ID, PYTHON_ID, Judge0Client  # noqa: E402

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


def max_overlap(intervals):
    events = sorted([(a, 1) for a, _ in intervals] + [(b, -1) for _, b in intervals], key=lambda e: (e[0], e[1]))
    current = best = 0
    for _, delta in events:
        current += delta
        best = max(best, current)
    return best


def mem_available_mb():
    with open("/proc/meminfo") as f:
        for line in f:
            if line.startswith("MemAvailable:"):
                return int(line.split()[1]) // 1024
    return None


def restart_counts():
    try:
        out = subprocess.run(
            ["docker", "inspect", "-f", "{{.Name}} {{.RestartCount}}"]
            + subprocess.run(["docker", "ps", "-q", "--filter", "name=judge0"], capture_output=True, text=True).stdout.split(),
            capture_output=True, text=True, timeout=10,
        ).stdout
        return dict(line.split() for line in out.splitlines() if line.strip())
    except (OSError, subprocess.SubprocessError, ValueError):
        return {}


class Sampler(threading.Thread):
    def __init__(self, client):
        super().__init__(daemon=True)
        self.client, self.stop = client, threading.Event()
        self.max_queue, self.min_available = 0, None

    def run(self):
        linux = platform.system() == "Linux"
        while not self.stop.is_set():
            _, workers = self.client.request("GET", "/workers")
            for q in workers or []:
                self.max_queue = max(self.max_queue, q.get("size", 0))
            if linux:
                avail = mem_available_mb()
                self.min_available = avail if self.min_available is None else min(self.min_available, avail)
            time.sleep(0.1)


def run_phase(client, title, jobs):
    sampler = Sampler(client)
    sampler.start()
    started = time.monotonic()
    tokens = [client.submit(src, lang, compiler_options=opts, **limits) for src, lang, opts, limits in jobs]
    results = [client.wait(t, deadline_s=300) for t in tokens]
    sampler.stop.set()
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
    print(f"  /workers 큐 대기 최대 {sampler.max_queue}(참고)")
    if sampler.min_available is not None:
        print(f"  호스트 MemAvailable 최소 {sampler.min_available} MiB")
    return statuses, sampler


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--heavy-mb", type=int, default=450, help="2단계에서 작업 하나가 실제로 쓸 메모리(MiB)")
    args = parser.parse_args(argv)
    client = Judge0Client()
    linux = platform.system() == "Linux"
    before = restart_counts()

    cpu_jobs = [(PY_CPU, PYTHON_ID, None, {}), (CPP_CPU, CPP_ID, CPP_COMPILER_OPTIONS, {})] * 2
    s1, sampler1 = run_phase(client, "CPU 4개", cpu_jobs)
    heavy_limit_kb = (args.heavy_mb + 50) * 1024
    heavy = [(PY_HEAVY.format(mb=args.heavy_mb), PYTHON_ID, None, {"memory_limit": heavy_limit_kb})] * 2
    s2, sampler2 = run_phase(client, f"메모리 {args.heavy_mb} MiB × 2", heavy)
    after = restart_counts()

    problems = []
    if sampler1.overlap != 2:
        problems.append(f"동시 실행 최대가 {sampler1.overlap} (기대 2)")
    if any(s != 3 for s in s1 + s2):
        problems.append("status 3이 아닌 작업이 있음")
    if before and after and before != after:
        problems.append(f"컨테이너 재시작 발생 {before} → {after}")
    mins = [s.min_available for s in (sampler1, sampler2) if s.min_available is not None]
    if linux and mins and min(mins) < MIN_AVAILABLE_MB:
        problems.append(f"MemAvailable 최소 {min(mins)} MiB < {MIN_AVAILABLE_MB} MiB")
    if not linux:
        print("\n(리눅스 호스트가 아니라 메모리 여유는 재지 않았다. 채점 VM에서 다시 실행한다)")
    print("\n통과" if not problems else "\n실패: " + "; ".join(problems))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Python·C++ 실행 시간·메모리 실측 (#65).

  cd judge && python3 bench/run_bench.py --label ec2-t3.small [--runs 5] [--results]

워크로드마다 같은 알고리즘의 Python·C++ 코드를 입력 크기 3단계로 실행한다. 조합마다 예열 1회는 버리고
--runs회 측정한다. 한 번에 하나씩 순차로 제출해(슬롯 하나만 사용) 서로 간섭하지 않게 하고, 언어 순서를 번갈아 바꾼다.
측정이 제한에 잘리지 않도록 상한값(CPU 20초, wall 30초, 메모리 512 MB)으로 요청한다.

출력: 조합별 time(CPU 초)·memory(KB)의 중앙값·최댓값, Python/C++ 비율, Python 보정식 평가.
보정식 평가 — C++ 최댓값의 2배를 0.5초 단위로 올린 값(최소 1초)을 그 입력의 C++ 기준 제한 L로 보고,
Python 최댓값이 3L + 2초 안에 드는지 본다. L의 하한 1초 때문에 작은 입력은 거의 늘 통과하므로, 배수 자체는
'최대 비율'(Python 최대 ÷ C++ 최대) 열로 판단한다. C++이 L의 절반을 쓰면 3L + 2 = 6 × C++ 시간 + 2라 비율 6배까지 맞는다.
보정 배수는 채점 VM 결과로만 확정한다(README 실측 절).
실행 하나가 실패해도 그 조합을 '문제'에 적고 계속 잰다. 중간에 멈춰도 그때까지의 원자료는 bench/out/에 남는다.
--results를 주면 표를 bench/results/<날짜>-<label>.md로도 저장한다. 원자료는 bench/out/(git 무시)에 남는다.
"""

import argparse
import datetime as dt
import hashlib
import json
import math
import os
import platform
import statistics
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "scripts"))
sys.path.insert(0, HERE)
from gen_input import SIZES, make_input  # noqa: E402
from judge0_client import CPP_COMPILER_OPTIONS, CPP_ID, PYTHON_ID, Judge0HTTPError, PollTimeout  # noqa: E402
from smoke import client_from_env  # noqa: E402

BENCH_LIMITS = {"cpu_time_limit": 20, "wall_time_limit": 30, "memory_limit": 524288}
LANGS = {"python": (PYTHON_ID, ".py", None), "cpp": (CPP_ID, ".cpp", CPP_COMPILER_OPTIONS)}
PY_FACTOR, PY_EXTRA_S = 3, 2.0  # 양식본 초기값: 시간 ×3 + 2초


def cpp_base_limit(cpp_max_s):
    """C++ 풀이가 제한의 절반 이하를 쓰도록 잡은 기준 제한(초, 0.5초 단위, 최소 1초)."""
    return max(1.0, math.ceil(cpp_max_s * 2 / 0.5) * 0.5)


def summarize(values, low=False):
    """low=True면 실제 표본 값 중 가운데(짝수 개면 작은 쪽)를 쓴다. 메모리 KB가 소수로 찍히지 않게 한다."""
    if not values:
        return None
    return {"median": statistics.median_low(values) if low else statistics.median(values), "max": max(values)}


def evaluate_row(py, cpp):
    """한 (워크로드, 크기)의 요약. py·cpp는 {'time': [...], 'memory': [...]}."""
    row = {"py_time": summarize(py["time"]), "cpp_time": summarize(cpp["time"]),
           "py_mem": summarize(py["memory"], low=True), "cpp_mem": summarize(cpp["memory"], low=True)}
    if row["py_time"] and row["cpp_time"]:
        cpp_med = row["cpp_time"]["median"] or 0.001
        row["time_ratio"] = row["py_time"]["median"] / cpp_med
        row["max_ratio"] = row["py_time"]["max"] / (row["cpp_time"]["max"] or 0.001)
        base = cpp_base_limit(row["cpp_time"]["max"])
        row["cpp_limit"] = base
        row["py_limit"] = PY_FACTOR * base + PY_EXTRA_S
        row["py_passes"] = row["py_time"]["max"] <= row["py_limit"]
    if row["py_mem"] and row["cpp_mem"]:
        row["mem_ratio"] = row["py_mem"]["median"] / max(row["cpp_mem"]["median"], 1)
    return row


def run_one(client, workload, lang, stdin):
    lang_id, ext, options = LANGS[lang]
    with open(os.path.join(HERE, "workloads", workload + ext), encoding="utf-8") as f:
        source = f.read()
    r = client.run(source, lang_id, stdin, compiler_options=options, deadline_s=300, **BENCH_LIMITS)
    return {"status": r["status"]["id"], "time": float(r["time"] or 0), "wall_time": float(r["wall_time"] or 0),
            "memory": int(r["memory"] or 0), "stdout_sha256": hashlib.sha256((r["stdout"] or "").encode()).hexdigest()}


def conditions(client, label):
    _, about = client.request("GET", "/about")
    _, isolate = client.request("GET", "/isolate")
    # /isolate는 버전·저작권·빌드 정보 여러 줄을 준다. 결과 md 목록이 깨지지 않게 첫 줄만 남긴다.
    isolate = isolate.splitlines()[0] if isinstance(isolate, str) and isolate else isolate
    about = about if isinstance(about, dict) else {}
    info = {"label": label, "judge0": about.get("version"), "isolate": isolate,
            "host": platform.platform(), "measured_at": dt.datetime.now().astimezone().isoformat(timespec="seconds")}
    if platform.system() == "Linux":
        with open("/proc/cpuinfo") as f:
            info["cpu"] = next((line.split(":", 1)[1].strip() for line in f if line.startswith("model name")), None)
        info["nproc"] = os.cpu_count()
        with open("/proc/meminfo") as f:
            info["mem_total"] = f.readline().split(":", 1)[1].strip()
    return info


def fmt(stat, key="median", digits=3):
    return "" if not stat else f"{stat[key]:.{digits}f}" if isinstance(stat[key], float) else str(stat[key])


def render(cond, rows, problems):
    lines = [f"# 실측 결과 — {cond['label']}", ""]
    lines += [f"- {k}: {v}" for k, v in cond.items()]
    lines += ["- 요청 제한: CPU 20초, wall 30초, 메모리 512 MB (측정이 잘리지 않게 상한값 사용)",
              f"- 보정식 평가: C++ 기준 제한 L = max(1초, C++ 최대 × 2를 0.5초 단위로 올림), Python 제한 = {PY_FACTOR}L + {PY_EXTRA_S:g}초", "",
              "| 워크로드 | N | Py time 중앙/최대(s) | C++ time 중앙/최대(s) | 시간 비율 | 최대 비율 | Py mem 중앙/최대(KB) | C++ mem 중앙/최대(KB) | 메모리 비율 | L(s) | Py 제한(s) | 통과 |",
              "|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for (workload, n), row in rows.items():
        lines.append("| " + " | ".join([
            workload, str(n),
            f"{fmt(row['py_time'])} / {fmt(row['py_time'], 'max')}", f"{fmt(row['cpp_time'])} / {fmt(row['cpp_time'], 'max')}",
            f"{row.get('time_ratio', 0):.1f}", f"{row.get('max_ratio', 0):.1f}",
            f"{fmt(row['py_mem'])} / {fmt(row['py_mem'], 'max')}", f"{fmt(row['cpp_mem'])} / {fmt(row['cpp_mem'], 'max')}",
            f"{row.get('mem_ratio', 0):.1f}", f"{row.get('cpp_limit', '')}", f"{row.get('py_limit', '')}",
            "" if "py_passes" not in row else ("예" if row["py_passes"] else "**아니오**"),
        ]) + " |")
    lines += ["", "문제: " + ("; ".join(problems) if problems else "없음 (모든 실행 status 3, 두 언어 출력 일치)")]
    return "\n".join(lines) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--label", required=True, help="측정 환경 이름. 예: ec2-t3.small")
    parser.add_argument("--runs", type=int, default=5)
    parser.add_argument("--workload", action="append", choices=sorted(SIZES), help="이 워크로드만 (여러 번 지정 가능)")
    parser.add_argument("--max-size-index", type=int, default=2, help="0이면 소 크기만, 2면 소·중·대 모두")
    parser.add_argument("--results", action="store_true", help="표를 bench/results/에도 저장한다")
    args = parser.parse_args(argv)

    client = client_from_env()
    cond = conditions(client, args.label)
    raw, rows, problems = [], {}, []
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    try:
        measure(client, args, raw, rows, problems)
    finally:
        # 중간에 멈춰도(연결 끊김·Ctrl-C) 그때까지 잰 원자료는 남긴다.
        out_dir = os.path.join(HERE, "out")
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, f"bench-{args.label}-{stamp}.json"), "w", encoding="utf-8") as f:
            json.dump({"conditions": cond, "runs": raw, "rows": {f"{w}:{n}": r for (w, n), r in rows.items()},
                       "problems": problems}, f, ensure_ascii=False, indent=2)

    table = render(cond, rows, problems)
    print(table)
    if args.results:
        os.makedirs(os.path.join(HERE, "results"), exist_ok=True)
        with open(os.path.join(HERE, "results", f"{dt.date.today().isoformat()}-{args.label}.md"), "w", encoding="utf-8") as f:
            f.write(table)
    return 1 if problems else 0


def measure(client, args, raw, rows, problems):
    for workload in args.workload or list(SIZES):
        for n in SIZES[workload][: args.max_size_index + 1]:
            stdin = make_input(workload, n)
            samples = {"python": {"time": [], "memory": []}, "cpp": {"time": [], "memory": []}}
            hashes = {"python": set(), "cpp": set()}
            for i in range(args.runs + 1):
                order = ("python", "cpp") if i % 2 == 0 else ("cpp", "python")
                for lang in order:
                    try:
                        m = run_one(client, workload, lang, stdin)
                    except (Judge0HTTPError, PollTimeout, OSError) as e:
                        problems.append(f"{workload} N={n} {lang} 실행 {i}: 실행 실패 {e}")
                        continue
                    raw.append({"workload": workload, "n": n, "lang": lang, "run": i, "warmup": i == 0, **m})
                    if m["status"] != 3:
                        problems.append(f"{workload} N={n} {lang} 실행 {i}: status {m['status']}")
                        continue
                    hashes[lang].add(m["stdout_sha256"])
                    if i > 0:
                        samples[lang]["time"].append(m["time"])
                        samples[lang]["memory"].append(m["memory"])
            if workload != "empty" and hashes["python"] != hashes["cpp"]:
                problems.append(f"{workload} N={n}: 두 언어 출력이 다름")
            rows[(workload, n)] = evaluate_row(samples["python"], samples["cpp"])
            print(f"  {workload} N={n} 완료", file=sys.stderr)


if __name__ == "__main__":
    sys.exit(main())

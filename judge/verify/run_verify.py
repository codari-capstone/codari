#!/usr/bin/env python3
"""격리·자원 제한 검증 (#66)과 판정 매핑 근거 수집 (#67).

  cd judge && python3 verify/run_verify.py --label <실행 환경 이름> [--group network] [--observed verify/observed]

cases.json의 케이스를 Judge0에 제출하고 status·signal·시간·메모리·stderr를 기대값과 대조해 표로 출력한다.
- observe 케이스(예외 모음)는 기대와 달라도 실패로 세지 않고 "다름"으로 표시한다. 매핑표의 근거로 쓴다.
- control 케이스(네트워크)는 같은 코드를 호스트에서도 실행해, 샌드박스 밖에서는 닿는 대상만 차단 근거로 인정한다.
- 종료 코드는 observe가 아닌 케이스의 실패 수다.
- 전체 결과는 verify/out/(git 무시)에, --observed를 주면 토큰을 뺀 응답을 케이스별 JSON으로 저장한다.
"""

import argparse
import datetime as dt
import json
import os
import platform
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "scripts"))
from judge0_client import CPP_COMPILER_OPTIONS, CPP_ID, PYTHON_ID, Judge0Client  # noqa: E402

DROP_FIELDS = ("token", "created_at", "finished_at")


def load_cases(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)["cases"]


def language_of(file_name):
    return (CPP_ID, CPP_COMPILER_OPTIONS) if file_name.endswith(".cpp") else (PYTHON_ID, None)


def last_line(text):
    lines = [line for line in (text or "").splitlines() if line.strip()]
    return lines[-1].strip() if lines else ""


def probe_lines(stdout):
    """'이름 REACHED|BLOCKED ...' 줄을 {이름: 결과}로 바꾼다."""
    result = {}
    for line in (stdout or "").splitlines():
        parts = line.split()
        if len(parts) >= 2 and parts[1] in ("REACHED", "BLOCKED"):
            result[parts[0]] = parts[1]
    return result


def evaluate(case, result):
    """(통과 여부, 이유 목록)을 돌려준다."""
    expect = case.get("expect") or {}
    status = result["status"]["id"]
    stdout, stderr = result.get("stdout") or "", result.get("stderr") or ""
    reasons = []
    if "status" in expect and status not in expect["status"]:
        reasons.append(f"status {status} (기대 {expect['status']})")
    if "exit_code" in expect and result.get("exit_code") not in expect["exit_code"]:
        reasons.append(f"exit_code {result.get('exit_code')} (기대 {expect['exit_code']})")
    if "status_not" in expect and status in expect["status_not"]:
        reasons.append(f"status {status} (나오면 안 됨)")
    for text in expect.get("stdout_has", []):
        if text not in stdout:
            reasons.append(f"stdout에 {text} 없음")
    for text in expect.get("stdout_not", []):
        if text in stdout:
            reasons.append(f"stdout에 {text} 있음")
    for text in expect.get("stderr_has", []):
        if text not in stderr:
            reasons.append(f"stderr에 {text} 없음")
    return not reasons, reasons


def run_control(path):
    try:
        out = subprocess.run([sys.executable, "-I", path], capture_output=True, text=True, timeout=30).stdout
    except subprocess.TimeoutExpired:
        out = ""
    return probe_lines(out)


def control_summary(sandbox, host):
    notes = []
    for name, state in sorted(sandbox.items()):
        if state == "BLOCKED":
            notes.append(f"{name}: 차단 확인" if host.get(name) == "REACHED" else f"{name}: 호스트도 닿지 않아 대조 불가")
    return "; ".join(notes)


def sanitize(result):
    clean = {k: v for k, v in result.items() if k not in DROP_FIELDS}
    for key in ("stdout", "stderr", "compile_output"):
        value = clean.get(key)
        if value and len(value) > 2000:
            clean[key] = value[:2000] + f"... (총 {len(value)}자)"
    return clean


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--label", required=True, help="실행 환경 이름. 예: mac-rosetta-cgroupv1, ec2-t3.small")
    parser.add_argument("--cases", default=os.path.join(HERE, "cases.json"))
    parser.add_argument("--group", action="append", help="이 묶음만 실행 (여러 번 지정 가능)")
    parser.add_argument("--observed", help="케이스별 응답 JSON을 저장할 폴더")
    parser.add_argument("--deadline", type=float, default=600.0, help="전체 폴링 기한(초)")
    args = parser.parse_args(argv)

    client = Judge0Client()
    cases = [c for c in load_cases(args.cases) if not args.group or c["group"] in args.group]
    _, about = client.request("GET", "/about")

    tokens = {}
    for case in cases:
        with open(os.path.join(HERE, "cases", case["file"]), encoding="utf-8") as f:
            source = f.read()
        lang_id, options = language_of(case["file"])
        tokens[case["id"]] = client.submit(source, lang_id, case.get("stdin", ""), compiler_options=options,
                                           **case.get("limits", {}))

    rows, records, failed = [], [], 0
    for case in cases:
        result = client.wait(tokens[case["id"]], deadline_s=args.deadline)
        ok, reasons = evaluate(case, result)
        note = last_line(result.get("stderr")) or last_line(result.get("compile_output")) or last_line(result.get("stdout"))
        if case.get("control"):
            note = control_summary(probe_lines(result.get("stdout")), run_control(os.path.join(HERE, "cases", case["file"])))
        if ok:
            verdict = "ok"
        elif case.get("observe"):
            verdict = "다름: " + ", ".join(reasons)
        else:
            verdict = "FAIL: " + ", ".join(reasons)
            failed += 1
        status = result["status"]
        rows.append([case["id"], case["group"], f"{status['id']} {status['description']}", result.get("exit_signal"),
                     result.get("exit_code"), result.get("time"), result.get("wall_time"), result.get("memory"),
                     verdict, note[:120]])
        records.append({"case": case, "result": sanitize(result), "verdict": verdict})

    print(f"# 검증 결과 — {args.label} · Judge0 {(about or {}).get('version')} · "
          f"{dt.datetime.now().astimezone().isoformat(timespec='seconds')}\n")
    print("| 케이스 | 묶음 | status | signal | exit | time | wall | memory(KB) | 판정 | 비고 |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    for row in rows:
        print("| " + " | ".join("" if v is None else str(v).replace("|", "\\|") for v in row) + " |")
    print(f"\n실패 {failed}건 (observe 케이스 제외)")

    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    out_dir = os.path.join(HERE, "out")
    os.makedirs(out_dir, exist_ok=True)
    meta = {"label": args.label, "judge0": about, "host": platform.platform(), "run_at": stamp}
    with open(os.path.join(out_dir, f"verify-{args.label}-{stamp}.json"), "w", encoding="utf-8") as f:
        json.dump({"meta": meta, "records": records}, f, ensure_ascii=False, indent=2)
    if args.observed:
        target = os.path.join(args.observed, args.label)
        os.makedirs(target, exist_ok=True)
        for rec in records:
            with open(os.path.join(target, rec["case"]["id"] + ".json"), "w", encoding="utf-8") as f:
                json.dump({"meta": meta, "case": rec["case"], "result": rec["result"]}, f, ensure_ascii=False, indent=2)
    return failed


if __name__ == "__main__":
    sys.exit(main())

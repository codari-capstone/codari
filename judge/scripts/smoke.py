#!/usr/bin/env python3
"""Judge0 기동 확인 (#64). 채점 VM(또는 SSM 포트 포워딩한 맥)에서 실행한다.

  cd judge && python3 scripts/smoke.py

확인 항목: 인증(401/200), /system_info, /config_info가 judge0.conf와 같은지, 언어 71·54,
Python·C++17 hello world, 권한(AUTHZ 없이 403, AUTHZ로 삭제 200), 동시 실행 2개,
호출자가 바꾸면 안 되는 값의 거절(422/400).
접속 주소는 JUDGE0_URL, 없으면 judge/.env의 JUDGE0_BIND_ADDR(compose가 2358을 게시한 주소)를 쓴다.
토큰은 JUDGE0_AUTHN_TOKEN·JUDGE0_AUTHZ_TOKEN, 없으면 judge/.env의 AUTHN_TOKEN·AUTHZ_TOKEN을 쓴다.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from judge0_client import (  # noqa: E402
    CPP_COMPILER_OPTIONS, CPP_ID, PYTHON_ID, Judge0Client, Judge0HTTPError, PollTimeout,
)

JUDGE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# judge0.conf 키와 /config_info 키의 이름이 다른 경우
CONFIG_KEY_ALIASES = {"allowed_languages_for_compiler_options": "allowed_languages_for_compile_options"}
REQUIRED_CONFIG_KEYS = (
    "enable_network", "allow_enable_network", "enable_additional_files", "enable_command_line_arguments",
    "enable_callbacks", "enable_wait_result", "number_of_runs", "max_number_of_runs",
    "allow_enable_per_process_and_thread_time_limit", "allow_enable_per_process_and_thread_memory_limit",
    "allowed_languages_for_compiler_options", "enable_submission_delete", "max_queue_size",
)
LANGUAGES = {PYTHON_ID: "Python (3.8.1)", CPP_ID: "C++ (GCC 9.2.0)"}
PY_HELLO = "import sys\nprint('hello', sys.version.split()[0])\n"
CPP_HELLO = (
    "#include <cstdio>\n#include <utility>\n"
    "int main(){ auto [a, b] = std::pair<int,int>(1, 2);\n"
    "  if constexpr (__cplusplus >= 201703L) std::printf(\"hello %ld %d\\n\", __cplusplus, a + b);\n}\n"
)
# 2초씩 자며 샌드박스 안 시각으로 실행 구간을 찍는다. 3개를 함께 넣으면 슬롯 2개에서는 2개까지만 겹친다
SLOT_PROBE = "import time\nstart = time.time()\ntime.sleep(2)\nprint(start, time.time())\n"
SLOT_PROBE_JOBS = 3
EXPECTED_SLOTS = 2


def read_kv(path):
    values = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip().strip('"')
    return values


def default_url(env):
    """JUDGE0_URL이 없으면 compose가 2358을 게시한 주소(.env의 JUDGE0_BIND_ADDR)로 접속한다."""
    return os.environ.get("JUDGE0_URL") or f"http://{env.get('JUDGE0_BIND_ADDR') or '127.0.0.1'}:2358"


def max_overlap(intervals):
    """(시작, 끝) 구간들이 한 시각에 최대 몇 개 겹치는지. 끝과 시작이 같은 시각이면 겹치지 않은 것으로 본다."""
    events = sorted([(start, 1) for start, _ in intervals] + [(end, -1) for _, end in intervals])
    current = best = 0
    for _, delta in events:
        current += delta
        best = max(best, current)
    return best


def normalize(value):
    if isinstance(value, bool):
        return str(value).lower()
    if isinstance(value, list):
        return " ".join(str(v) for v in value)
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


class Checker:
    def __init__(self):
        self.failed = 0

    def check(self, ok, label, detail=""):
        print(f"  {'ok  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail and not ok else ""))
        if not ok:
            self.failed += 1


def check_auth(client, c):
    status, _ = client.request("GET", "/about", authn=False)
    c.check(status == 401, "토큰 없이 /about → 401", f"실제 {status}")
    status, _ = client.request("GET", "/about")
    c.check(status == 200, "토큰으로 /about → 200", f"실제 {status}")
    status, _ = client.request("GET", "/submissions")
    c.check(status == 403, "AUTHZ 없이 제출 목록 → 403", f"실제 {status}")


def check_system(client, c):
    status, sysinfo = client.request("GET", "/system_info")
    sysinfo = sysinfo if isinstance(sysinfo, dict) else {}
    c.check(status == 200 and sysinfo.get("Architecture") == "x86_64", "/system_info → 200, x86_64",
            f"실제 {status} {sysinfo.get('Architecture')!r}")
    print(f"       CPU {sysinfo.get('CPU(s)')}개, 모델 {sysinfo.get('Model name', '-')}")


def check_config(client, c):
    _, info = client.request("GET", "/config_info")
    info = info if isinstance(info, dict) else {}
    conf = {k.lower(): v for k, v in read_kv(os.path.join(JUDGE_DIR, "judge0.conf")).items() if v}
    for key, expected in sorted(conf.items()):
        api_key = CONFIG_KEY_ALIASES.get(key, key)
        if api_key in info:
            c.check(normalize(info[api_key]) == expected, f"{api_key} = {expected}", f"실제 {info[api_key]!r}")
    for key in REQUIRED_CONFIG_KEYS:
        c.check(CONFIG_KEY_ALIASES.get(key, key) in info and key in conf, f"{key} 대조됨")
    # /config_info가 내보내지 않는 키는 이 검사로 확인할 수 없다(COUNT는 아래 실행 슬롯 항목이 확인한다)
    skipped = [key.upper() for key in sorted(conf) if CONFIG_KEY_ALIASES.get(key, key) not in info]
    print(f"       /config_info에 없어 대조하지 않은 키: {', '.join(skipped) or '없음'}")


def check_languages(client, c):
    _, langs = client.request("GET", "/languages")
    names = {lang["id"]: lang["name"] for lang in (langs if isinstance(langs, list) else [])}
    for lang_id, name in LANGUAGES.items():
        c.check(names.get(lang_id) == name, f"언어 {lang_id} = {name}", f"실제 {names.get(lang_id)!r}")


def check_runs(client, c):
    py = client.run(PY_HELLO, PYTHON_ID)
    c.check(py["status"]["id"] == 3 and py["stdout"] == "hello 3.8.1\n", "Python hello → status 3", repr(py))
    # AUTHZ_TOKEN이 비어 있어도 [인증]의 403은 나온다. 토큰이 실제로 들어갔는지는 삭제가 되는지로 본다
    status, _ = client.request("DELETE", f"/submissions/{py.get('token')}", params={"fields": "token"}, authz=True)
    c.check(status == 200, "AUTHZ로 hello 제출 삭제 → 200", f"실제 {status}")
    cpp = client.run(CPP_HELLO, CPP_ID, compiler_options=CPP_COMPILER_OPTIONS)
    c.check(cpp["status"]["id"] == 3 and cpp["stdout"] == "hello 201703 3\n", "C++17 hello → status 3", repr(cpp))


def check_slots(client, c):
    # /workers는 쓰지 않는다. 호출할 때마다 서버 컨테이너가 Resque prune_dead_workers를 돌리는데,
    # 워커 PID를 자기 컨테이너에서 찾다 못 찾아 등록을 지운다. 워커 기동 60초 뒤부터 available이 0으로 온다
    # (작업은 정상 처리된다). 그래서 실제로 함께 돈 개수를 잰다.
    tokens = [client.submit(SLOT_PROBE, PYTHON_ID) for _ in range(SLOT_PROBE_JOBS)]
    runs = [client.wait(token) for token in tokens]
    try:
        intervals = [tuple(float(v) for v in run["stdout"].split()) for run in runs]
        overlap = max_overlap(intervals)
    except (AttributeError, TypeError, ValueError):
        overlap = None
    c.check(overlap == EXPECTED_SLOTS, f"{SLOT_PROBE_JOBS}개 제출 → 동시 실행 {EXPECTED_SLOTS}개, 나머지는 대기",
            f"실제 {overlap} / {[(r['status']['id'], r['stdout']) for r in runs]!r}")


def check_rejections(client, c):
    base = client.submission_body(PY_HELLO, PYTHON_ID)
    rejected = {
        "enable_network=true": {"enable_network": True},
        "Python에 compiler_options": {"compiler_options": "-O2"},
        "command_line_arguments": {"command_line_arguments": "a"},
        "callback_url": {"callback_url": "http://example.com/"},
        "additional_files": {"additional_files": "UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA=="},
        "number_of_runs=5": {"number_of_runs": 5},
        "cpu_time_limit 상한 초과": {"cpu_time_limit": 999},
        "프로세스별 메모리 제한 켜기": {"enable_per_process_and_thread_memory_limit": True},
    }
    for label, extra in rejected.items():
        status, body = client.request("POST", "/submissions", {**base, **extra}, params={"base64_encoded": "true"})
        c.check(status == 422, f"{label} → 422", f"실제 {status} {body!r}")
    status, _ = client.request("POST", "/submissions", base, params={"base64_encoded": "true", "wait": "true"})
    c.check(status == 400, "wait=true → 400", f"실제 {status}")


SECTIONS = (
    ("[인증]", check_auth),
    ("[시스템] /system_info", check_system),
    ("[설정] /config_info 와 judge0.conf 대조", check_config),
    ("[언어]", check_languages),
    ("[실행]", check_runs),
    ("[실행 슬롯]", check_slots),
    ("[호출자가 바꿀 수 없는 값]", check_rejections),
)


def run_sections(sections, client, c):
    """구간 안의 예외는 FAIL 한 줄로 남기고 다음 구간으로 넘어간다. 접속부터 안 되면 나머지는 건너뛴다."""
    for title, section in sections:
        print(title)
        try:
            section(client, c)
        except OSError as e:  # URLError(연결 거부 등)·소켓 시간 초과
            c.check(False, "Judge0에 접속하지 못해 나머지 구간을 건너뜀", f"{client.base_url} — {e}")
            return
        except (Judge0HTTPError, PollTimeout) as e:
            c.check(False, "이 구간을 끝까지 확인하지 못함", str(e))


def main():
    env = read_kv(os.path.join(JUDGE_DIR, ".env")) if os.path.exists(os.path.join(JUDGE_DIR, ".env")) else {}
    client = Judge0Client(
        base_url=default_url(env),
        authn_token=os.environ.get("JUDGE0_AUTHN_TOKEN") or env.get("AUTHN_TOKEN"),
        authz_token=os.environ.get("JUDGE0_AUTHZ_TOKEN") or env.get("AUTHZ_TOKEN"),
    )
    c = Checker()
    print(f"접속 주소 {client.base_url}")
    run_sections(SECTIONS, client, c)

    print()
    print("smoke 통과" if c.failed == 0 else f"smoke 실패 {c.failed}건")
    return 1 if c.failed else 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Judge0 기동 확인 (#64). 채점 VM(또는 SSM 포트 포워딩한 맥)에서 실행한다.

  cd judge && python3 scripts/smoke.py

확인 항목: 인증(401/200), /config_info가 judge0.conf와 같은지, 언어 71·54, 워커 2개,
Python·C++17 hello world, 호출자가 바꾸면 안 되는 값의 거절(422/400), 권한(403).
토큰은 JUDGE0_AUTHN_TOKEN·JUDGE0_AUTHZ_TOKEN, 없으면 judge/.env의 AUTHN_TOKEN·AUTHZ_TOKEN을 쓴다.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from judge0_client import CPP_COMPILER_OPTIONS, CPP_ID, PYTHON_ID, Judge0Client  # noqa: E402

JUDGE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# judge0.conf 키와 /config_info 키의 이름이 다른 경우
CONFIG_KEY_ALIASES = {"allowed_languages_for_compiler_options": "allowed_languages_for_compile_options"}
REQUIRED_CONFIG_KEYS = (
    "enable_network", "allow_enable_network", "enable_additional_files", "enable_command_line_arguments",
    "enable_callbacks", "enable_wait_result", "number_of_runs", "max_number_of_runs",
    "allow_enable_per_process_and_thread_time_limit", "allow_enable_per_process_and_thread_memory_limit",
)
LANGUAGES = {PYTHON_ID: "Python (3.8.1)", CPP_ID: "C++ (GCC 9.2.0)"}
PY_HELLO = "import sys\nprint('hello', sys.version.split()[0])\n"
CPP_HELLO = (
    "#include <cstdio>\n#include <utility>\n"
    "int main(){ auto [a, b] = std::pair<int,int>(1, 2);\n"
    "  if constexpr (__cplusplus >= 201703L) std::printf(\"hello %ld %d\\n\", __cplusplus, a + b);\n}\n"
)


def read_kv(path):
    values = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip().strip('"')
    return values


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


def main():
    env = read_kv(os.path.join(JUDGE_DIR, ".env")) if os.path.exists(os.path.join(JUDGE_DIR, ".env")) else {}
    client = Judge0Client(
        authn_token=os.environ.get("JUDGE0_AUTHN_TOKEN") or env.get("AUTHN_TOKEN"),
        authz_token=os.environ.get("JUDGE0_AUTHZ_TOKEN") or env.get("AUTHZ_TOKEN"),
    )
    c = Checker()

    print(f"[인증] {client.base_url}")
    status, _ = client.request("GET", "/about", authn=False)
    c.check(status == 401, "토큰 없이 /about → 401", f"실제 {status}")
    status, _ = client.request("GET", "/about")
    c.check(status == 200, "토큰으로 /about → 200", f"실제 {status}")
    status, _ = client.request("GET", "/submissions")
    c.check(status == 403, "AUTHZ 없이 제출 목록 → 403", f"실제 {status}")

    print("[설정] /config_info 와 judge0.conf 대조")
    _, info = client.request("GET", "/config_info")
    info = info or {}
    conf = {k.lower(): v for k, v in read_kv(os.path.join(JUDGE_DIR, "judge0.conf")).items() if v}
    for key, expected in sorted(conf.items()):
        api_key = CONFIG_KEY_ALIASES.get(key, key)
        if api_key in info:
            c.check(normalize(info[api_key]) == expected, f"{api_key} = {expected}", f"실제 {info[api_key]!r}")
    for key in REQUIRED_CONFIG_KEYS:
        c.check(key in info and key in conf, f"{key} 대조됨")

    print("[언어·워커]")
    _, langs = client.request("GET", "/languages")
    names = {lang["id"]: lang["name"] for lang in (langs or [])}
    for lang_id, name in LANGUAGES.items():
        c.check(names.get(lang_id) == name, f"언어 {lang_id} = {name}", f"실제 {names.get(lang_id)!r}")
    _, workers = client.request("GET", "/workers")
    available = sum(q.get("available", 0) for q in (workers or []))
    c.check(available == 2, "실행 슬롯(available) 2", f"실제 {workers!r}")

    print("[실행]")
    py = client.run(PY_HELLO, PYTHON_ID)
    c.check(py["status"]["id"] == 3 and py["stdout"] == "hello 3.8.1\n", "Python hello → status 3", repr(py))
    cpp = client.run(CPP_HELLO, CPP_ID, compiler_options=CPP_COMPILER_OPTIONS)
    c.check(cpp["status"]["id"] == 3 and cpp["stdout"] == "hello 201703 3\n", "C++17 hello → status 3", repr(cpp))

    print("[호출자가 바꿀 수 없는 값]")
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

    print()
    print("smoke 통과" if c.failed == 0 else f"smoke 실패 {c.failed}건")
    return 1 if c.failed else 0


if __name__ == "__main__":
    sys.exit(main())

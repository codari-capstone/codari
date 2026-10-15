#!/usr/bin/env python3
"""Judge0 v1.13.1 HTTP 클라이언트 (표준 라이브러리만 사용).

smoke·실측·검증 스크립트가 함께 쓴다. 요청 규약은 #29(채점 실행)의 기준과 같다.
- 텍스트는 항상 base64로 주고받는다. 비UTF-8 출력이 섞여도 결과 조회가 깨지지 않는다.
- 결과는 토큰으로 폴링한다(채점 서버는 ENABLE_WAIT_RESULT=false).
- POST가 실패해도 자동으로 다시 보내지 않는다. 다시 보내면 같은 코드가 두 번 실행될 수 있다.
- 접속 주소와 토큰은 환경 변수로만 받고 출력에 남기지 않는다.

환경 변수:
  JUDGE0_URL          기본 http://127.0.0.1:2358 (SSM 포트 포워딩 기준)
  JUDGE0_AUTHN_TOKEN  X-Auth-Token
  JUDGE0_AUTHZ_TOKEN  X-Auth-User (제출 삭제·목록 조회에만 필요)

CLI 예:
  python3 judge0_client.py run --lang 71 --file hello.py
  python3 judge0_client.py run --lang 54 --file main.cpp --compiler-options "-O2 -std=c++17" --stdin input.txt
"""

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

PYTHON_ID = 71  # Python (3.8.1)
CPP_ID = 54  # C++ (GCC 9.2.0)
CPP_COMPILER_OPTIONS = "-O2 -std=c++17"

IN_QUEUE, PROCESSING = 1, 2
PENDING_STATUSES = (IN_QUEUE, PROCESSING)

# 기본 응답에는 exit_code·exit_signal·wall_time이 빠지므로 항상 명시한다.
RESULT_FIELDS = (
    "token,status,stdout,stderr,compile_output,message,"
    "time,wall_time,memory,exit_code,exit_signal,created_at,finished_at"
)
BASE64_FIELDS = ("stdout", "stderr", "compile_output", "message")


class Judge0HTTPError(Exception):
    def __init__(self, status, body):
        super().__init__(f"HTTP {status}: {body!r}")
        self.status = status
        self.body = body


class PollTimeout(Exception):
    """폴링 기한 안에 결과가 나오지 않았다. 프로그램의 시간 초과(status 5)와 다르다."""


def b64encode(text):
    if text is None:
        return None
    if isinstance(text, str):
        text = text.encode("utf-8")
    return base64.b64encode(text).decode("ascii")


def b64decode(value):
    """base64 응답을 문자열로 푼다. UTF-8이 아니면 깨진 바이트를 U+FFFD로 바꾼다."""
    if value is None:
        return None
    return base64.b64decode(value).decode("utf-8", errors="replace")


def decode_result(raw):
    result = dict(raw)
    for key in BASE64_FIELDS:
        if key in result:
            result[key] = b64decode(result[key])
    return result


class Judge0Client:
    def __init__(self, base_url=None, authn_token=None, authz_token=None, timeout=10.0):
        self.base_url = (base_url or os.environ.get("JUDGE0_URL") or "http://127.0.0.1:2358").rstrip("/")
        self.authn_token = authn_token if authn_token is not None else os.environ.get("JUDGE0_AUTHN_TOKEN")
        self.authz_token = authz_token if authz_token is not None else os.environ.get("JUDGE0_AUTHZ_TOKEN")
        self.timeout = timeout

    def request(self, method, path, body=None, params=None, authn=True, authz=False):
        """(HTTP 상태, 파싱한 JSON 또는 None)을 돌려준다. 4xx·5xx도 예외 없이 돌려준다."""
        url = self.base_url + path
        if params:
            url += "?" + urllib.parse.urlencode(params)
        headers = {"Accept": "application/json"}
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if authn and self.authn_token:
            headers["X-Auth-Token"] = self.authn_token
        if authz and self.authz_token:
            headers["X-Auth-User"] = self.authz_token
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return resp.status, _parse_json(resp.read())
        except urllib.error.HTTPError as e:
            return e.code, _parse_json(e.read())

    def _ok(self, status, payload, expected=(200, 201)):
        if status not in expected:
            raise Judge0HTTPError(status, payload)
        return payload

    def submission_body(self, source_code, language_id, stdin="", compiler_options=None, **limits):
        body = {"source_code": b64encode(source_code), "language_id": language_id, "stdin": b64encode(stdin)}
        if compiler_options:
            body["compiler_options"] = compiler_options
        body.update({k: v for k, v in limits.items() if v is not None})
        return body

    def submit(self, source_code, language_id, stdin="", compiler_options=None, **limits):
        body = self.submission_body(source_code, language_id, stdin, compiler_options, **limits)
        status, payload = self.request("POST", "/submissions", body, params={"base64_encoded": "true"})
        return self._ok(status, payload)["token"]

    def submit_batch(self, bodies):
        """submission_body()로 만든 요청 목록을 한 번에 보낸다. 항목별 토큰 또는 오류를 돌려준다."""
        status, payload = self.request(
            "POST", "/submissions/batch", {"submissions": list(bodies)}, params={"base64_encoded": "true"}
        )
        return self._ok(status, payload)

    def get(self, token, fields=RESULT_FIELDS):
        status, payload = self.request(
            "GET", f"/submissions/{token}", params={"base64_encoded": "true", "fields": fields}
        )
        return decode_result(self._ok(status, payload, expected=(200,)))

    def wait(self, token, deadline_s=60.0, interval_s=0.2, sleep=time.sleep, clock=time.monotonic):
        """최종 상태가 될 때까지 폴링한다. 기한을 넘기면 PollTimeout."""
        end = clock() + deadline_s
        while True:
            result = self.get(token)
            if result["status"]["id"] not in PENDING_STATUSES:
                return result
            if clock() >= end:
                raise PollTimeout(f"{token}: {deadline_s}초 안에 끝나지 않음 (status {result['status']['id']})")
            sleep(interval_s)

    def run(self, source_code, language_id, stdin="", compiler_options=None, deadline_s=60.0, **limits):
        token = self.submit(source_code, language_id, stdin, compiler_options, **limits)
        return self.wait(token, deadline_s=deadline_s)

    def delete(self, token):
        status, payload = self.request(
            "DELETE", f"/submissions/{token}", params={"fields": "token"}, authz=True
        )
        return self._ok(status, payload, expected=(200,))


def _parse_json(raw):
    if not raw:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        return raw.decode("utf-8", errors="replace")


def main(argv=None):
    parser = argparse.ArgumentParser(description="Judge0에 코드 하나를 제출하고 결과를 JSON으로 출력한다")
    sub = parser.add_subparsers(dest="cmd", required=True)
    run = sub.add_parser("run")
    run.add_argument("--lang", type=int, required=True, help=f"언어 ID (Python {PYTHON_ID}, C++ {CPP_ID})")
    run.add_argument("--file", required=True)
    run.add_argument("--stdin")
    run.add_argument("--compiler-options")
    run.add_argument("--cpu-time-limit", type=float)
    run.add_argument("--wall-time-limit", type=float)
    run.add_argument("--memory-limit", type=int, help="KB")
    run.add_argument("--deadline", type=float, default=60.0)
    args = parser.parse_args(argv)

    with open(args.file, encoding="utf-8") as f:
        source = f.read()
    stdin = ""
    if args.stdin:
        with open(args.stdin, encoding="utf-8") as f:
            stdin = f.read()
    result = Judge0Client().run(
        source,
        args.lang,
        stdin,
        compiler_options=args.compiler_options,
        deadline_s=args.deadline,
        cpu_time_limit=args.cpu_time_limit,
        wall_time_limit=args.wall_time_limit,
        memory_limit=args.memory_limit,
    )
    json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())

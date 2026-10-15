"""judge0_client의 요청·응답 처리 단위 테스트. Judge0 없이 돈다.

  python3 -m unittest discover -s judge/tests
"""

import base64
import io
import json
import os
import sys
import unittest
import urllib.error
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"))
import judge0_client as jc  # noqa: E402


def b64(text):
    return base64.b64encode(text if isinstance(text, bytes) else text.encode()).decode()


class FakeResponse(io.BytesIO):
    def __init__(self, status, payload):
        super().__init__(json.dumps(payload).encode() if payload is not None else b"")
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def http_error(status, body):
    return urllib.error.HTTPError("http://judge:2358", status, "error", {}, io.BytesIO(body))


class Base64Test(unittest.TestCase):
    def test_round_trip_utf8(self):
        self.assertEqual(jc.b64decode(jc.b64encode("안녕\n")), "안녕\n")

    def test_non_utf8_output_is_replaced_not_raised(self):
        self.assertEqual(jc.b64decode(b64(b"ok\xff\n")), "ok�\n")

    def test_decode_result_only_touches_text_fields(self):
        raw = {"stdout": b64("1\n"), "stderr": None, "time": "0.01", "status": {"id": 3}}
        result = jc.decode_result(raw)
        self.assertEqual(result["stdout"], "1\n")
        self.assertIsNone(result["stderr"])
        self.assertEqual(result["time"], "0.01")


class SubmissionBodyTest(unittest.TestCase):
    def test_omits_unset_limits_and_options(self):
        body = jc.Judge0Client(authn_token="t").submission_body("print(1)", jc.PYTHON_ID, cpu_time_limit=None)
        self.assertEqual(set(body), {"source_code", "language_id", "stdin"})
        self.assertEqual(base64.b64decode(body["source_code"]).decode(), "print(1)")

    def test_keeps_compiler_options_and_limits(self):
        body = jc.Judge0Client(authn_token="t").submission_body(
            "int main(){}", jc.CPP_ID, compiler_options=jc.CPP_COMPILER_OPTIONS, memory_limit=262144
        )
        self.assertEqual(body["compiler_options"], "-O2 -std=c++17")
        self.assertEqual(body["memory_limit"], 262144)


class RequestTest(unittest.TestCase):
    def setUp(self):
        self.client = jc.Judge0Client("http://judge:2358/", authn_token="authn", authz_token="authz")

    def test_sends_auth_headers_and_base64_flag(self):
        with mock.patch("urllib.request.urlopen", return_value=FakeResponse(201, {"token": "abc"})) as urlopen:
            self.assertEqual(self.client.submit("print(1)", jc.PYTHON_ID), "abc")
        req = urlopen.call_args[0][0]
        self.assertEqual(req.full_url, "http://judge:2358/submissions?base64_encoded=true")
        self.assertEqual(req.get_header("X-auth-token"), "authn")
        self.assertIsNone(req.get_header("X-auth-user"))

    def test_authz_header_only_when_asked(self):
        with mock.patch("urllib.request.urlopen", return_value=FakeResponse(200, {"token": "abc"})) as urlopen:
            self.client.delete("abc")
        self.assertEqual(urlopen.call_args[0][0].get_header("X-auth-user"), "authz")

    def test_http_error_is_returned_then_raised_by_submit(self):
        body = b'{"enable_network":["x"]}'
        with mock.patch("urllib.request.urlopen", side_effect=lambda *a, **k: _raise(http_error(422, body))) as urlopen:
            status, payload = self.client.request("POST", "/submissions", {})
            self.assertEqual((status, payload), (422, {"enable_network": ["x"]}))
            with self.assertRaises(jc.Judge0HTTPError) as ctx:
                self.client.submit("x", jc.PYTHON_ID)
        self.assertEqual(ctx.exception.status, 422)
        # 실패한 POST를 스스로 다시 보내지 않는다 (request 1회 + submit 1회)
        self.assertEqual(urlopen.call_count, 2)


def _raise(exc):
    raise exc


class WaitTest(unittest.TestCase):
    def make_client(self, statuses):
        client = jc.Judge0Client(authn_token="t")
        client.get = mock.Mock(side_effect=[{"status": {"id": s}} for s in statuses])
        return client

    def test_polls_until_final_status(self):
        client = self.make_client([1, 2, 2, 3])
        sleeps = []
        result = client.wait("tok", sleep=sleeps.append, clock=lambda: 0.0)
        self.assertEqual(result["status"]["id"], 3)
        self.assertEqual(len(sleeps), 3)

    def test_runtime_statuses_are_final(self):
        for final in (5, 6, 7, 11, 13, 14):
            client = self.make_client([1, final])
            self.assertEqual(client.wait("tok", sleep=lambda _: None, clock=lambda: 0.0)["status"]["id"], final)

    def test_deadline_raises_poll_timeout_not_tle(self):
        client = self.make_client([2, 2, 2])
        ticks = iter([0.0, 0.5, 1.5, 2.5])
        with self.assertRaises(jc.PollTimeout):
            client.wait("tok", deadline_s=1.0, sleep=lambda _: None, clock=lambda: next(ticks))


if __name__ == "__main__":
    unittest.main()

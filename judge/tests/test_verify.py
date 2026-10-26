"""verify/run_verify.py·concurrency_check.py의 판정 로직 단위 테스트. Judge0 없이 돈다."""

import http.client
import os
import sys
import time
import unittest

JUDGE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(JUDGE_DIR, "verify"))
sys.path.insert(0, os.path.join(JUDGE_DIR, "scripts"))
import concurrency_check as cc  # noqa: E402
import run_verify as rv  # noqa: E402


def result(status, stdout="", stderr="", exit_code=0):
    return {"status": {"id": status}, "stdout": stdout, "stderr": stderr, "exit_code": exit_code}


class EvaluateTest(unittest.TestCase):
    def test_status_and_exit_code(self):
        case = {"expect": {"status": [11], "exit_code": [137]}}
        self.assertEqual(rv.evaluate(case, result(11, exit_code=137)), (True, []))
        ok, reasons = rv.evaluate(case, result(11, exit_code=1))
        self.assertFalse(ok)
        self.assertIn("exit_code 1", reasons[0])

    def test_status_not_rejects_accepted_and_judge_errors(self):
        case = {"expect": {"status_not": [3, 13, 14]}}
        self.assertTrue(rv.evaluate(case, result(11))[0])
        self.assertFalse(rv.evaluate(case, result(3))[0])

    def test_stdout_and_stderr_text(self):
        case = {"expect": {"stdout_not": ["REACHED"], "stderr_has": ["RecursionError"]}}
        self.assertTrue(rv.evaluate(case, result(11, "a BLOCKED\n", "RecursionError: x"))[0])
        self.assertFalse(rv.evaluate(case, result(11, "a REACHED\n", "RecursionError: x"))[0])


class ProbeTest(unittest.TestCase):
    def test_probe_lines_and_control_summary(self):
        sandbox = rv.probe_lines("dns BLOCKED gaierror\ntcp BLOCKED OSError\nnoise line\n")
        self.assertEqual(sandbox, {"dns": "BLOCKED", "tcp": "BLOCKED"})
        summary = rv.control_summary(sandbox, {"dns": "REACHED", "tcp": "BLOCKED"})
        self.assertIn("dns: 차단 확인", summary)
        self.assertIn("tcp: 호스트도 닿지 않아 대조 불가", summary)

    def test_control_needs_a_target_the_host_reaches(self):
        sandbox = {"dns": "BLOCKED", "tcp": "BLOCKED"}
        self.assertEqual(rv.confirmed_targets(sandbox, {"dns": "REACHED", "tcp": "BLOCKED"}), 1)
        # 호스트도 아무 데도 닿지 않으면 차단의 근거가 없다
        self.assertEqual(rv.confirmed_targets(sandbox, {"dns": "BLOCKED", "tcp": "BLOCKED"}), 0)

    def test_failure_reason_has_no_token(self):
        self.assertEqual(rv.failure(rv.PollTimeout("0f3c-token: 600초 안에 끝나지 않음")), "PollTimeout")
        self.assertEqual(rv.failure(rv.Judge0HTTPError(422, {"x": 1})), "HTTP 422")

    def test_last_line_skips_blank_lines(self):
        self.assertEqual(rv.last_line("a\nIndexError: x\n \n"), "IndexError: x")


class OverlapTest(unittest.TestCase):
    def test_two_slots(self):
        self.assertEqual(cc.max_overlap([(0, 2), (0.1, 2), (2.1, 4), (2.2, 4)]), 2)

    def test_touching_intervals_do_not_overlap(self):
        self.assertEqual(cc.max_overlap([(0, 1), (1, 2)]), 1)


class SamplerTest(unittest.TestCase):
    def test_queue_errors_do_not_stop_sampling(self):
        class Failing:
            def request(self, method, path):
                # OSError가 아닌 http.client 예외도 큐 조회 실패로만 센다
                raise http.client.IncompleteRead(b"")

        sampler = cc.Sampler(Failing())
        sampler.start()
        time.sleep(0.25)
        sampler.join()
        self.assertIsNone(sampler.error)
        self.assertGreater(sampler.queue_errors, 0)


if __name__ == "__main__":
    unittest.main()

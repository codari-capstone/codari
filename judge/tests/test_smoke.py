"""smoke.py의 순수 함수 테스트. Judge0 없이 돈다: python3 -m unittest discover -s judge/tests"""

import contextlib
import io
import os
import sys
import unittest
import urllib.error
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"))
import smoke  # noqa: E402


class MaxOverlapTest(unittest.TestCase):
    def test_two_slots_third_waits(self):
        self.assertEqual(smoke.max_overlap([(0.0, 2.1), (0.05, 2.2), (2.15, 4.3)]), 2)

    def test_serial(self):
        self.assertEqual(smoke.max_overlap([(0.0, 2.0), (2.0, 4.0), (4.0, 6.0)]), 1)

    def test_all_parallel(self):
        self.assertEqual(smoke.max_overlap([(0.0, 2.0), (0.1, 2.1), (0.2, 2.2)]), 3)

    def test_empty(self):
        self.assertEqual(smoke.max_overlap([]), 0)


class NormalizeTest(unittest.TestCase):
    def test_values_match_conf_text(self):
        self.assertEqual(smoke.normalize(False), "false")
        self.assertEqual(smoke.normalize(20.0), "20")
        self.assertEqual(smoke.normalize(0.5), "0.5")
        self.assertEqual(smoke.normalize(["C", "C++"]), "C C++")


class DefaultUrlTest(unittest.TestCase):
    def test_uses_bind_addr_from_env_file(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertEqual(smoke.default_url({"JUDGE0_BIND_ADDR": "10.0.1.5"}), "http://10.0.1.5:2358")
            self.assertEqual(smoke.default_url({}), "http://127.0.0.1:2358")

    def test_judge0_url_wins(self):
        with mock.patch.dict(os.environ, {"JUDGE0_URL": "http://127.0.0.1:12358"}, clear=True):
            self.assertEqual(smoke.default_url({"JUDGE0_BIND_ADDR": "10.0.1.5"}), "http://127.0.0.1:12358")


class RunSectionsTest(unittest.TestCase):
    def run_quietly(self, sections):
        checker, ran = smoke.Checker(), []
        client = mock.Mock(base_url="http://judge:2358")
        with contextlib.redirect_stdout(io.StringIO()):
            smoke.run_sections([(name, lambda cl, c, f=fn, n=name: (ran.append(n), f())) for name, fn in sections],
                               client, checker)
        return checker.failed, ran

    def test_http_error_fails_section_and_continues(self):
        def unauthorized():
            raise smoke.Judge0HTTPError(401, None)
        failed, ran = self.run_quietly([("a", unauthorized), ("b", lambda: None)])
        self.assertEqual((failed, ran), (1, ["a", "b"]))

    def test_connection_error_skips_remaining_sections(self):
        def refused():
            raise urllib.error.URLError("refused")
        failed, ran = self.run_quietly([("a", refused), ("b", lambda: None)])
        self.assertEqual((failed, ran), (1, ["a"]))


if __name__ == "__main__":
    unittest.main()

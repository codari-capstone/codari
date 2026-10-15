"""bench/run_bench.py의 보정식 평가와 입력 생성 단위 테스트. Judge0 없이 돈다."""

import os
import sys
import unittest

JUDGE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(JUDGE_DIR, "bench"))
sys.path.insert(0, os.path.join(JUDGE_DIR, "scripts"))
import gen_input  # noqa: E402
import run_bench as rb  # noqa: E402


class BaseLimitTest(unittest.TestCase):
    def test_minimum_one_second(self):
        self.assertEqual(rb.cpp_base_limit(0.03), 1.0)

    def test_twice_max_rounded_up_to_half_second(self):
        self.assertEqual(rb.cpp_base_limit(0.6), 1.5)  # 1.2 → 1.5
        self.assertEqual(rb.cpp_base_limit(1.0), 2.0)


class EvaluateRowTest(unittest.TestCase):
    def test_python_limit_and_pass(self):
        row = rb.evaluate_row({"time": [2.0, 3.0, 4.0], "memory": [100, 120]},
                              {"time": [0.3, 0.4, 0.5], "memory": [50, 60]})
        self.assertEqual(row["cpp_limit"], 1.0)
        self.assertEqual(row["py_limit"], 5.0)  # 3 × 1 + 2
        self.assertTrue(row["py_passes"])
        self.assertAlmostEqual(row["time_ratio"], 3.0 / 0.4)

    def test_fails_when_python_max_exceeds_limit(self):
        row = rb.evaluate_row({"time": [4.0, 5.5], "memory": [1]}, {"time": [0.2, 0.3], "memory": [1]})
        self.assertFalse(row["py_passes"])


class GenInputTest(unittest.TestCase):
    def test_deterministic_and_sized(self):
        a = gen_input.make_input("io_sort_prefix", 1000)
        self.assertEqual(a, gen_input.make_input("io_sort_prefix", 1000))
        self.assertEqual(len(a.split()), 1001)

    def test_every_workload_has_both_languages(self):
        for workload in gen_input.SIZES:
            for ext in (".py", ".cpp"):
                self.assertTrue(os.path.exists(os.path.join(JUDGE_DIR, "bench", "workloads", workload + ext)), workload + ext)


if __name__ == "__main__":
    unittest.main()

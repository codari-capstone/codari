"""smoke.py의 순수 함수 테스트. Judge0 없이 돈다: python3 -m unittest discover -s judge/tests"""

import os
import sys
import unittest

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


if __name__ == "__main__":
    unittest.main()

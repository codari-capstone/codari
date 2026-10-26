"""실측 워크로드의 입력을 만든다. 같은 (워크로드, 크기)는 항상 같은 입력이다(고정 시드)."""

import random

SEED = 20261015

# 워크로드별 입력 크기 3단계(소·중·대). empty는 언어 기본 비용(시작·종료) 측정용이다.
SIZES = {
    "io_sort_prefix": [10**4, 10**5, 10**6],  # 정수 N개 읽기 → 정렬 → 누적합
    "nested_loop": [1000, 2000, 4000],  # O(N²) 순수 반복
    "dict_count": [10**4, 10**5, 10**6],  # 해시 맵 빈도 집계
    "recursion_dfs": [1000, 10000, 50000],  # 깊이 N 재귀
    "io_print": [10**4, 5 * 10**4, 10**5],  # N줄 출력
    "empty": [0],
}


def make_input(workload, n):
    rng = random.Random(SEED + n)
    if workload == "io_sort_prefix":
        return f"{n}\n" + " ".join(str(rng.randrange(10**9)) for _ in range(n)) + "\n"
    if workload == "dict_count":
        keys = max(1, n // 10)
        return f"{n}\n" + " ".join(str(rng.randrange(keys)) for _ in range(n)) + "\n"
    if workload == "empty":
        return ""
    return f"{n}\n"

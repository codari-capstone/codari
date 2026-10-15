import sys

sys.setrecursionlimit(10**6)


def depth_sum(k):
    return 0 if k == 0 else depth_sum(k - 1) + k % 1000


print(depth_sum(int(input())))

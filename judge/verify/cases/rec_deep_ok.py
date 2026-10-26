import sys

sys.setrecursionlimit(10**6)


def f(n):
    return 0 if n == 0 else f(n - 1) + 1


print(f(10**5))

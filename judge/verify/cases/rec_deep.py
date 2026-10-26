import sys

sys.setrecursionlimit(10**7)


def f(n):
    return f(n + 1) + 1


f(0)

import sys

data = sys.stdin.buffer.read().split()
n = int(data[0])
a = sorted(map(int, data[1 : n + 1]))
mod = 1_000_000_007
prefix = total = 0
for x in a:
    prefix += x
    total = (total + prefix) % mod
print(total)

import sys

data = sys.stdin.buffer.read().split()
n = int(data[0])
count = {}
for x in data[1 : n + 1]:
    k = int(x)
    count[k] = count.get(k, 0) + 1
print(len(count), max(count.values()))

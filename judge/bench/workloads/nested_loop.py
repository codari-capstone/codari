n = int(input())
s = 0
for i in range(n):
    for j in range(n):
        s += (i * j) % 7
print(s)

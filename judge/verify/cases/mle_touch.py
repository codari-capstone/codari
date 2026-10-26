b = bytearray(512 * 1024 * 1024)
for i in range(0, len(b), 4096):
    b[i] = 1
print(len(b))

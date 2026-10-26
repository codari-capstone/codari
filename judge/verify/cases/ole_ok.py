import sys

sys.stdout.write(("x" * 99 + "\n") * 9000)  # 900,000 바이트, 제한 1024 KB 미만

import os
import time

children = []
for i in range(100):
    try:
        pid = os.fork()
    except OSError as e:
        print("fork BLOCKED after", len(children), type(e).__name__)
        break
    if pid == 0:
        time.sleep(1)
        os._exit(0)
    children.append(pid)
else:
    print("fork REACHED", len(children))
for pid in children:
    os.waitpid(pid, 0)

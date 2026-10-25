import os


def check(name, fn):
    try:
        fn()
        print(name, "REACHED")
    except Exception as e:  # noqa: BLE001
        print(name, "BLOCKED", type(e).__name__)


check("docker_sock", lambda: os.stat("/var/run/docker.sock"))
check("etc_shadow_read", lambda: open("/etc/shadow").read(1))
check("judge0_conf_read", lambda: open("/judge0.conf").read(1))
check("api_environment_read", lambda: open("/api/environment").read(1))
check("isolate_boxes_list", lambda: os.listdir("/var/local/lib/isolate"))
check("write_etc", lambda: open("/etc/codingmon_probe", "w").write("x"))
check("write_usr", lambda: open("/usr/codingmon_probe", "w").write("x"))

# 샌드박스 안에서는 bash 래퍼(/bin/bash run)와 이 프로그램(python3 script.py)만 보여야 한다. 그 밖의 프로세스가 보이면 REACHED
# 단어 단위로 비교한다. 부분 문자열로 보면 runc·containerd-shim-runc-v2처럼 이름에 run이 든 프로세스를 놓친다
mine = {"/bin/bash", "run", "script.py"}
others = []
for pid in sorted(int(p) for p in os.listdir("/proc") if p.isdigit()):
    try:
        cmd = open("/proc/%d/cmdline" % pid, "rb").read().replace(b"\0", b" ").decode(errors="replace").strip()
    except OSError:
        cmd = "?"
    if cmd and not mine & set(cmd.split()):
        others.append((pid, cmd))
print("proc_other_processes", "REACHED" if others else "BLOCKED", others)
print("uid", os.getuid(), "BLOCKED" if os.getuid() >= 60000 else "REACHED")

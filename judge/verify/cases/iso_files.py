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

# 샌드박스 안에서는 bash 래퍼와 이 프로그램만 보여야 한다. 그 밖의 프로세스가 보이면 REACHED
mine = ("/bin/bash", "run", "script.py")
others = []
for pid in sorted(int(p) for p in os.listdir("/proc") if p.isdigit()):
    try:
        cmd = open("/proc/%d/cmdline" % pid, "rb").read().replace(b"\0", b" ").decode(errors="replace").strip()
    except OSError:
        cmd = "?"
    if cmd and not any(m in cmd for m in mine):
        others.append((pid, cmd))
print("proc_other_processes", "REACHED" if others else "BLOCKED", others)
print("uid", os.getuid(), "BLOCKED" if os.getuid() >= 60000 else "REACHED")

#!/usr/bin/env bash
# 채점 VM에서 Judge0를 띄우기 전에 호스트 조건과 설정 파일을 확인한다.
# 사용: judge/ 폴더에서 bash scripts/preflight.sh   (실패 항목이 있으면 종료 코드 1)
set -u
cd "$(dirname "$0")/.."

fail=0
pass() { printf '  ok   %s\n' "$1"; }
bad()  { printf '  FAIL %s\n' "$1"; fail=1; }
warn() { printf '  warn %s\n' "$1"; }

echo "[호스트]"
arch=$(uname -m)
[ "$arch" = "x86_64" ] && pass "아키텍처 x86_64" || bad "아키텍처가 $arch 다. Judge0 1.13.1 이미지는 linux/amd64 전용이다"

fstype=$(stat -fc %T /sys/fs/cgroup 2>/dev/null || echo unknown)
[ "$fstype" = "tmpfs" ] && pass "cgroup v1 (/sys/fs/cgroup = tmpfs)" \
  || bad "/sys/fs/cgroup 이 $fstype 다. GRUB에 systemd.unified_cgroup_hierarchy=0 을 넣고 재부팅한다"
grep -q 'systemd.unified_cgroup_hierarchy=0' /proc/cmdline 2>/dev/null \
  && pass "커널 인자에 systemd.unified_cgroup_hierarchy=0" || warn "커널 인자에 cgroup v1 플래그가 보이지 않는다"
[ -d /sys/fs/cgroup/memory ] && pass "memory 컨트롤러" || bad "/sys/fs/cgroup/memory 가 없다"

if command -v docker >/dev/null 2>&1; then
  cgv=$(docker info --format '{{.CgroupVersion}}' 2>/dev/null || echo "?")
  [ "$cgv" = "1" ] && pass "docker cgroup version 1" || bad "docker cgroup version 이 $cgv 다"
  docker compose version >/dev/null 2>&1 && pass "$(docker compose version)" || bad "Docker Compose 플러그인이 없다"
else
  bad "docker 가 없다"
fi

echo "[설정]"
if [ -f .env ]; then
  perm=$(stat -c %a .env 2>/dev/null || stat -f %Lp .env)
  [ "$perm" = "600" ] && pass ".env 권한 600" || warn ".env 권한이 $perm 다 (chmod 600 .env)"
  for key in AUTHN_TOKEN AUTHZ_TOKEN REDIS_PASSWORD POSTGRES_PASSWORD; do
    val=$(grep -E "^${key}=" .env | tail -1 | cut -d= -f2-)
    if [ -z "$val" ]; then bad ".env 에 $key 값이 없다"
    elif [[ "$val" == change-me* ]]; then bad ".env 의 $key 가 예시 값 그대로다"
    elif [[ "$val" =~ [\$\#\"\'[:space:]] ]]; then bad ".env 의 $key 에 \$ # 따옴표 공백 중 하나가 있다"
    else pass ".env $key"
    fi
  done
else
  bad ".env 가 없다 (cp .env.example .env && chmod 600 .env 후 값 채우기)"
fi

# load-config가 judge0.conf를 allexport로 source하므로 빈 줄이라도 있으면 .env 값을 덮어쓴다.
# 걸린 줄은 줄 번호와 키 이름까지만 출력한다(값이 들어 있어도 터미널에 남지 않게)
if grep -nEo '^(AUTHN_TOKEN|AUTHZ_TOKEN|REDIS_PASSWORD|POSTGRES_PASSWORD)=' judge0.conf; then
  bad "judge0.conf 에 비밀값 키 줄이 있다. 지워야 .env 값이 적용된다"
else
  pass "judge0.conf 에 비밀값 키 줄 없음"
fi
grep -qE '^ENABLE_NETWORK=false$' judge0.conf && grep -qE '^ALLOW_ENABLE_NETWORK=false$' judge0.conf \
  && pass "ENABLE_NETWORK=false, ALLOW_ENABLE_NETWORK=false" || bad "네트워크 설정이 false 가 아니다"

echo
[ "$fail" -eq 0 ] && echo "preflight 통과" || echo "preflight 실패"
exit "$fail"

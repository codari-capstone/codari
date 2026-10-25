# judge

Judge0 v1.13.1 자체 호스팅 설정. 제출 코드를 웹·API 서버와 분리된 채점 VM에서 실행한다.

- 버전과 이미지를 digest까지 고정한다. 공식 compose 파일은 judge0 이미지를 `latest`로 적어 두므로 그대로 쓰지 않는다.
- 샌드박스 네트워크를 끈다(`ENABLE_NETWORK=false`, `ALLOW_ENABLE_NETWORK=false`).
- 시간·메모리 제한, 컴파일 옵션, 네트워크, 추가 파일은 API 서버가 정한다. 브라우저에서 온 값은 Judge0에 넘기지 않는다.
- 채점 VM에는 서비스 DB 자격 증명과 AI 키를 두지 않는다.
- Judge0 1.13.1 이미지는 linux/amd64 전용이고 cgroup v1 호스트가 필요하다. 맥에서는 Docker Desktop을 cgroup v1 모드로 바꿔 기능 확인용으로만 띄운다("맥(Apple Silicon)에서 실행" 절).

## 파일

| 경로 | 내용 |
|---|---|
| `docker-compose.yml` | server·workers·내부 PostgreSQL·Redis. 이미지 digest 고정, 2358은 `JUDGE0_BIND_ADDR`에만 게시. privileged는 샌드박스를 돌리는 workers에만, API 토큰은 HTTP를 받는 server에만 준다 |
| `judge0.conf` | 공식 `judge0.conf` 원문에 아래 "설정 요약"의 값을 넣은 파일. 비밀값 키는 없다 |
| `judge0-scripts/` | 1.13.1 이미지의 `scripts/server`·`scripts/workers` 사본. 환경 변수를 로그로 출력하는 한 줄만 막았다 |
| `.env.example` | 비밀값 견본. VM에서 `.env`로 복사해 채운다(저장소에 올리지 않는다) |
| `scripts/preflight.sh` | 기동 전 확인: x86_64, cgroup v1, Docker·Compose, `.env`, conf에 비밀값 키가 없는지 |
| `scripts/smoke.py` | 기동 후 확인: 인증(`/about`), AUTHZ(403·삭제 200), `/system_info`, `/config_info`와 conf 대조, 언어 71·54, hello world, 동시 실행 `COUNT`개, 금지 요청 거절 |
| `scripts/judge0_client.py` | 표준 라이브러리 클라이언트. smoke·실측·검증이 함께 쓴다 |
| `bench/` | 실행 시간·메모리 실측(#65): 워크로드 `workloads/`, 입력 생성 `gen_input.py`, 실행기 `run_bench.py`, 결과 `results/` |
| `verify/` | 격리·자원 제한 검증(#66): 케이스 `cases/`·`cases.json`, 실행기 `run_verify.py`, 동시 실행 `concurrency_check.py`, 결과 `results/`, 케이스별 응답 `observed/` |
| `tests/` | 클라이언트·smoke·검증 로직 단위 테스트 (`python3 -m unittest discover -s judge/tests`) |

## 채점 VM 준비

2026-10-25 서울 리전(ap-northeast-2)에 만든 VM이다. 계획서는 judge 서버를 t3.small로 시작한다고 했지만, t3.small(메모리 2 GB)에서는 실행 슬롯 2개가 동시에 C++를 컴파일하거나 메모리를 많이 쓰면 호스트 여유 메모리가 기준(256 MiB) 아래로 떨어져 같은 날 t3.medium으로 키웠다(아래 "동시 실행" 표).

| 항목 | 값 |
|---|---|
| 인스턴스 | t3.medium (2 vCPU, 메모리 4 GB, 스왑 없음), Intel Xeon Platinum 8259CL. CPU 크레딧 `unlimited`라 크레딧이 떨어져도 느려지지 않고 초과분이 과금된다 |
| OS | Ubuntu 22.04.5 LTS (커널 6.8.0-1066-aws), 루트 gp3 20 GB, IMDSv2만 허용 |
| Docker | Engine 29.9.2, Compose v5.6.1 (Docker 공식 apt 저장소) |
| 태그 | `Name=codingmon-judge`, `Project=codingmon` |
| 보안 그룹 | `codingmon-judge`. 22만 허용한 IP(/32)에서 연다. 2358은 열지 않는다. API 서버가 생기면 2358에 API 서버의 보안 그룹만 더한다(아래 3번) |

접속 주소와 SSH 키는 저장소에 두지 않고 팀 비공개 채널로 공유한다. 공인 IP는 인스턴스를 멈췄다 켜면 바뀐다.

1. cgroup v1로 바꾼다. Ubuntu 22.04는 기본이 cgroup v2라 그대로 두면 isolate가 `/box`를 만들지 못한다.

   ```bash
   sudo sed -i 's/^GRUB_CMDLINE_LINUX="/GRUB_CMDLINE_LINUX="systemd.unified_cgroup_hierarchy=0 /' /etc/default/grub
   sudo update-grub && sudo reboot
   stat -fc %T /sys/fs/cgroup          # tmpfs면 cgroup v1 (cgroup2fs면 v2)
   ```

2. Docker Engine과 Compose 플러그인을 Docker 공식 apt 저장소에서 설치하고 `ubuntu` 사용자를 `docker` 그룹에 넣는다([설치 안내](https://docs.docker.com/engine/install/ubuntu/)). `docker info --format '{{.CgroupVersion}}'`이 `1`이어야 한다. Docker 29는 cgroup v1 지원을 늦어도 2029년 5월에 없앤다고 경고하지만 이번 운영 기간과는 상관없다.
3. 아래 "설치·기동"대로 띄운다. API 서버가 생기기 전에는 `.env`의 `JUDGE0_BIND_ADDR`를 `127.0.0.1`로 둔다. VM 밖에서는 보안 그룹과 상관없이 2358에 닿지 않고, 개발 중인 맥은 SSH 터널로 붙는다: `ssh -i <키> -N -L 2358:127.0.0.1:2358 ubuntu@<공인 IP>` 뒤 `JUDGE0_URL=http://127.0.0.1:2358`.
   - API 서버가 생기면 `JUDGE0_BIND_ADDR`를 VM 사설 IP(`hostname -I`의 첫 값)로 바꾸고, 보안 그룹의 2358에 API 서버 보안 그룹만 더한다.
   - 이때부터는 보안 그룹이 유일한 차단이다. EC2는 공인 IP로 온 연결을 사설 IP로 바꿔 넘기므로(VM 인터페이스에는 사설 IP만 있다), 사설 IP 바인딩만으로는 인터넷 접속이 막히지 않는다. 2358 규칙을 IP 대역으로 넓히지 않는다.
4. `judge0.conf`의 `ALLOW_IP`는 비워 둔다. 주소 제한은 보안 그룹 한 곳에서 하고, Judge0에는 토큰 인증(`AUTHN_TOKEN`)만 둔다.

2026-10-25 방화벽 확인:

| 확인 | 결과 |
|---|---|
| 허용한 IP → 공인 IP:2358 | 연결 안 됨 (보안 그룹에 2358 규칙 없음, 127.0.0.1 바인딩) |
| VM 안에서 사설 IP:2358 (같은 VPC 서버 자리) | 연결 안 됨 (127.0.0.1에만 바인딩) |
| 허용한 IP → SSH 터널 → 127.0.0.1:2358, 토큰 있음 | 200 |
| SSH 터널, 토큰 없음 | 401 |
| 다른 호스트(VM이 자기 공인 IP로) → 22 · 2358 | 둘 다 연결 안 됨 |

## 설치·기동

준비된 VM에서:

```bash
git clone https://github.com/codari-capstone/codingmon.git ~/codingmon
cd ~/codingmon/judge
cp .env.example .env && chmod 600 .env
# .env의 네 비밀값을 각각 `openssl rand -hex 24` 결과로 바꾼다. 따옴표·$·#는 쓰지 않는다
bash scripts/preflight.sh
docker compose pull
docker compose up -d          # db·redis healthcheck가 통과한 뒤 server·workers가 뜬다
python3 scripts/smoke.py      # server가 응답할 때까지 최대 3분 기다린 뒤 검사한다. 종료 코드 0이면 통과
```

compose는 네 비밀값을 `.env`에서 보간하는데, 셸에 같은 이름이 export돼 있으면 그 값을 먼저 쓴다. 이 네 이름은 셸에 export하지 않는다.

smoke는 `JUDGE0_URL`이 없으면 `.env`의 `JUDGE0_BIND_ADDR`(2358을 게시한 주소)로 접속한다. SSM 포트 포워딩으로 맥에서 돌릴 때는 `JUDGE0_URL=http://127.0.0.1:<로컬 포트>`와 토큰 환경 변수(`JUDGE0_AUTHN_TOKEN`·`JUDGE0_AUTHZ_TOKEN`)를 준다.

`depends_on` healthcheck로 기동이 안 되면 `docker compose ps`와 `docker compose logs db redis`로 원인을 본다. 그다음 공식 릴리스 노트의 순서로 띄운다: `docker compose up -d db redis` → 둘이 `healthy`가 된 것을 `docker compose ps`로 확인 → `docker compose up -d`.

## 맥(Apple Silicon)에서 실행

Docker Desktop은 기본이 cgroup v2라 그대로는 isolate 샌드박스가 동작하지 않는다. cgroup v1 모드로 바꾸면 이 폴더의 설정 그대로 띄울 수 있다(amd64 이미지는 Rosetta로 실행된다). Docker Desktop 4.95에서 확인했다.

1. Docker Desktop을 종료하고 `~/Library/Group Containers/group.com.docker/settings-store.json`에 `"DeprecatedCgroupv1": true`를 추가한 뒤 다시 실행한다.
2. `docker info --format '{{.CgroupVersion}}'`이 `1`인지 확인한다.
3. 위 "설치·기동"과 같이 `.env`를 만들고 `docker compose up -d`, `python3 scripts/smoke.py`를 실행한다. `preflight.sh`는 호스트가 x86_64인지 검사하는 VM용이라 맥에서는 실패한다.

이 설정은 맥의 모든 컨테이너에 적용된다. 되돌리려면 키를 지우고 Docker Desktop을 다시 시작한다.

맥에서 띄운 Judge0는 기능 확인과 격리·판정 동작 관찰에 쓴다. 실행 시간·메모리 실측과 실행 슬롯 2개의 메모리 여유는 Apple 칩·Rosetta 번역 때문에 서버와 값이 다르므로 amd64 채점 VM에서 잰다.

## 운영 명령

| 할 일 | 명령 (`judge/`에서) |
|---|---|
| 상태 | `docker compose ps` |
| 로그 | `docker compose logs -f --tail 100 server workers` |
| 워커만 재시작 | `docker compose restart workers` |
| 중지 (Judge0 DB 보존) | `docker compose down` — Redis 큐는 보존하지 않는다(공식 구성과 같음). 대기 중이던 제출은 status 1(In Queue), 실행 중이던 제출은 status 2(Processing)에 멈춘 채 남는다. API 서버의 새 제출을 멈추고, 보낸 제출의 결과가 모두 나온 것을 확인한 뒤 중지한다(`/workers`는 근거로 쓰지 않는다) |
| 다시 시작 | `docker compose up -d`. `judge0-scripts/`나 `judge0.conf`만 바꿨다면 `docker compose up -d --force-recreate server workers` — 두 파일은 마운트라 내용만 바뀌면 compose가 컨테이너를 다시 만들지 않는다 |
| Judge0 DB까지 삭제 | `docker compose down -v` — 제출 기록이 모두 지워진다. 일반 중지에 쓰지 않는다 |

공식 시작 스크립트는 `export | sudo tee /api/environment`로 환경 변수 전체(토큰·비밀번호 포함)를 로그에도 출력한다. 그래서 `judge0-scripts/`의 사본을 읽기 전용으로 마운트해 파일에만 쓰게 한다(cron이 이 파일을 읽는다). 이미지를 바꿀 때는 새 이미지의 두 스크립트와 비교해 사본을 다시 만든다.

`GET /workers`는 워커 상태 확인에 쓰지 않는다. 호출할 때마다 서버 컨테이너가 Resque의 `prune_dead_workers`를 실행하는데, 워커 PID를 자기 컨테이너에서 찾다 못 찾으면 등록을 지운다. 그래서 워커가 뜬 지 60초가 지나면 `available`이 0으로 나온다. 작업은 계속 정상 처리된다. 워커가 살아 있는지는 `docker compose ps`와 실제 제출로 확인한다(smoke의 "실행 슬롯" 항목).

## 설정 요약

`judge0.conf`에서 공식 기본값과 다르게 둔 값이다. `scripts/smoke.py`가 기동 후 `/config_info`와 이 파일을 대조한다. `/config_info`가 내보내지 않는 키(`COUNT`, `JUDGE0_TELEMETRY_ENABLE`, `RAILS_SERVER_PROCESSES`, DB·Redis 접속 키)는 smoke가 목록으로만 보여 준다. `COUNT`는 smoke의 실행 슬롯 항목이 따로 확인한다.

| 변수 | 값 | 공식 기본값 | 이유 |
|---|---|---|---|
| `ENABLE_NETWORK` / `ALLOW_ENABLE_NETWORK` | false / false | false / true | 샌드박스 네트워크 차단. 요청으로 켤 수 없게 한다 |
| `ENABLE_ADDITIONAL_FILES` | false | true | 쓰지 않는 기능. 공격 면 축소 |
| `ENABLE_COMMAND_LINE_ARGUMENTS` | false | true | 〃 |
| `ENABLE_CALLBACKS` | false | true | 채점 서버가 외부로 요청을 보내지 않게 한다 |
| `ENABLE_WAIT_RESULT` | false | true | API 서버는 토큰으로 폴링한다 |
| `ENABLE_COMPILER_OPTIONS` / `ALLOWED_LANGUAGES_FOR_COMPILER_OPTIONS` | true / `C++` | true / 전체 | GCC 9.2 기본 표준이 gnu++14라 C++17에 옵션이 필요하다. API 서버만 `-O2 -std=c++17`을 보낸다. 이름 접두어 일치라 Python에 옵션을 보내면 422 |
| `ALLOW_ENABLE_PER_PROCESS_AND_THREAD_TIME_LIMIT` / `…_MEMORY_LIMIT` | false / false | true / true | 켜면 isolate가 cgroup 대신 주소 공간 제한(`-m`)을 써서 메모리 측정 기준이 바뀐다 |
| `COUNT` | 2 | 2×nproc | 실행 슬롯 2개 |
| `MAX_QUEUE_SIZE` | 100 | 100 | 명시. 대기 중인 제출(테스트케이스 하나가 제출 하나) 수의 상한이라, 20개짜리 묶음 5개면 찬다. 넘치면 503이 온다. 백오프 재시도는 #67의 규약대로 API의 `Judge0Client`가 한다(503은 0.5초부터 두 배씩 8초까지 최대 7번, 약 23초). 100으로 확정했다(실측 절의 큐 크기) |
| `NUMBER_OF_RUNS` / `MAX_NUMBER_OF_RUNS` | 1 / 1 | 1 / 20 | 한 제출이 슬롯을 여러 번 점유하지 못하게 한다 |
| `MAX_SUBMISSION_BATCH_SIZE` | 20 | 20 | 테스트케이스 묶음 제출 단위(명시) |
| `ENABLE_SUBMISSION_DELETE` | true | false | 결과를 읽은 뒤 비공개 입력을 지울 수 있게 한다(AUTHZ 토큰 필요). 사용 여부는 #29에서 정한다 |
| `SUBMISSION_CACHE_DURATION` | 0 | 1 | 폴링이 캐시된 상태를 받지 않게 한다 |
| `RAILS_SERVER_PROCESSES` | 1 | 2 | 1로 둔다. Judge0를 부르는 곳은 API 서버뿐이고, 채점 처리기 슬롯이 2개라 동시에 오는 요청이 적다 |
| `JUDGE0_TELEMETRY_ENABLE` | false | true | 외부 전송 차단 |
| `CPU_TIME_LIMIT` / `MAX_…` | 2 / 20 초 | 5 / 15 | #65 실측으로 확정. 상한 20초는 C++ 6초 문제의 Python 제한(×3 + 2초)까지 받는다. API는 요청마다 값을 보내 기본값은 쓰이지 않는다 |
| `CPU_EXTRA_TIME` / `MAX_…` | 0.5 / 1 초 | 1 / 5 | TLE 판정 꼬리 지연 제한 |
| `WALL_TIME_LIMIT` / `MAX_…` | 5 / 30 초 | 10 / 20 | #65 실측으로 확정. API는 min(CPU × 2 + 1, 30)을 보낸다 |
| `MEMORY_LIMIT` / `MAX_…` | 262144 / 524288 KB | 128000 / 512000 | #65 실측으로 확정. 상한은 컴파일 한도이기도 하다(아래). t3.medium에서는 슬롯 2개가 상한 가까이 써도 여유가 있다 |
| `STACK_LIMIT` / `MAX_…` | 262144 / 524288 KB | 64000 / 128000 | 스택을 메모리 제한과 같게 둔다(깊은 재귀가 메모리 전에 끊기지 않게) |
| `MAX_FILE_SIZE` / `MAX_MAX_FILE_SIZE` | 1024 / 4096 KB | 1024 / 4096 | 출력 제한 1024 KB로 확정. 컴파일 산출물도 상한을 받는다. 문제의 정답 출력은 1 MB 안에 들게 만든다 |

`MAX_…` 값은 호출자가 요청할 수 있는 상한이면서 **컴파일 단계의 제한**이기도 하다. Judge0는 컴파일을 `-t MAX_CPU_TIME_LIMIT -w MAX_WALL_TIME_LIMIT --cg-mem=MAX_MEMORY_LIMIT`로 돌린다(로컬 워커 로그에서 `-t 20.0 -w 30.0 --cg-mem=524288` 확인). 그래서 두 슬롯이 동시에 C++를 컴파일하면 각각 512 MB까지 쓸 수 있고, 이 값을 줄이면 컴파일 한도도 같이 줄어든다. #65에서 잰 컴파일 메모리는 `bits/stdc++.h`·`-O2` 하나에 약 210 MiB다. 256 MB로 낮추면 컴파일이 한도에 가까워져 512 MB를 유지한다.

비밀값(`AUTHN_TOKEN`, `AUTHZ_TOKEN`, `REDIS_PASSWORD`, `POSTGRES_PASSWORD`)은 `judge0.conf`에 두지 않는다. Judge0의 `scripts/load-config`가 conf를 allexport로 읽기 때문에, `AUTHN_TOKEN=` 같은 빈 줄이 하나라도 있으면 `.env`로 넣은 값을 빈 값으로 덮어써 인증이 꺼진다. `preflight.sh`가 이 줄이 없는지 확인한다. 운영 비밀값은 SSM Parameter Store에 두고 VM의 `.env`로 옮긴다.

## 언어

| 언어 | Judge0 ID | 버전 | 컴파일 옵션 |
|---|---|---|---|
| Python | 71 | Python 3.8.1 | 없음 |
| C++ | 54 | GCC 9.2.0 | `-O2 -std=c++17` (API 서버가 고정해 보낸다) |

Judge0 1.13.1에는 Python 3.10 이상이 없다. `match` 문 같은 3.10+ 문법은 쓸 수 없다.

## 실행 시간·메모리 실측 (#65)

**채점 VM에서만 측정한다.** 맥 Docker Desktop은 Apple 칩에서 amd64 명령을 Rosetta로 번역해 실행하므로 시간과 Python/C++ 비율이 서버와 다르다. 맥에서는 하네스가 동작하는지만 확인했다(2026-10-15, 모든 워크로드·크기에서 status 3, 두 언어 출력 일치).

```bash
cd judge
python3 bench/run_bench.py --label ec2-<인스턴스 타입> --results   # bench/results/<날짜>-<label>.md 생성
```

| 워크로드 | 내용 | 입력 크기 N (소·중·대) |
|---|---|---|
| `io_sort_prefix` | 정수 N개 읽기 → 정렬 → 누적합 | 10⁴, 10⁵, 10⁶ |
| `nested_loop` | O(N²) 순수 반복 | 1000, 2000, 4000 |
| `dict_count` | 해시 맵 빈도 집계 | 10⁴, 10⁵, 10⁶ |
| `recursion_dfs` | 깊이 N 재귀 | 1000, 10⁴, 5×10⁴ |
| `io_print` | N줄 출력 | 10⁴, 5×10⁴, 10⁵ |
| `empty` | 빈 프로그램(언어 기본 비용) | — |

- 조합마다 예열 1회를 버리고 5회 측정한다. 한 번에 하나씩 제출하고 언어 순서를 번갈아 바꾼다. 측정이 잘리지 않게 상한값(CPU 20초, 메모리 512 MB)으로 요청한다.
- 두 언어의 출력이 같은지 확인한다(다르면 결과의 '문제'에 나온다). 입력은 고정 시드 합성 데이터다.
- 측정 조건(Judge0·isolate 버전, CPU 모델, vCPU, 메모리, 시각)은 결과 파일 머리에 자동으로 적힌다. 버스트 인스턴스(t3)는 측정 전후 CPU 크레딧 잔량(CloudWatch `CPUCreditBalance`)을 손으로 적는다. 2026-10-25 VM은 크레딧이 `unlimited`라 잔량(0)과 상관없이 느려지지 않은 상태에서 쟀다.

**Python 보정 배수 정하는 법**: 출발점은 계획서의 시간 ×3 + 2초, 메모리 ×2다.

- 결과 표는 입력마다 C++ 기준 제한 L을 잡는다. C++ 최댓값 × 2를 0.5초 단위로 올린 값이고 최소 1초다. 그리고 Python 최댓값이 3L + 2초 안에 드는지(통과 열)를 보여 준다. 다만 L의 하한 1초 때문에 작은 입력은 거의 늘 통과해 이 열만으로는 배수를 시험하지 못한다.
- 배수는 '최대 비율'(Python 최대 ÷ C++ 최대) 열로 판단한다. C++ 풀이가 L의 절반을 쓴다고 보면 3L + 2초 = 6 × C++ 시간 + 2초라, 비율 6배까지 맞는다. 실행이 0.3초를 넘는 큰 입력에서 최대 비율이 6 이하면 ×3 + 2초를 유지한다. 넘으면 그 비율을 덮는 배수를 후보로 올린다. 지금 크기에서 0.3초를 넘는 것은 `io_sort_prefix`·`dict_count`의 10⁶뿐이다. `recursion_dfs`·`io_print`는 가장 큰 크기도 0.1초가 안 돼 이 기준을 적용할 자료가 없다(입출력·재귀가 아주 많은 문제는 아래 결론대로 따로 잰다).
- `nested_loop` 같은 순수 반복은 Python이 수십 배 느려 배수로 맞추지 않는다(백준도 같다). 비율은 기록만 한다.
- 메모리는 사용량 비율이 아니라 문제의 메모리 제한 기준으로 판단한다. 정수 10⁶개를 담는 워크로드는 Python 객체 오버헤드로 사용량이 C++의 9배를 넘지만, 256 MB 제한 문제라면 Python 제한 512 MB 안에 충분히 든다.
- 확정한 배수는 문제 등록 시 `problem_language_configs`에 언어별 값으로 저장한다. 제출 때 다시 곱하지 않는다.

### 결과: EC2 t3.medium — 2026-10-25

전체 표는 `bench/results/2026-10-25-ec2-t3.medium.md`에 있다. 키우기 전 t3.small에서도 같은 CPU라 거의 같은 값이 나왔다. 모든 실행이 status 3이고 두 언어의 출력이 같았다.

| 워크로드 (가장 큰 N) | Python 최대 | C++ 최대 | 시간 비율(중앙값) | 최대 비율 | Python 메모리 최대 | C++ 메모리 최대 |
|---|---|---|---|---|---|---|
| `io_sort_prefix` (10⁶) | 1.661초 | 0.312초 | 5.2 | 5.3 | 110860 KB | 8776 KB |
| `dict_count` (10⁶) | 1.037초 | 0.387초 | 2.7 | 2.7 | 80196 KB | 5112 KB |
| `recursion_dfs` (5×10⁴) | 0.067초 | 0.006초 | 13.0 | 11.2 | 44196 KB | 2524 KB |
| `io_print` (10⁵) | 0.064초 | 0.018초 | 5.6 | 3.6 | 4264 KB | 1564 KB |
| `nested_loop` (4000) | 3.157초 | 0.029초 | 122.2 | 108.9 | 3348 KB | 984 KB |
| `empty` | 0.018초 | 0.003초 | 5.3 | 6.0 | 3272 KB | 980 KB |

확정한 값:

- **Python 보정 배수는 시간 ×3 + 2초, 메모리 ×2를 유지한다.** 근거는 '최대 비율' 열이다. 통과 열은 모든 행이 L = 1초(Python 제한 5초)라 배수를 시험하지 못한다.
  - 실행이 0.3초를 넘는 큰 입력(`io_sort_prefix`·`dict_count`의 10⁶)에서는 최대 비율이 2.7~5.3배로, C++이 제한의 절반을 쓰는 문제까지 6배 안에 든다. `recursion_dfs`·`io_print`는 큰 입력 자료가 없다.
  - 6배를 넘는 것(최대 11.2배, `recursion_dfs` 5×10⁴)은 Python 실행이 0.1초도 안 되는 작은 입력뿐이고, +2초가 덮는다.
  - `nested_loop`(순수 반복)는 41~109배라 배수로 맞추지 않고 기록만 한다.
  - C++ 정답이 1초 넘게 걸리는 문제, 특히 입출력·재귀가 많은 문제는 ×3 + 2초가 빠듯할 수 있다. 이런 문제는 등록할 때 Python 정답 코드로 실제 시간을 재서 Python 제한을 정한다(정답 코드 검증, ADM-05).
- 메모리는 정수 10⁶개를 담는 Python 풀이가 약 108 MiB로 C++의 12배를 넘지만, 256 MB 문제의 Python 제한(512 MB) 안에 충분히 든다.
- **컴파일 메모리**: `bits/stdc++.h`·`-O2` C++ 제출 2개를 동시에 컴파일하면 `cc1plus` RSS 합이 419 MiB(하나에 약 210 MiB)다. workers 컨테이너 최대 사용량은 790 MiB다(cgroup v1 `memory.max_usage_in_bytes`). Judge0는 컴파일 메모리를 응답에 넣지 않아 호스트에서 쟀다. `MAX_MEMORY_LIMIT`은 512 MB를 유지한다.
- **큐 크기**: `MAX_QUEUE_SIZE`는 100을 유지한다. API 채점 처리기는 슬롯 2개로 제출을 둘씩만 보내므로, Judge0 큐에 동시에 들어가는 케이스는 많아야 문제 케이스 수의 2배다. 문제당 케이스가 50개를 넘는 문제를 넣으면 다시 정한다.
- 동시 실행 중에도 `wall_time_limit` = CPU × 2 + 1이 정답을 끊지 않는다([판정 매핑 9절](../docs/judge-verdict-mapping.md#9-채점-vm에서-확인한-것)).

## 판정 매핑

Judge0 응답(status·exit_code·memory·stderr)을 우리 판정 9가지와 런타임 에러 종류로 바꾸는 규칙은 [`docs/judge-verdict-mapping.md`](../docs/judge-verdict-mapping.md)에 있다. 아래 검증 결과가 그 근거다.

## 격리·자원 제한 검증 (#66)

```bash
cd judge
python3 verify/run_verify.py --label <환경 이름> --observed verify/observed   # 종료 코드 = 실패 수
python3 verify/concurrency_check.py                                         # 실행 슬롯(COUNT)
```

접속 주소와 토큰은 smoke와 같이 `JUDGE0_URL`·`JUDGE0_AUTHN_TOKEN`, 없으면 `.env`에서 읽는다. 채점 VM에서는 그대로 실행하면 된다.

`run_verify.py`는 `verify/cases.json`의 케이스 45개(네트워크·파일·프로세스·시간·메모리·재귀·출력·예외)를 제출해 기대값과 대조한다. 네트워크 케이스는 같은 코드를 호스트에서도 실행해, 샌드박스 밖에서는 닿는 대상만 차단 근거로 인정한다. 예외 케이스는 판정 매핑의 근거로 기록만 한다(`observe`). 제한값은 `judge0.conf` 기본값(CPU 2초, wall 5초, 메모리 256 MB, 출력 1024 KB)이다.

### 결과: 맥 Docker Desktop (cgroup v1, Rosetta) — 2026-10-15

전체 표는 `verify/results/2026-10-15-mac-rosetta-cgroupv1.md`, 케이스별 응답은 `verify/observed/mac-rosetta-cgroupv1/`에 있다. 실패 0건(44건 통과, 환경에 따라 다른 관찰 1건).

| 묶음 | 결과 |
|---|---|
| 네트워크 | Python·C++ 모두 DNS(example.com)·TCP(1.1.1.1:53, 8.8.8.8:53) 차단. 같은 대상이 호스트에서는 닿는 것을 대조 실행으로 확인 |
| 파일 | `docker.sock`·`/judge0.conf`·`/api/environment`(Judge0 비밀값이 담긴 파일)·isolate 작업 폴더가 보이지 않음. `/etc/shadow` 읽기 거부, `/etc`·`/usr` 쓰기 거부 |
| 프로세스 | uid 60000번대로 실행. `/proc`에는 샌드박스 안 프로세스만 보임. fork는 58개에서 막힘(`-p 60`) |
| 시간 | 무한 반복(Python·C++) → status 5, CPU 2.1초. 무한 `sleep` → status 5, wall 5.0초 |
| 메모리 | 큰 리스트·배열·벡터 → status 11, exit_code 137(SIGKILL), `memory` = 제한값(262144 KB) |
| 재귀 | Python 기본 한도 → `RecursionError`. 깊이 10⁵(Python)은 통과. 끝없는 재귀는 스택이 메모리에 포함되어 메모리 제한에서 SIGKILL. C++ 깊이 10⁶ 케이스는 이때 `-O2`가 반복문으로 바꿔 스택을 쓰지 않았다(856 KB). 고친 케이스의 결과는 아래 채점 VM 결과에 있다 |
| 출력 | C++ 무한 출력 → status 11, exit_code 153(SIGXFSZ). Python 무한 출력 → `OSError: [Errno 27] File too large`, exit_code 1. stderr 무한 출력 → exit_code 120. 제한 바로 아래 출력(900 KB)과 비UTF-8 출력은 정상 |
| 동시 실행 | CPU 1.5초 작업 4개 → 샌드박스 실행 구간 최대 2개 겹침, 나머지는 큐 대기. 450 MiB 작업 2개 동시 실행 정상 |

판정 매핑에 영향을 주는 관찰:

- Judge0는 프로그램을 `/bin/bash run` 스크립트로 감싸 실행한다. 그래서 신호로 끝난 프로그램도 isolate에는 bash의 비정상 종료로 보여 **status 11(NZEC)에 `exit_code` = 128 + 신호 번호**로 온다. `exit_signal`은 비어 있다. 세그폴트 139, 0 나누기 136, abort(예외·assert) 134, 출력 초과 153, 메모리 kill 137. Judge0 문서의 status 7~10은 이 구성에서 나오지 않았다.
- 신호로 끝나면 stderr 끝에 bash의 `run: line 1: … Killed …/python3 script.py` 같은 줄이 붙는다. 사용자에게 에러 원문을 보여 줄 때는 이 줄을 지운다.
- `new`로 4 TB를 요청하는 케이스는 Docker Desktop VM의 `vm.overcommit_memory=1` 때문에 할당이 성공했다. Ubuntu 기본값(0)에서는 `bad_alloc` → abort(134)가 예상된다.
- `/workers`는 호출할 때마다 워커 등록을 지워 `working`·`available`이 0으로 온다(운영 명령 절). 동시 실행 수는 샌드박스 안 시각으로 잰다.

### 결과: 채점 VM (EC2, Ubuntu 22.04, cgroup v1) — 2026-10-25

전체 표는 `verify/results/2026-10-25-ec2-t3.medium.md`, 케이스별 응답은 `verify/observed/ec2-t3.medium/`에 있다. 키우기 전 t3.small에서도 같은 결과였다(판정 동작은 인스턴스 크기와 상관없다). 실패 0건이다. 판정 규칙을 바꿀 차이는 없었다([판정 매핑 9절](../docs/judge-verdict-mapping.md#9-채점-vm에서-확인한-것)).

| 묶음 | 맥과 다른 점 |
|---|---|
| 네트워크 | EC2 메타데이터(169.254.169.254:80)도 샌드박스 안에서 막힌다. 같은 코드가 호스트에서는 닿는 것을 대조 실행으로 확인했다 |
| 메모리 | `new`로 4 TB를 요청하면 할당이 실패해 `std::bad_alloc` → abort(134)로 끝난다. VM은 `vm.overcommit_memory=0`이다 |
| 신호 | 맥과 같이 status 11 + `exit_code` 128+N으로 온다. bash 줄 끝에 `(core dumped)`가 붙는다 |
| 시간 | 무한 반복 CPU 2.1초(Python 2.057, C++ 2.068), 무한 `sleep` wall 5.1초 → status 5 |
| 재귀 | C++ 깊이 10⁶(호출 뒤에도 프레임을 쓰게 고친 `rec_ok_cpp`)이 메모리 32 MB를 쓰며 정상 종료한다. 스택 한도(메모리 한도와 같은 256 MB) 안이다 |

동시 실행(`concurrency_check.py`):

| 단계 | t3.small (2 GB) | t3.medium (4 GB) |
|---|---|---|
| CPU 1.5초 작업 4개 | 모두 정상 종료, 실행 구간 최대 2개 겹침. 호스트 MemAvailable 최소 821 MiB | 같음. 최소 2793 MiB |
| 450 MiB 작업 2개 | 둘 다 정상 종료했지만 MemAvailable 최소 **32 MiB** (기준 256 MiB, **실패**) | 최소 1899 MiB (통과) |
| `bits/stdc++.h` C++ 컴파일 2개 | MemAvailable 최소 **119 MiB** | 최소 2437 MiB |

- 샌드박스 실행 구간은 최대 2개만 겹치고 나머지는 큐에서 기다린다. 두 크기 모두 컨테이너 재시작과 호스트 OOM은 없었다(dmesg의 OOM은 메모리 초과 케이스가 샌드박스 cgroup 안에서 죽은 것뿐이다).
- 평상시 Judge0 컨테이너 메모리는 server 171 MiB, workers 271 MiB, db 53 MiB, redis 7 MiB다. 스왑은 없다.
- 컴파일 메모리는 Judge0 응답에 없어 cgroup v1의 workers 컨테이너 `memory.max_usage_in_bytes`와 `cc1plus` RSS로 쟀다. 컴파일 하나가 약 210 MiB를 쓴다(2개 합 419 MiB).

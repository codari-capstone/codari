# judge

Judge0 v1.13.1 자체 호스팅 설정. 제출 코드를 웹·API 서버와 분리된 채점 VM에서 실행한다.

- 버전과 이미지를 digest까지 고정한다. 공식 compose 파일은 judge0 이미지를 `latest`로 적어 두므로 그대로 쓰지 않는다.
- 샌드박스 네트워크를 끈다(`ENABLE_NETWORK=false`, `ALLOW_ENABLE_NETWORK=false`).
- 시간·메모리 제한, 컴파일 옵션, 네트워크, 추가 파일은 API 서버가 정한다. 브라우저에서 온 값은 Judge0에 넘기지 않는다.
- 채점 VM에는 서비스 DB 자격 증명과 AI 키를 두지 않는다.
- Judge0 1.13.1 이미지는 linux/amd64 전용이고 cgroup v1 호스트가 필요하다. Apple Silicon 맥에서는 실행할 수 없다.

## 파일

| 경로 | 내용 |
|---|---|
| `docker-compose.yml` | server·workers·내부 PostgreSQL·Redis. 이미지 digest 고정, 2358은 `JUDGE0_BIND_ADDR`에만 게시 |
| `judge0.conf` | 공식 `judge0.conf` 원문에 아래 "설정 요약"의 값을 넣은 파일. 비밀값 키는 없다 |
| `.env.example` | 비밀값 견본. VM에서 `.env`로 복사해 채운다(저장소에 올리지 않는다) |
| `scripts/preflight.sh` | 기동 전 확인: x86_64, cgroup v1, Docker·Compose, `.env`, conf에 비밀값 키가 없는지 |
| `scripts/smoke.py` | 기동 후 확인: 인증, `/config_info`와 conf 대조, 언어 71·54, 워커 2개, hello world, 금지 요청 거절 |
| `scripts/judge0_client.py` | 표준 라이브러리 클라이언트. smoke·실측·검증이 함께 쓴다 |
| `tests/` | 클라이언트 단위 테스트 (`python3 -m unittest discover -s judge/tests`) |

## 설치·기동

채점 VM 준비(amd64 Ubuntu 22.04, cgroup v1, Docker)는 "채점 VM 준비" 절을 따른다. 그다음 VM에서:

```bash
git clone https://github.com/codari-capstone/codingmon.git ~/codingmon
cd ~/codingmon/judge
cp .env.example .env && chmod 600 .env
# .env의 네 비밀값을 각각 `openssl rand -hex 24` 결과로 바꾼다. 따옴표·$·#는 쓰지 않는다
bash scripts/preflight.sh
docker compose pull
docker compose up -d          # db·redis healthcheck가 통과한 뒤 server·workers가 뜬다
python3 scripts/smoke.py      # 종료 코드 0이면 통과
```

`depends_on` healthcheck로 기동이 안 되면 공식 릴리스 노트의 순서로 띄운다: `docker compose up -d db redis`, 10초 대기, `docker compose up -d`.

## 운영 명령

| 할 일 | 명령 (`judge/`에서) |
|---|---|
| 상태 | `docker compose ps` |
| 로그 | `docker compose logs -f --tail 100 server workers` |
| 워커만 재시작 | `docker compose restart workers` |
| 중지 (Judge0 DB 보존) | `docker compose down` |
| 다시 시작 | `docker compose up -d` |
| Judge0 DB까지 삭제 | `docker compose down -v` — 제출 기록이 모두 지워진다. 일반 중지에 쓰지 않는다 |

Judge0 시작 스크립트는 환경 변수 전체(비밀값 포함)를 로그에 남긴다. `docker compose logs` 원문은 PR·이슈·메신저에 붙이지 않는다.

## 설정 요약

`judge0.conf`에서 공식 기본값과 다르게 둔 값이다. `scripts/smoke.py`가 기동 후 `/config_info`와 이 파일을 대조한다.

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
| `NUMBER_OF_RUNS` / `MAX_NUMBER_OF_RUNS` | 1 / 1 | 1 / 20 | 한 제출이 슬롯을 여러 번 점유하지 못하게 한다 |
| `MAX_SUBMISSION_BATCH_SIZE` | 20 | 20 | 테스트케이스 묶음 제출 단위(명시) |
| `ENABLE_SUBMISSION_DELETE` | true | false | 결과를 읽은 뒤 비공개 입력을 지울 수 있게 한다(AUTHZ 토큰 필요). 사용 여부는 #29에서 정한다 |
| `SUBMISSION_CACHE_DURATION` | 0 | 1 | 폴링이 캐시된 상태를 받지 않게 한다 |
| `RAILS_SERVER_PROCESSES` | 1 | 2 | t3.small 메모리 절약. 동시 실행 측정 후 조정 |
| `JUDGE0_TELEMETRY_ENABLE` | false | true | 외부 전송 차단 |
| `CPU_TIME_LIMIT` / `MAX_…` | 2 / 20 초 | 5 / 15 | **실측 전 시작값** (#65에서 확정) |
| `CPU_EXTRA_TIME` / `MAX_…` | 0.5 / 1 초 | 1 / 5 | TLE 판정 꼬리 지연 제한 |
| `WALL_TIME_LIMIT` / `MAX_…` | 5 / 30 초 | 10 / 20 | 실측 전 시작값 |
| `MEMORY_LIMIT` / `MAX_…` | 262144 / 524288 KB | 128000 / 512000 | 실측 전 시작값 |
| `STACK_LIMIT` / `MAX_…` | 262144 / 524288 KB | 64000 / 128000 | 스택을 메모리 제한과 같게 둔다(깊은 재귀가 메모리 전에 끊기지 않게) |
| `MAX_FILE_SIZE` / `MAX_MAX_FILE_SIZE` | 1024 / 4096 KB | 1024 / 4096 | 출력 제한. 컴파일 산출물도 상한을 받는다. #65에서 확정 |

비밀값(`AUTHN_TOKEN`, `AUTHZ_TOKEN`, `REDIS_PASSWORD`, `POSTGRES_PASSWORD`)은 `judge0.conf`에 두지 않는다. Judge0의 `scripts/load-config`가 conf를 allexport로 읽기 때문에, `AUTHN_TOKEN=` 같은 빈 줄이 하나라도 있으면 `.env`로 넣은 값을 빈 값으로 덮어써 인증이 꺼진다. `preflight.sh`가 이 줄이 없는지 확인한다. 운영 비밀값은 SSM Parameter Store에 두고 VM의 `.env`로 옮긴다.

## 언어

| 언어 | Judge0 ID | 버전 | 컴파일 옵션 |
|---|---|---|---|
| Python | 71 | Python 3.8.1 | 없음 |
| C++ | 54 | GCC 9.2.0 | `-O2 -std=c++17` (API 서버가 고정해 보낸다) |

Judge0 1.13.1에는 Python 3.10 이상이 없다. `match` 문 같은 3.10+ 문법은 쓸 수 없다.

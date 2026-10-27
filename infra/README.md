# infra

로컬 개발용 Docker Compose(DB, Judge0, API, 웹)와 AWS 3티어 배포 설정.
비밀값은 저장소에 두지 않고 SSM Parameter Store에 보관한다.

## 한 서버에 서비스 올리기 (`compose.yaml`)

웹·API·DB를 한 서버에 올린다. Judge0는 채점 VM에 따로 띄운다([`judge/README.md`](../judge/README.md)).

| 서비스 | 이미지 | 내용 |
|---|---|---|
| `db` | `postgres:18` | 서비스 DB. 포트를 게시하지 않는다. 스키마는 API가 시작할 때 Flyway가 만든다 |
| `api` | `codingmon-api:<TAG>` (`api/Dockerfile`) | Spring Boot. 포트를 게시하지 않고 `web`이 `/api/`를 넘긴다 |
| `web` | `codingmon-web:<TAG>` (`web/Dockerfile`) | nginx가 빌드한 화면을 내보내고 `/api/`를 `api:8080`으로 넘긴다. `WEB_BIND_ADDR:WEB_PORT`에 게시 |

### 이미지 빌드

빌드 단계는 빌드하는 기계의 아키텍처에서 돌고 마지막 층만 서버 아키텍처(amd64)로 만든다. 맥에서도 에뮬레이션 없이 빌드된다.

```bash
TAG=$(git rev-parse --short HEAD)
docker buildx build --platform linux/amd64 -t codingmon-api:$TAG --load api
docker buildx build --platform linux/amd64 -t codingmon-web:$TAG --load web
# 레지스트리 없이 서버로 옮긴다
docker save codingmon-api:$TAG codingmon-web:$TAG | gzip -1 | ssh <서버> 'gunzip | docker load'
```

### 서버에서 띄우기

```bash
cd infra
cp .env.example .env && chmod 600 .env   # TAG와 비밀값을 채운다(.env.example 주석 참고)
docker compose up -d --no-build
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1/api/problems   # 200
docker compose logs api | grep -E 'Successfully applied|Started ApiApplication'
```

- refresh token 쿠키가 `Secure`라 **HTTPS로 접속해야 로그인이 유지된다**. HTTP로 열면 로그인은 되지만 새로고침하면 풀린다. 앞단에 HTTPS 프록시를 두고 `WEB_BIND_ADDR=127.0.0.1`로 둔다.
- 서버가 HTTPS를 검사하는 프록시(학교·회사망) 뒤에 있으면 그 루트 인증서(PEM, 확장자 `.crt`)를 `certs/`에 넣는다. API가 시작할 때 JVM truststore에 더한다(로그 `Adding certificate with alias …`). 이게 없으면 GitHub 로그인 같은 외부 HTTPS 호출이 인증서 오류로 실패한다.
- `MAIL_LOG_CODES=true`면 인증번호가 메일 대신 `docker compose logs api`에 찍힌다. 테스트 서버에서만 쓴다.

### HTTPS 공개 (Cloudflare Tunnel)

서버에 들어오는 포트를 열지 않고, `tunnel` 서비스가 Cloudflare로 나가는 연결로 웹을 공개한다. 공유기 포트포워딩이나 공인 IP가 없는 서버에서도 된다.

1. Cloudflare에 도메인을 연결한다. Zero Trust → Networks → Tunnels → Create a tunnel(Cloudflared)로 터널을 만들고, 설치 명령에 나오는 토큰(`eyJ…`)을 `.env`의 `TUNNEL_TOKEN`에 넣는다.
2. 그 터널의 Public hostname에 공개할 주소(예: `app.<도메인>`)를 추가하고 Service를 `HTTP`, `web:80`으로 둔다.
3. `.env`의 `WEB_BASE_URL`을 그 주소(`https://…`)로 바꾸고 `docker compose --profile tunnel up -d`.
4. `docker compose logs tunnel`에 `Registered tunnel connection`이 나오면 연결된 것이다.

- QUIC은 UDP를 쓴다. 수신 버퍼가 작다는 경고(`failed to sufficiently increase receive buffer size`)가 나오면 서버에서 `net.core.rmem_max`·`wmem_max`를 7500000으로 올린다.
- HTTPS를 검사하는 프록시는 TCP 7844의 TLS도 가로채 `http2`가 `x509: certificate signed by unknown authority`로 실패한다. 이때는 `TUNNEL_PROTOCOL=quic`으로 고정한다(UDP 7844가 열려 있어야 한다).

### 운영 명령 (`infra/`에서)

| 할 일 | 명령 |
|---|---|
| 상태 | `docker compose ps` |
| 로그 | `docker compose logs -f --tail 100 api web` |
| 새 버전 | 새 `TAG` 이미지를 옮긴 뒤 `.env`의 `TAG`를 바꾸고 `docker compose up -d --no-build` |
| DB 백업 | `docker compose exec -T db pg_dump -U codingmon codingmon \| gzip > codingmon-$(date +%F).sql.gz` |
| 중지 (DB 보존) | `docker compose down` |
| DB까지 삭제 | `docker compose down -v`. 모든 사용자·제출 기록이 지워진다 |

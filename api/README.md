# api

백엔드 (Spring Boot 4, Java 21, JPA, Flyway, PostgreSQL 18). 1주차에 프로젝트를 생성한다.
API, 채점 처리기, AI 처리기, 리포트 계산을 패키지로 나눈 하나의 애플리케이션이다.

## 채점 (Judge0)

`JUDGE0_URL`과 `JUDGE0_AUTHN_TOKEN`을 주면 채점 처리기가 켜진다(`.env.example`). 비워 두면 제출과 예제 실행이 `QUEUED`로 남는다. 로컬 Judge0는 [`judge/README.md`](../judge/README.md)의 "맥(Apple Silicon)에서 실행"으로 띄운다.

채점 통합 테스트(`JudgeWorkerIntegrationTest`)는 `JUDGE0_URL`이 있을 때만 돈다. 테스트 DB에 문제·제출을 만들었다가 지운다.

```bash
DB_URL=... DB_USERNAME=... DB_PASSWORD=... JUDGE0_URL=http://127.0.0.1:2358 JUDGE0_AUTHN_TOKEN=... ./gradlew test
```

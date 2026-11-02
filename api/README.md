# api

백엔드 (Spring Boot 4, Java 21, JPA, Flyway, PostgreSQL 18). 1주차에 프로젝트를 생성한다.
API, 채점 처리기, AI 처리기, 리포트 계산을 패키지로 나눈 하나의 애플리케이션이다.

## 채점 (Judge0)

`JUDGE0_URL`과 `JUDGE0_AUTHN_TOKEN`을 주면 채점 처리기가 켜진다(`.env.example`). 비워 두면 제출과 예제 실행이 `QUEUED`로 남는다. 로컬 Judge0는 [`judge/README.md`](../judge/README.md)의 "맥(Apple Silicon)에서 실행"으로 띄운다.

채점 통합 테스트(`JudgeWorkerIntegrationTest`)는 `JUDGE0_URL`이 있을 때만 돈다. 테스트 DB에 문제·제출을 만들었다가 지운다.

```bash
DB_URL=... DB_USERNAME=... DB_PASSWORD=... JUDGE0_URL=http://127.0.0.1:2358 JUDGE0_AUTHN_TOKEN=... ./gradlew test
```

## AI (LLM)

팀 서버에 띄운 오픈 웨이트 모델을 OpenAI 호환 API(`/v1/chat/completions`)로 부른다. `LLM_URL`과 `LLM_MODEL`을 주면 켜지고, 비워 두면 AI 기능이 장애로 응답한다. 채점에는 영향이 없다. 나머지 값과 기본값은 `application.properties`의 `app.llm.*`에 있다.

호출은 `AiWorker`가 채점 슬롯과 다른 스레드에서 처리한다. 동시 호출 수는 `LLM_WORKERS`로 정하고, 넘치는 요청은 차례를 기다린다. 응답이 스키마를 어기면 한 번 다시 요청한다. 호출당 요금이 없어 `ai_reviews`에는 토큰 수만 남기고 `cost_usd`는 비워 둔다.

지금 모델은 `gemma4:12b`이고 서버 설정은 [`infra/README.md`](../infra/README.md)의 "LLM 서버"에 있다. 실제 모델로 호출하는 테스트(`OpenAiCompatibleLlmClientIntegrationTest`)는 `LLM_URL`과 `LLM_MODEL`이 있을 때만 돈다.

```bash
LLM_URL=http://127.0.0.1:11434 LLM_MODEL=gemma4:12b ./gradlew test --tests 'com.codingmon.api.ai.*'
```

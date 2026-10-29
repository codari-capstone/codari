# 데이터베이스 테이블·컬럼 설명

이 문서는 [DB 스키마 초안](database-schema.md)과 Flyway 마이그레이션을 기준으로 각 컬럼의 역할을 정리한다.

- **PK**: 테이블에서 행 하나를 구별하는 기본 키
- **FK**: 다른 테이블의 행을 가리키는 외래 키
- **중복 불가**: 같은 값을 가진 행을 둘 이상 만들 수 없음
- **비어도 됨**: 값이 아직 없거나 해당하지 않을 때 `NULL`을 저장할 수 있음

## `users` — 서비스 사용자

- `id` (PK): 서비스 내부에서 사용자를 구별하는 번호. 다른 사용자 관련 테이블이 이 번호를 참조한다.
- `email` (비어도 됨, 중복 불가): 일반 회원가입·로그인에 쓰는 이메일. GitHub 가입 계정은 항상 비어 있다. 대소문자만 다른 이메일도 중복으로 취급한다.
- `password_hash` (비어도 됨): 일반 회원가입 비밀번호의 해시값. 평문 비밀번호를 저장하지 않는다. 일반 가입 계정은 이메일도 있어야 한다. GitHub 가입 계정은 비어 있고 GitHub로만 로그인한다.
- `token_version`: 비밀번호를 재설정할 때마다 1씩 올리는 번호. 기본값은 0이다. access token과 재설정 증명서에 발급 당시 값을 넣고, 현재 값과 다르면 거절한다. 만료는 이 값이 아니라 각 토큰의 만료 시각으로 판단한다.
- `nickname` (중복 불가): 서비스 화면에서 다른 사람에게 보이는 별명(닉네임). 대소문자만 다른 닉네임도 중복으로 취급한다. 중복 확인 버튼은 안내용이고 미리 점유하지 않는다. 가입 완료 시 유일 인덱스가 최종 판정한다.
- `avatar_url` (비어도 됨): 프로필 이미지 주소.
- `role`: 권한 구분. `USER`는 일반 사용자, `ADMIN`은 관리자이며 기본값은 `USER`다.

## `oauth_accounts` — OAuth 계정 연결

- `id` (PK): OAuth 연결 행의 내부 번호.
- `user_id` (FK): 연결되는 서비스 사용자(`users.id`). 사용자를 삭제하면 연결도 삭제된다.
- `provider`: OAuth 제공자. 현재 허용값은 `GITHUB`다.
- `provider_user_id`: GitHub가 해당 계정에 부여한 고유 ID. GitHub 사용자명이 바뀌어도 계정을 찾는 데 사용한다.
- `provider_username` (비어도 됨): OAuth 로그인 시점에 받은 GitHub 사용자명. 화면 표시나 참고용이며 계정 식별 기준은 아니다.
- `(provider, provider_user_id)` 중복 불가: 같은 GitHub 계정을 서비스 사용자 여러 명에게 연결하지 못하게 한다.
- `(user_id, provider)` 중복 불가: 한 사용자가 같은 제공자 계정을 여러 개 연결하지 못하게 한다.

## `refresh_tokens` — 로그인 유지 토큰

- `id` (PK): 갱신 토큰 행의 내부 번호.
- `user_id` (FK): 토큰을 발급받은 사용자. 사용자를 삭제하면 해당 토큰도 삭제된다.
- `token_hash` (중복 불가): refresh token 원문이 아닌 해시값. 로그인 유지와 토큰 검증에 사용한다.
- `family_id`: 서로 교체된 토큰들을 한 묶음으로 식별하는 ID. 토큰 재사용이 의심될 때 묶음 전체를 폐기하는 데 쓴다.
- `expires_at`: 토큰 만료 시각.
- `revoked_at` (비어도 됨): 토큰을 로그아웃 등으로 폐기한 시각. 아직 유효하면 비어 있다.
- `replaced_by_token_id` (비어도 됨, FK, 중복 불가): 이 토큰을 교체한 새 토큰의 `id`. 교체되지 않았으면 비어 있다. 새 토큰이 삭제되면 자동으로 비워진다.
- `created_at`: 토큰 행이 만들어진 시각. 기본값은 DB의 현재 시각이다.

## `email_tokens` — 가입·비밀번호 재설정 이메일 인증번호

- `id` (PK): 인증번호 행의 내부 번호.
- `email`: 인증번호를 보낸 이메일. 가입 때는 아직 사용자 행이 없으므로 `users`를 참조하지 않는다. 대소문자를 구분하지 않고 조회한다.
- `purpose`: 용도. `VERIFY_EMAIL`은 회원가입, `RESET_PASSWORD`는 비밀번호 재설정이다.
- `token_hash`: 6자리 인증번호의 해시값. 원문은 저장하지 않는다. 경우의 수가 적어 일반 해시는 전수 대입으로 바로 복원되므로, 서버 비밀키를 쓰는 HMAC-SHA256으로 저장한다. 서로 다른 이메일에 같은 번호가 나올 수 있어 중복을 허용한다.
- `attempt_count`: 틀린 횟수(0~5). 5회가 되면 인증번호를 무효로 한다. 기본값은 0이다.
- `expires_at`: 인증번호 만료 시각. 발송 후 5분이다.
- `used_at` (비어도 됨): 인증에 성공했거나 재발송·5회 오답으로 무효가 된 시각. 비어 있으면 아직 유효한 인증번호다.
- `created_at`: 발송 시각. 재발송 제한(1분 간격, 하루 5회)을 셀 때 쓴다.
- 이메일·용도별로 `used_at`이 빈 행은 하나만 둘 수 있다: 새로 보내기 전에 이전 인증번호를 무효로 해야 한다.

## `problems` — 문제의 고정 정보

- `id` (PK): 서비스 내부 문제 번호.
- `slug` (중복 불가): URL 등에 쓸 수 있는 문제 식별 문자열. 제목이나 지문이 바뀌어도 문제 자체를 구별한다.
- `created_at`: 문제 행이 만들어진 시각. 기본값은 DB의 현재 시각이다.

## `problem_versions` — 문제 콘텐츠 버전

- `id` (PK): 문제 버전의 내부 번호.
- `problem_id` (FK): 이 버전이 속한 문제(`problems.id`).
- `version_no`: 해당 문제의 버전 번호. 1부터 시작한다.
- `title`: 문제 제목.
- `difficulty`: 난이도. `EASY`, `MEDIUM`, `HARD` 중 하나다.
- `statement_markdown`: 문제 지문. Markdown 형식으로 저장한다.
- `input_description`: 입력 형식 설명. 지문과 같은 Markdown 형식(수식 포함)으로 저장한다.
- `output_description`: 출력 형식 설명. 지문과 같은 Markdown 형식(수식 포함)으로 저장한다.
- `constraints_markdown`: 입력 범위 등 제약 조건 설명. 비어 있으면 빈 문자열을 저장한다.
- `source_name` (비어도 됨): 문제 출처 이름.
- `source_url` (비어도 됨): 원문 또는 출처 링크.
- `license` (비어도 됨): 문제 콘텐츠의 라이선스.
- `status`: 편집·공개 상태. `DRAFT`, `VALIDATING`, `PUBLISHED`, `RETIRED` 중 하나다.
- `published_at` (비어도 됨): 공개한 시각. 아직 공개하지 않았으면 비어 있다. `PUBLISHED` 상태에서는 반드시 있어야 한다.
- `created_at`: 이 버전 행이 만들어진 시각.
- `(problem_id, version_no)` 중복 불가: 한 문제 안에서 버전 번호가 겹치지 않게 한다.

## `problem_language_configs` — 언어별 문제 설정

- `problem_version_id` (복합 PK의 일부, FK): 설정이 적용되는 문제 버전. 버전을 삭제하면 설정도 삭제된다.
- `language` (복합 PK의 일부): 프로그래밍 언어. 현재 허용값은 `PYTHON`, `CPP`다.
- `(problem_version_id, language)` 복합 PK: 같은 버전에 같은 언어 설정을 두 번 만들지 못하게 한다.
- `time_limit_ms`: 해당 언어의 시간 제한(밀리초). 0보다 커야 한다.
- `memory_limit_mb`: 해당 언어의 메모리 제한(MB). 0보다 커야 한다.
- `starter_code`: 에디터에서 시작 코드로 보여 줄 코드. 기본값은 빈 문자열이다.

## `concept_tags` — 개념 태그 목록

- `id` (PK): 개념 태그 내부 번호.
- `slug` (중복 불가): 코드나 URL에서 안정적으로 사용할 태그 식별 문자열.
- `name` (중복 불가): 화면에 표시할 태그 이름.

## `problem_version_tags` — 문제 버전과 태그 연결

- `problem_version_id` (복합 PK의 일부, FK): 태그가 붙는 문제 버전. 버전을 삭제하면 연결도 삭제된다.
- `concept_tag_id` (복합 PK의 일부, FK): 연결할 개념 태그.
- `(problem_version_id, concept_tag_id)` 복합 PK: 같은 태그를 한 버전에 중복으로 붙이지 못하게 한다.

## `test_cases` — 공개 예제와 채점 테스트

- `id` (PK): 테스트 케이스 내부 번호.
- `problem_version_id` (FK): 케이스가 속한 문제 버전. 버전을 삭제하면 케이스도 삭제된다.
- `ordinal`: 해당 버전 안에서의 케이스 순서. 1부터 시작하며 버전 안에서 중복될 수 없다.
- `case_type`: 공개 예제인지 비공개 채점 케이스인지 구분한다. `SAMPLE` 또는 `HIDDEN`이다.
- `input_data`: 프로그램에 전달할 입력 데이터.
- `expected_output`: 정답 프로그램이 내야 하는 출력.
- `created_at`: 테스트 케이스가 만들어진 시각.
- `(id, problem_version_id)` 중복 불가: 제출 결과가 다른 버전의 테스트 케이스를 잘못 참조하지 않도록 하는 연결 규칙이다.

비공개 케이스의 실제 입력·기대 출력은 공개 저장소에 커밋하지 않는다. 사용자 API에도 반환하지 않는다.

## `reference_solutions` — 내부 검증용 정답 코드

- `id` (PK): 정답 코드 행의 내부 번호.
- `problem_version_id` (FK): 코드가 검증하는 문제 버전. 버전을 삭제하면 코드도 삭제된다.
- `language`: 코드 언어. `PYTHON`, `CPP` 중 하나다.
- `solution_role`: 코드의 용도. `REFERENCE` 또는 `BRUTE`다. 관리자 API는 지금 `REFERENCE`만 받는다 — 화면에서 용도를 고를 수 없고, `BRUTE`를 쓸지는 #157에서 정한다.
- `source_code`: 내부 검증용 코드. 사용자에게 제공하지 않는다.
- `verified_at` (비어도 됨): 정답 코드가 모든 케이스를 통과한 시각. 케이스나 코드가 바뀌면 비운다.
- `(problem_version_id, language, solution_role)` 중복 불가: 한 버전·언어·역할 조합에 같은 종류의 코드를 하나만 둔다.

## `submissions` — 예제 실행, 사용자 제출, 정답 코드 검증

- `id` (PK): 실행 또는 제출의 내부 번호.
- `user_id` (FK): 실행을 한 사용자. 사용자를 삭제하면 제출도 삭제된다.
- `problem_version_id` (FK): 실행한 문제 버전.
- `submission_kind`: `SAMPLE_RUN`은 공개 예제 실행, `SUBMIT`은 실제 채점 제출, `VALIDATION`은 관리자의 정답 코드 검증이다. 제출 기록(HIST)에는 `SUBMIT`만 보여 주고, `SAMPLE_RUN`과 `VALIDATION`은 보여 주지 않는다. `VALIDATION`은 풀이 통계에서도 제외한다.
- `reference_solution_id` (비어도 됨, FK): 검증한 정답 코드. `VALIDATION`일 때만 있고 나머지는 비어 있어야 한다. 정답 코드를 삭제하면 검증 제출도 삭제된다.
- `language`: 제출 코드 언어. `PYTHON`, `CPP` 중 하나다.
- `source_code`: 실행한 코드. UTF-8 기준 최대 64KB이며 NUL을 포함할 수 없다(서비스에서 검사).
- `job_status`: 처리 단계. `QUEUED`, `COMPILING`, `RUNNING`, `COMPLETED`, `JUDGE_ERROR` 중 하나다.
- `progress`: 채점 진행률(0~100).
- `verdict` (비어도 됨): 최종 판정. `ACCEPTED`, `PRESENTATION_ERROR`, `WRONG_ANSWER`, `TIME_LIMIT_EXCEEDED`, `MEMORY_LIMIT_EXCEEDED`, `OUTPUT_LIMIT_EXCEEDED`, `RUNTIME_ERROR`, `COMPILE_ERROR` 중 하나다. 아직 판정 전이거나 채점 서버 오류면 비어 있을 수 있다.
- `runtime_error_type` (비어도 됨): 런타임 오류의 세부 종류.
- `compiler_message` (비어도 됨): 컴파일 오류 설명.
- `execution_time_ms` (비어도 됨): 전체 실행 시간(밀리초).
- `memory_used_kb` (비어도 됨): 사용 메모리(KB).
- `submitted_at`: 실행 또는 제출 시각.
- `judged_at` (비어도 됨): 채점이 끝난 시각.
- `(id, problem_version_id)` 중복 불가: 테스트 결과가 제출과 같은 문제 버전을 참조하게 하는 연결 규칙이다.

## `submission_test_results` — 제출별 케이스 판정

- `id` (PK): 케이스 결과 행의 내부 번호.
- `submission_id` (FK): 결과가 속한 제출. 제출을 삭제하면 결과도 삭제된다.
- `problem_version_id`: 제출과 케이스가 같은 버전인지 확인하는 데 쓰는 문제 버전 번호.
- `test_case_id` (FK): 판정한 테스트 케이스. 결과가 있는 테스트 케이스는 삭제할 수 없다.
- `judge_token` (비어도 됨, 중복 불가): Judge0가 이 케이스 실행에 발급한 토큰. API가 재시작돼도 이 값으로 결과를 다시 조회한다.
- `verdict` (비어도 됨): 해당 케이스의 판정. 채점 중이거나, 컴파일 에러·채점 서버 오류로 제출이 끝나 실행되지 않았으면 비어 있다. 컴파일 오류는 제출 단위로 기록하므로 포함하지 않는다.
- `runtime_error_type` (비어도 됨): 해당 케이스의 런타임 에러 종류(`judge-verdict-mapping.md` 4절). 판정이 `RUNTIME_ERROR`일 때만 있다. 비공개 케이스는 stderr를 저장하지 않으므로 결과를 받을 때 종류를 정해 남긴다.
- `internal_error_retried`: Judge0 내부 오류(status 13)로 이 케이스를 이미 한 번 다시 보냈는지. API가 재시작해도 다시 보내기는 한 번뿐이다.
- `execution_time_ms` (비어도 됨): 해당 케이스의 실행 시간.
- `memory_used_kb` (비어도 됨): 해당 케이스의 메모리 사용량.
- `stdout`, `stderr` (비어도 됨): 프로그램의 실제 출력과 에러 원문. `SAMPLE` 케이스에만 저장하며 최대 65,536자다. 깨진 바이트와 NUL은 `U+FFFD`로 바꿔 저장한다.
- `(submission_id, test_case_id)` 중복 불가: 같은 케이스의 결과를 같은 제출에 두 번 기록하지 못하게 한다.
- 복합 FK 두 개: 제출과 테스트 케이스가 같은 문제 버전에 속하는지 확인한다.

공개 예제 결과는 예제 실행에서 기대 출력과 실제 출력 비교·에러 원문 표시에, 제출 결과에서 에러 원문 표시에 쓰고, AI 분석 입력에도 쓴다. 숨겨진 케이스 번호, 실패 여부, 입력·기대 출력은 사용자에게 노출하지 않는다.

## `ai_reviews` — AI 분석·코드 리뷰

- `id` (PK): AI 결과 행의 내부 번호.
- `submission_id` (FK): 분석하거나 리뷰한 제출. 제출을 삭제하면 결과도 삭제된다.
- `review_type`: `ANALYSIS`는 오답 분석·힌트, `CODE_REVIEW`는 정답 코드 리뷰다.
- `prompt_version`: 결과를 만든 프롬프트의 버전.
- `model`: 사용한 AI 모델 이름.
- `status`: `PENDING`, `COMPLETED`, `FAILED` 중 하나.
- `content` (비어도 됨): 설명·힌트를 담은 구조화 JSON. 완료 전에는 비어 있을 수 있다.
- `input_tokens`, `output_tokens` (비어도 됨): AI 요청·응답 토큰 수.
- `cost_usd` (비어도 됨): 해당 AI 처리 비용(미국 달러).
- `revealed_hint_level`: 사용자가 공개한 힌트 단계(0~3).
- `created_at`: AI 결과 행을 만들거나 마지막으로 재시도한 시각. 일일 AI 한도를 셀 때 기준으로 쓴다(`FAILED` 행은 제외).
- `completed_at` (비어도 됨): 처리가 끝난 시각.
- `(submission_id, review_type, prompt_version)` 중복 불가: 같은 제출·기능·프롬프트 결과를 재사용하게 한다.

## `review_feedback` — AI 결과 피드백

- `id` (PK): 피드백 행의 내부 번호.
- `ai_review_id` (FK, 중복 불가): 평가한 AI 결과. 결과 하나당 피드백은 하나만 둘 수 있다. AI 결과를 삭제하면 피드백도 삭제된다.
- `helpful`: 사용자에게 도움이 되었는지 여부.
- `reason` (비어도 됨): 도움이 된 이유나 아쉬운 점.
- `created_at`: 피드백을 남긴 시각.

## `user_problem_stats` — 사용자별 문제 풀이 통계

- `user_id` (복합 PK의 일부, FK): 통계를 소유한 사용자. 사용자를 삭제하면 통계도 삭제된다.
- `problem_id` (복합 PK의 일부, FK): 통계를 계산할 문제.
- `(user_id, problem_id)` 복합 PK: 사용자마다 문제별 통계 행 하나만 둔다.
- 갱신 시점: 행 생성과 `solved`·`first_solved_at`·`attempt_count` 갱신은 `SUBMIT` 제출의 `job_status`가 `COMPLETED`(판정 확정)가 될 때만 한다. 컴파일 에러도 판정이므로 시도에 포함한다. 채점 중(`QUEUED`/`COMPILING`/`RUNNING`)이거나 `JUDGE_ERROR`인 제출은 반영하지 않는다. `max_revealed_hint_level`은 힌트를 공개할 때 `solved`가 거짓이면 더 큰 값으로 갱신한다. 힌트는 판정이 난 제출에서만 열 수 있어 이때 행은 이미 있고, 정답 이후에 연 힌트는 세지 않는다. 문제 목록의 풀이 상태(LIST-01)는 `solved`가 참이면 맞음, 행이 있고 거짓이면 틀림, 행이 없으면 안 품이다.
- `solved`: 정답을 맞힌 적이 있는지.
- `first_solved_at` (비어도 됨): 처음 정답을 맞힌 시각. `solved`가 참이면 반드시 있고, 거짓이면 비어 있어야 한다.
- `attempt_count`: 첫 정답까지의 채점 제출 수(첫 정답 제출 포함). 맞히지 못했으면 지금까지의 제출 수다. 정답 이후 제출은 세지 않아, 정답 후 개선 제출이 취약 점수를 올리지 않는다. 예제 실행, 정답 코드 검증, 채점 서버 오류는 제외한다.
- `max_revealed_hint_level`: 첫 정답까지의 제출에서 연 가장 높은 힌트 단계(0~3). 힌트를 열지 않았으면 0이다. 태그별 평균 힌트 단계는 이 값을 문제 단위로 평균 낸다.
- `updated_at`: 집계값을 마지막으로 갱신한 시각.

## `learning_reports` — 날짜별 학습 리포트

- `id` (PK): 리포트 내부 번호.
- `user_id` (FK): 리포트를 소유한 사용자. 사용자를 삭제하면 리포트도 삭제된다.
- `report_date`: 하루 제한을 적용할 기준 날짜(UTC).
- `status`: `PENDING`, `COMPLETED`, `FAILED` 중 하나. 기본값은 `PENDING`이다.
- `statistics`: 서버가 계산한 통계 JSON.
- `content` (비어도 됨): AI가 작성한 리포트 내용 JSON. 완료 전에는 비어 있을 수 있다.
- `model` (비어도 됨): 리포트를 만든 AI 모델.
- `generated_at`: 리포트 생성 요청 행을 만들거나 마지막으로 재시도한 시각.
- `(user_id, report_date)` 중복 불가: 사용자별 하루 한 건만 허용한다.

## `learning_report_recommendations` — 리포트 추천 문제

- `learning_report_id` (복합 PK의 일부, FK): 추천이 포함된 리포트. 리포트를 삭제하면 추천도 삭제된다.
- `rank` (복합 PK의 일부): 추천 순위(1~3).
- `(learning_report_id, rank)` 복합 PK: 한 리포트 안에서 같은 순위를 중복할 수 없다.
- `problem_id` (FK): 추천 대상 문제. 누르면 그 문제의 지금 공개 버전으로 간다.
- `concept_tag_id` (비어도 됨, FK): 추천 이유가 연결된 취약 개념 태그.
- `reason`: 이 문제를 추천한 이유.
- `(learning_report_id, problem_id)` 중복 불가: 같은 문제를 한 리포트에 두 번 추천하지 못하게 한다.
- 문제 버전은 가리키지 않는다. 버전을 가리키면 관리자가 공개 버전의 태그를 고칠 때 추천 행이 막는다. 추천할 때 그 태그가 문제의 공개 버전에 붙어 있는지는 추천을 만드는 서비스가 확인한다.

## 아직 정할 정책

- AI 결과 통계(성공한 분석 수 등)가 필요해지면, `content`의 차단 표시 대신 `ai_reviews.status`에 `BLOCKED`를 추가하는 마이그레이션을 검토한다. 지금은 `COMPLETED` 중 `content->>'blocked'`가 참인 행이 차단 건이다.
- 문제 공개 조건, 태그 1~3개, 언어별 설정 존재 여부처럼 여러 행을 봐야 하는 조건은 DB 제약이 아니라 게시·관리 서비스가 확인한다.

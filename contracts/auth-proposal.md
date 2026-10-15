# 인증 API — 프론트엔드가 만든 것과 실제 계약의 차이

> **실제 계약이 들어왔다.** `contracts/openapi.yaml`(PR #92·#93)이 인증 방식을 정했고, 그 결정은 이 문서의
> 이전 판이 요청했던 것과 반대였다. 그래서 이 문서는 더 이상 백엔드에 보내는 요청서가 아니다.
>
> **그런데 이 화면을 계약에 바로 붙일 수는 없다.** 헤더의 사용자 메뉴와 관리자 메뉴는 닉네임과 역할이
> 있어야 그려진다. 계약에는 그 둘을 주는 경로가 없고(`/api/me`가 없다), 로그인 응답은 `{ accessToken }`
> 하나뿐이며(`contracts/openapi.yaml` 246~251행), access token의 클레임은 `sub`·`role`·토큰 버전이고
> 닉네임은 없다(`api/src/main/java/com/codingmon/api/auth/AuthTokenService.java` 101~111행). 그 길이
> 정해지기 전에 연동하면 화면이 사용자를 이름으로 부를 수 없다. 3절이 그 열린 질문이다.
>
> 지금 이 문서의 용도는 셋이다. 프론트가 무엇을 기준으로 만들어졌는지 남기고, 그것이 계약과 어디서
> 다른지 적고, 연동할 때 무엇을 고쳐야 하는지 알려 준다. 프론트 동작에 대한 서술은 모두 파일을 짚어
> 두었으니 그 파일에서 확인할 수 있다. 계약 본문은 옮겨 적지 않는다. `contracts/openapi.yaml`을 본다.
>
> 형식은 `contracts/problems-list-proposal.md`를 따른다.

## 요약

| 구분                  | 항목                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 프론트가 지금 하는 것 | 임시 엔드포인트 셋(`/api/me`, `/api/auth/login`, `/api/auth/logout`)과 서버가 심는 세션 쿠키                     |
| 계약과 다른 것        | 세션 모델(쿠키 세션 대 메모리 access token), 로그인 응답 모양, 갱신(COM-04) 미구현, 오류 본문의 `code`·`instance` |
| 아직 정해지지 않은 것 | 닉네임·역할이 프론트에 오는 길                                                                                   |
| 백엔드에 요청         | 위의 그 길 하나. 로그인 실패 구분 없음과 미가입 이메일 제한은 #93이 이미 지켰다                                  |
| 만들지 않은 것        | COM-04 토큰 갱신, COM-02 GitHub 로그인                                                                           |

## 1. 프론트가 지금 하는 것

프론트는 계약이 없던 때 손으로 적은 임시 계약을 기준으로 만들어졌다. 임시 경로와 타입은
`web/src/api/provisional.ts`의 `ProvisionalPaths`에 있다 (121~136행).

| 엔드포인트              | 프론트가 가정한 것                                    | 호출하는 곳                                      |
| ----------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| `GET /api/me`           | 로그인이면 200과 `AuthUser`, 비로그인이면 401         | `web/src/features/auth/authQuery.ts`의 `meQuery` |
| `POST /api/auth/login`  | 본문 `{ email, password }`, 성공이면 200과 `AuthUser` | 같은 파일의 `loginRequest`                       |
| `POST /api/auth/logout` | 본문 없음, 성공이면 204                               | 같은 파일의 `logoutRequest`                      |

`AuthUser`는 `{ id: number, nickname: string, role: 'USER' | 'ADMIN' }`다 (`provisional.ts`).

세션은 서버가 심는 쿠키다. 프론트는 토큰을 들고 있지 않고, `web/src/api/client.ts`의 `clientOptions`가
`credentials: 'same-origin'`으로 요청을 보낸다 (18행). 헤더에 `Authorization`을 싣는 코드는 없다.

그 위에서 화면이 하는 일은 다음과 같다.

- 로그인 상태는 `meQuery`가 정한다. 401은 오류가 아니라 `null`(비로그인)이고, 그 밖의 오류는 던진다
  (`authQuery.ts` 35~47행).
- 화면이 보는 `useAuth`는 오류를 내보내지 않는다. `/api/me`가 500이어도 `user`가 `null`이 되어 비로그인과
  구분되지 않는다 (`web/src/features/auth/useAuth.ts` 28~31행).
- 로그인에 성공하면 응답의 `AuthUser`를 `['me']` 캐시에 바로 넣고 원래 가려던 곳으로 이동한다
  (`web/src/features/auth/LoginPage.tsx` 28~38행).
- 로그아웃은 서버 요청이 실패해도 캐시를 전부 비우고 `/problems`로 간다
  (`web/src/features/auth/useLogout.ts` 21~27행).
- 실패한 응답은 본문이 있으면 그 필드를 두고 `status`만 HTTP 상태 코드로 덮어 올린다. 본문이 없거나
  객체가 아니면 `{ status }`만 올린다 (`authQuery.ts`의 `fail`, 17~22행).
- 로그인 화면은 401과 429를 상태 코드만 보고 COM-07 문구로 바꾼다. `type`과 `code`는 보지 않는다
  (`web/src/features/auth/loginSchema.ts`의 `loginErrorMessage`, 32~46행).
- 비로그인이 보호된 화면(문제 상세 포함)에 가면 로그인 화면으로 보낸다. 이 판단은 라우터의 `RequireAuth`가
  `useAuth()`로 내린다 (`web/src/app/RequireAuth.tsx` 8~20행). `useAuth()`는 `meQuery`, 곧 `GET /api/me`의
  결과를 읽는다 (`useAuth.ts` 33~36행). 그래서 계약에 없는 바로 그 엔드포인트에 가드가 기댄다. 로그인 상태를
  얻는 길이 바뀌면 `useAuth`와 함께 가장 먼저 바뀌는 곳이다.

## 2. 계약과 다른 점

| 항목               | 계약 (`contracts/openapi.yaml`)                                                                              | 프론트                                                                                                                           | 연동 때 바꿀 곳                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 세션 모델          | access token을 응답 본문으로 받아 **메모리에만** 두고 `Authorization: Bearer`로 보낸다. refresh token은 쿠키 | 서버가 심은 세션 쿠키. 프론트는 토큰을 들지 않는다                                                                               | `web/src/api/client.ts`(헤더를 싣는 방법, 쿠키 옵션), `authQuery.ts`(로그인 응답에서 토큰을 받아 보관), `useLogout.ts`, `web/src/api/provisional.ts`(`ProvisionalPaths`와 `AuthUser`), `web/src/mocks/handlers.ts`·`web/src/mocks/fixtures/users.ts`(쿠키 세션을 구현하고 갱신 핸들러가 없다), 그리고 `['me']` 캐시를 직접 채우는 테스트(`web/src/features/auth/useLogout.test.tsx`) |
| 로그인 응답        | `{ accessToken }`만 준다 (246~251행). 사용자 객체가 없다                                                     | `AuthUser`를 받아 `['me']` 캐시에 넣는다                                                                                         | `authQuery.ts`의 `loginRequest` 반환 타입, `LoginPage.tsx`의 캐시 채우기(28~38행). 3절이 정해지면 그 길에서 사용자를 받아 온다                                                                                                                                                                                                                                                   |
| 로그인 상태 확인   | 계약에 `/api/me`가 없다                                                                                      | `/api/me`로 묻는다. `meQuery`의 `staleTime`이 60초라 전체 로드 때, 또는 데이터가 낡은 뒤 마운트될 때 나간다 (`authQuery.ts` 44행) | `authQuery.ts`의 `meQuery`, `useAuth.ts`. 3절의 열린 질문이 정해져야 한다                                                                                                                                                                                                                                                                                                        |
| 로그아웃           | `POST /api/auth/logout`, 쿠키가 없거나 모르는 토큰이어도 204. 이 기기만 끝낸다 (213~228행)                   | 같은 경로·같은 204를 가정한다                                                                                                    | 다르지 않다. 쿠키 `Path`가 `/api/auth`라 브라우저가 이 요청에 refresh token을 실어 준다                                                                                                                                                                                                                                                                                         |
| 토큰 갱신 (COM-04) | `POST /api/auth/refresh`가 명세돼 있다. 5절에 요약                                                           | 구현하지 않았다                                                                                                                  | `client.ts`에 401을 받으면 갱신하고 한 번 다시 보내는 층을 더한다                                                                                                                                                                                                                                                                                                               |
| 오류 본문          | RFC 9457이고 `ProblemDetail`에 `code`(화면이 경우를 나눌 코드)와 `instance`가 있다 (253~267행)                | `ProblemDetail`에 둘 다 없다 (`web/src/constants/errors.ts` 2~7행). 401·429를 상태 코드로만 가른다                                | `errors.ts`에 `code?: string`과 `instance?: string`을 더하면 `LOGIN_FAILED`·`LOGIN_LOCKED`로 가를 수 있다. 지금도 화면 결과는 같다 — 서버의 `detail`이 COM-07 문구와 글자까지 같다 (`AccountService.java` 23행·99행)                                                                                                                                                              |
| 보호된 화면의 접근 | 문제 목록·개념 태그만 비로그인 가능, 문제 상세는 로그인 필요                                                 | 라우터가 문제 상세를 `RequireAuth` 아래에 둔다 (`router.tsx`)                                                                    | 다르지 않다. 계약이 `/api/problems/{id}`를 명세하면 맞는지 확인한다                                                                                                                                                                                                                                                                                                              |

## 3. 아직 정해지지 않은 것

로그인·로그아웃 엔드포인트는 #93이 정했다. 그 모양과 프론트의 차이는 2절에 있다. 남은 질문은 하나다.

**닉네임과 역할이 프론트에 오는 길.** 헤더의 사용자 메뉴와 관리자 메뉴가 둘 다 필요하다.
길은 크게 두 가지다 — access token이 JWT이므로 클레임에 담거나, 별도 엔드포인트(`/api/me` 등)를 둔다.
로그인·갱신 응답에 사용자 객체를 함께 담는 길도 있다.
지금 `AuthTokenService.java`가 발급하는 클레임은 `sub`(사용자 id), `role`, 토큰 버전이고
닉네임은 없다 (`accessToken` 메서드, 101~111행). 클레임은 발급 시점에 고정되므로, 닉네임을
담으면 사용자가 닉네임을 바꿔도 토큰이 만료될 때까지 옛 값이 남는다. 엔드포인트로 가면 요청이
하나 더 든다. 어느 쪽이 나은지는 계약이 정하지 않았고 이 문서도 정하지 않는다.

엔드포인트로 간다면 `/api/auth/**` 아래에 두면 안 된다. 그 아래에서는 서버가 `Authorization` 헤더를
읽지 않아 호출자를 확인해 주지 않는다 (`SecurityConfig.java` 52~57행).

## 4. 백엔드에 요청 — 계약이 정하지 않았지만 프론트에 꼭 필요한 것

**3절의 그 길 하나다.** 닉네임과 역할을 받지 못하면 헤더와 관리자 가드를 계약에 붙일 수 없다.

이전 판이 요청했던 두 가지는 #93이 지켰다. 기록만 남긴다.

- **로그인 실패는 이유를 구분하지 않는다.** 없는 이메일, GitHub로 가입한 계정, 비밀번호 불일치가 모두
  401 `LOGIN_FAILED`와 같은 문구다 (`AccountService.java`의 `login`, 91~115행). 가입할 수 없는 길이의
  이메일(320자 초과)도 조회 없이 같은 문구로 답한다 (`AccountRules.java` 11행). 프론트는 상태 코드만
  보므로 이 구분 없음은 서버만 지킬 수 있다.
- **로그인 제한은 가입되지 않은 이메일에도 건다.** 실패를 이메일 기준으로 세고, 제한 중이면 429
  `LOGIN_LOCKED`를 준다 (`AccountService.java` 97~100행). 사용자가 없을 때도 더미 해시로 비교한 뒤
  실패를 기록한다 (101~107행). **이 부분을 확인하는 프론트 테스트는 없다.** 서버 테스트의 몫이다.

서버도 이메일은 앞뒤 공백을 떼고(`AccountService.java` 92행), 비밀번호는 떼지 않는다(103행).
프론트의 입력 처리와 같다 (`loginSchema.ts`).

## 5. 프론트가 만들지 않은 것

### COM-04 토큰 갱신 — 이제 명세돼 있다

`contracts/openapi.yaml`의 `POST /api/auth/refresh`와 `AuthTokenService.java`의 `refresh`(58~79행)가 정한
동작을 프론트는 아직 하나도 구현하지 않았다. 구현할 때 지켜야 할 것은 다음과 같다.

- 평소 요청의 401은 두 가지 이유로 온다. access token이 만료됐거나, 비밀번호 재설정으로 access token이
  무효가 된 경우다 (`contracts/openapi.yaml`의 `info.description`). 어느 쪽이든 `POST /api/auth/refresh`로
  갱신하고, 갱신도 401이면 로그인 화면으로 보낸다. 재설정하면 모든 기기에서 로그아웃되고 발급된
  로그인 유지 토큰이 폐기되므로(`docs/feature-spec.md` COM-08), 재설정 뒤의 갱신은 실패한다.
- **갱신 층은 `POST /api/auth/login`의 401에 적용하면 안 된다.** 그 401은 자격 증명 실패이므로 갱신하지
  않고 COM-07 문구를 그대로 보여 줘야 한다 (`loginSchema.ts`의 `loginErrorMessage`, 38~40행). `client.ts`에
  층을 더할 때 로그인 요청을 제외해야 한다.
- 갱신하면 refresh token도 새 값으로 바뀐다(회전).
- **탭끼리 갱신을 직렬화해야 한다.** 계약은 프론트가 Web Locks(`navigator.locks.request`)로 갱신을 한 번에
  하나씩 보내는 것을 전제로 쓰였다 (`contracts/openapi.yaml`의 `/api/auth/refresh` 설명, 29행). 앞 탭의
  응답으로 쿠키가 바뀐 뒤 다음 탭이 요청하므로 같은 토큰이 동시에 나가지 않는다. 이 직렬화를 빼면
  아래 두 줄의 일이 실제로 일어난다.
- **방금 바뀐 refresh token을 다시 보내면 401만 온다.** 그 시간은 **10초**다 (`AuthTokenService.java`
  33행의 `REUSE_GRACE = Duration.ofSeconds(10)`). 직렬화가 있으면 이 401은 오지 않아야 하지만, 왔다면
  쿠키가 이미 새 값이므로 한 번 다시 시도한다 (같은 파일 67행의 주석).
- **교체된 지 10초가 넘은 refresh token을 다시 보내면 탈취로 본다.** 서버가 같은 로그인에서 나온 토큰을
  모두 폐기한다 (`AuthTokenService.java` 66~73행).
- 갱신 요청은 `/api/auth/**` 아래라 서버가 `Authorization` 헤더를 읽지 않는다. 만료된 토큰을 붙여도
  막히지 않는다 (`SecurityConfig.java` 52~57행).
- 한 탭 안에서도 여러 요청이 동시에 401을 받는다. 갱신은 한 번만 보내고 나머지 요청은 그 결과를
  기다려야 한다.

### COM-02 GitHub 로그인

화면에 없다. 계약에도 아직 없다. 정해야 할 것은 GitHub OAuth 앱 등록(누가 어느 계정으로), 리다이렉트
URI(개발·운영 각각), 서버 쪽 콜백 처리와 성공·신규 가입(닉네임 입력) 뒤 프론트로 돌려보내는 방식이다.

## 6. 목은 명세가 아니다

목은 `web/src/mocks/handlers.ts`와 `web/src/mocks/fixtures/users.ts`에 있다. 개발과 테스트용 가짜 응답이다.

- **가장 중요한 점: 목은 계약이 버린 쿠키 세션 설계를 구현한다.** 로그인이 `codari_session` 쿠키를 심고,
  `/api/me`가 그 쿠키로 사용자를 찾는다 (`handlers.ts` 63~66, 78행, `users.ts` 9행). 갱신 핸들러는 없다.
  이 문서의 중심 주제에서 목은 틀렸다.
- 쿠키는 `codari_session=<사용자 id>; Path=/; SameSite=Lax`이고 `HttpOnly`와 `Secure`가 없다
  (`handlers.ts` 78행). 이름과 값은 목이 정한 것이다. 실제 쿠키는 `refresh_token`, `HttpOnly`, `Secure`,
  `SameSite=Strict`, `Path=/api/auth`다.
- 로그인 핸들러는 실패 횟수를 세지 않는다. 시도 제한은 서버의 일이다 (`handlers.ts` 68~69행).
- 401 본문은 `{ status, title }`이다 (`handlers.ts` 14행). 실제 서버의 RFC 9457 본문에는 `status`가 없을 수
  있고 `code`가 더 있다. 프론트는 `fail()`로 HTTP 상태를 덮어 그 차이를 메운다 (`authQuery.ts` 17~22행).
- 비밀번호 불일치와 가입되지 않은 이메일을 똑같이 401로 다루는 것은 목이 계정 목록에서 이메일·비밀번호
  쌍을 찾는 방식의 부산물이다 (`handlers.ts` 72~73행). 서버가 실제로 그렇게 한다는 증거는 4절에 적은
  `AccountService.java`의 코드다. 목은 그 증거가 아니다.
- `GET /api/problems` 핸들러는 인증을 전혀 보지 않는다 (`handlers.ts` 29~61행, 42~45행의 주석).
  이것도 명세가 아니다.

## 7. 이 문서에 없는 것

회원가입(COM-06), 비밀번호 재설정(COM-08), 이메일 인증번호 발송은 이 화면(#20)의 범위가 아니라 다루지
않는다. #93이 가입 쪽 엔드포인트를 명세했으니 그 화면을 만들 때는 임시 계약 없이 `contracts/openapi.yaml`을
바로 보면 된다. 계정·비밀번호·인증번호 규칙의 값은 `docs/feature-spec.md`의 '계정 규칙'을 본다.

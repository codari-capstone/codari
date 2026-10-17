# 문제 목록 API — 프론트엔드 제안

> **이 문서는 결정이 아니라 제안이다.** #21(문제 목록 화면)을 만들면서 `web/src/api/provisional.ts`에
> 손으로 적어 둔 임시 계약을 그대로 옮긴 것이다. 명세(#2)와 목록 API(#25)가 실제 계약을 정한다.
> 실제 응답이 아래와 다르면 프론트가 맞춘다 — `npm run gen:api`로 타입을 다시 만들고, 화면이
> 기대하는 모양에 맞춰 `provisional.ts`를 생성된 타입으로 다시 잇는다. 화면 코드(컴포넌트, 쿼리
> 훅)는 호출부를 처음부터 최종 형태로 써 뒀으므로 그대로 둔다.
>
> 아래 중 **"꼭 필요한 것"**은 화면이 실제로 그 동작에 기대고 있어서 바뀌면 화면 코드가 깨지는
> 부분이다. **"프론트가 맞춰 둔 것"**은 이름이나 표기 방식이라 백엔드가 다르게 정해도 프론트가
> 흡수할 수 있는 부분이다.
>
> `contracts/README.md`는 이 디렉터리를 "OpenAPI 명세"로 설명하지만, 이 파일은 그 명세
> 자체가 아니다. `contracts/openapi.yaml`이 아직 없는 동안 쓰는 임시 Markdown 제안서이고,
> 실제 명세가 생기면 이 문서는 없어진다.

## 요약

| 구분 | 항목 |
| --- | --- |
| 꼭 필요한 것 | 풀이 상태 서버 역산·단일 값, `difficulty` 순위 정렬, 개념 태그 별도 엔드포인트, `Page` 형태 유지, 비로그인 요청의 `status` 무시 |
| 프론트가 맞춰 둔 것 | 비로그인 시 `null` 대신 필드 생략, `sort` 파라미터 형식, 배열 파라미터 전달 방식, 필드 이름(`solveStatus` 등), 화면 번호 = `problems.id` |

## 1. 타입

`web/src/api/provisional.ts`에서 그대로 가져왔다. DB 스키마(PR #60)와 기능명세(PR #61)에서
역산한 것이라 실제 스키마와 다를 수 있다.

```ts
type Difficulty = 'EASY' | 'MEDIUM' | 'HARD'
type SolveStatus = 'SOLVED' | 'WRONG' | 'UNSOLVED'

interface ConceptTag {
  slug: string
  name: string
}

interface ProblemSummary {
  id: number           // 화면에 보여 주는 번호. 별도 번호 컬럼 없음 (9번 참고)
  slug: string
  title: string
  difficulty: Difficulty
  tags: ConceptTag[]
  solveStatus?: SolveStatus   // 비로그인이면 필드 자체가 없음 (6번 참고)
}

interface Page<T> {
  content: T[]
  totalElements: number
}
```

## 2. 엔드포인트

### `GET /api/problems`

| 쿼리 파라미터 | 타입 | 설명 |
| --- | --- | --- |
| `keyword` | `string?` | 제목 부분 일치 |
| `difficulty` | `Difficulty[]?` | 반복 키 (8번 참고) |
| `tag` | `string[]?` | 개념 태그 slug, 반복 키 |
| `status` | `SolveStatus[]?` | 풀이 상태, 반복 키. 비로그인 요청이면 무시한다 (5번 참고) |
| `sort` | `string?` | Spring Data 형식 `'<field>,<direction>'` (7번 참고). 화면이 쓰는 `field`는 `id`, `difficulty`뿐 |

응답: `Page<ProblemSummary>` (`{ content: ProblemSummary[], totalElements: number }`)

### `GET /api/concept-tags`

파라미터 없음. 응답: `ConceptTag[]`. 문제 목록 필터와 무관하게 전체 태그를 항상 돌려준다 (3번 참고).

## 3. 꼭 필요한 것 — 이유와 함께

### ① 풀이 상태는 서버가 역산해 단일 값으로 내려 달라

`solveStatus`는 프론트가 계산하지 않는다. 계산하려면 목록 조회 한 번에 사용자의 제출 기록
전체를 받아야 하는데, 그건 목록 API의 책임 범위를 넘어선다.

판정 규칙은 PR #61의 `LIST-01`을 따른다 (`web/src/api/provisional.ts`의 `SolveStatus` 타입
주석에 적혀 있는 그대로):

- `SOLVED` — `submission_kind='SUBMIT'`인 제출 중 `verdict='ACCEPTED'`가 하나라도 있음
- `WRONG` — `SUBMIT` 제출은 있으나 `ACCEPTED`가 없음
- `UNSOLVED` — 위 둘 다 아님

`SAMPLE_RUN`과 `job_status='JUDGE_ERROR'`는 세지 않는다. 이 규칙에 이견이 있으면 `LIST-01` 자체를
다시 논의해야 할 문제이지, 프론트가 임의로 바꿀 수 있는 부분이 아니다.

### ② `difficulty` 정렬은 알파벳순이 아니라 `EASY < MEDIUM < HARD`다

문자열로 정렬하면 `EASY, HARD, MEDIUM` 순서가 되어 `HARD`(어려움)가 가운데에 온다. 이 문제가
가장 틀리기 쉬운 지점이라 따로 적는다. 프론트는 `DIFFICULTY_RANK = { EASY: 0, MEDIUM: 1, HARD: 2 }`를
MSW 목(mock)에서도 그대로 쓰고 있다 (`web/src/mocks/handlers.ts`). 실제 서버도 이 순위로
정렬해야 한다 — 문자열 컬럼이라면 `ORDER BY CASE difficulty WHEN 'EASY' THEN 0 ...` 같은 처리가
필요하다.

### ③ 개념 태그 목록은 별도 엔드포인트로 받아야 한다

문제 목록 응답에서 태그를 뽑아 쓰면, 필터를 걸수록 결과에 등장하는 태그 종류가 줄어들어
사용자가 선택할 수 있는 필터 옵션 자체가 줄어든다. 예를 들어 `난이도=HARD`로 좁히면 쉬운
문제에만 달린 태그가 선택지에서 사라지는데, 이건 "그 태그가 없다"가 아니라 "지금 필터로는
안 보인다"일 뿐이라 사용자를 혼란스럽게 한다. 전체 태그 목록은 필터 상태와 무관하게 항상
같아야 하므로 `/api/concept-tags`로 분리한다. 태그 필터가 필요한 다른 화면이 나중에 생기면
같은 엔드포인트를 재사용할 수 있을 것이다 — 다만 이건 가능성이고, 지금 확정된 다른 화면의
요구사항은 아니다.

### ④ `Page` 형태(`content`, `totalElements`)는 유지해 달라

이 화면은 한 페이지에 20개씩 보여 주고(`LIST-05`), 결과 개수 표시는 `totalElements`를
읽는다. `content.length`로 세면 보고 있는 페이지의 개수를 전체 개수로 내보이게 된다.
`page`·`size`를 받아 주고(#109가 선택 파라미터로 받는다) 응답은 `Page` 형태로 둬 달라.

처음 이 문서를 쓸 때는 페이지 나누기를 범위에서 뺐고, 그때도 응답 모양만은 `Page`로 둬
달라고 적었다. 그 뒤 범위에 들어왔는데 계약은 바뀌지 않았다 — 응답 모양을 미리 맞춰 둔
덕이다.

### ⑤ 비로그인 요청의 `status`는 무시하고 전체 목록을 내려 달라

로그인한 사용자가 `/problems?status=SOLVED`를 공유하면, 비로그인 방문자가 그 링크를 열었을 때
풀이 상태로 좁혀진 목록을 보게 되는데, `ProblemFilters`는 비로그인이면 풀이 상태 섹션
자체를 숨기므로(COM-05) 왜 좁혀졌는지 알려 주는 컨트롤이 화면에 없다. `parseParams`는
인증 여부를 묻지 않고 순수하게 URL을 읽어야 하므로(테스트하기 쉽고, 어디서 호출해도
같은 값을 내야 하므로) `status`를 인증 상태와 무관하게 그대로 들고 있고, `toQuery`도
그대로 쿼리에 싣는다 — 이건 프론트의 의도적인 설계다.

문제는 서버 쪽이다. #25가 `status`를 인증 주체와 대조해 검증한다면, 비로그인 요청에
`status`가 실려 있는 조합에 400을 줄 수 있는데, 그러면 화면 전체가 오류
상태로 덮인다 — 공유된 링크를 연 비로그인 방문자에게는 "조건에 안 맞는 목록"이 아니라
"고장난 화면"으로 보인다. 그래서 비로그인 요청이면 `status`를 조용히 무시하고 필터
없는 전체 목록을 돌려 달라고 요청한다. 이 판단에 동의하지 않는다면(예: 명시적으로
400을 주는 쪽을 선호한다면) 백엔드가 다르게 정해도 된다 — 다만 그 경우 프론트는
비로그인 + `status` 조합을 쿼리를 보내기 전에 걸러내는 처리를 `parseParams`나 `toQuery`
어느 한쪽에 추가해야 한다.

## 4. 프론트가 맞춰 둔 것 (백엔드가 다르게 정해도 되는 부분)

### ⑥ 비로그인 요청이면 `solveStatus`는 `null`보다 생략이 낫다

지금 화면에서 이 열이 보이는지는 응답이 아니라 로그인 상태(`useAuth`, 지금은 로그인
전으로 고정된 stub)로 정해지고, 셀 하나는 `problem.solveStatus`가 `null`이든 필드가
없든 똑같이 `'—'`를 그린다(`web/src/features/problems/ProblemTable.tsx`). 즉 지금은
`null`로 내려와도 화면이 깨지지 않는다 — 이건 "꼭 필요한 것"의 기준(바뀌면 화면 코드가
깨짐)을 넘지 못한다.

그래도 응답 설계로는 생략을 요청한다. 로그인(#18)이 붙으면 로그인한 사용자의 행은
`UNSOLVED`(안 품)라는 실제 답을 가질 수 있는데, 비로그인 요청은 애초에 "풀었는지"를
묻지 않은 상태다. `null`은 이 둘을 구분하지 않는다. `web/src/api/provisional.ts` 70번
줄 주석("없는 것과 '안 품'은 다른 의미다")이 프론트가 처음부터 가졌던 의도이고, 생략
쪽으로 맞춰 두면 그 구분이 응답 모양에 그대로 남는다.

### ⑦ `sort`는 Spring Data 규약 `'<field>,<direction>'`을 쓴다

예: `id,asc`, `difficulty,desc`. 화면이 쓰는 `field`는 `id`와 `difficulty` 둘뿐이다
(`web/src/features/problems/problemListParams.ts`의 `SortField`). 다른 파라미터 이름이나
형식(`sortBy=id&order=asc` 등)을 쓰고 싶다면 프론트가 `toQuery`/`parseParams` 두 함수만
고치면 되므로 알려 주면 된다.

### ⑧ 배열 파라미터는 반복 키로 보낸다

`?difficulty=EASY&difficulty=HARD` 형태다. 콤마로 묶은 문자열(`?difficulty=EASY,HARD`)로
보내지 않는다. 콤마로 묶으면 서버 입장에서 하나의 문자열 파라미터로 들어오고, 그 값이
`Difficulty` enum 중 어느 것과도 정확히 일치하지 않아 배열 필터가 조용히 전부 매칭 실패로
빠질 위험이 있다. 반복 키는 Spring의 `@RequestParam List<T>`가 기본으로 받는 형식이라 맞춰
뒀다.

### ⑨ 화면의 "번호"는 `problems.id`를 쓴다

스키마에 별도의 전시용 번호 컬럼이 없다는 전제로, `problems.id`를 그대로 화면 번호로
쓴다. 별도 번호 컬럼이 실제로 있다면 그 값을 쓰도록 바꾸면 된다 — 이건 어느 컬럼을 보여줄지의
문제라 이름만 맞으면 된다.

## 5. 이 문서에 없는 것

페이지네이션(`LIST-05`), 인증/인가 흐름(`COM-01~06`)의 세부, 제출·채점 API는 이 화면(#21)의
범위가 아니라 다루지 않는다.

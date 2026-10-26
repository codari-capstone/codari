import type { components, operations, paths } from './schema'

/**
 * 계약이 정한 도메인 타입. `npm run gen:api`가 만든 schema.d.ts를 별칭으로 다시 잇는다.
 *
 * 별칭을 두는 이유는 호출부가 `components['schemas']['ProblemSummary']`를 열 줄마다 적지
 * 않게 하려는 것뿐이다. 모양을 고칠 자리는 여기가 아니라 contracts/openapi.yaml이다.
 *
 * 아래 순위와 SOLVE_STATUSES는 손으로 유지한다 — OpenAPI는 enum의 값 배열이나
 * 정렬 순위를 만들어 주지 않는다.
 */

export type Difficulty = components['schemas']['Difficulty']

/** 풀이 상태 (LIST-01). 뜻은 계약의 description에 있다. */
export type SolveStatus = components['schemas']['SolveStatus']

/**
 * 로그인한 사용자 (COM-01·COM-05).
 *
 * 닉네임은 바뀔 수 있어 토큰이 아니라 `/api/users/me`로 받는다(계약 description).
 * 그래서 로그인 응답에는 토큰만 있고 이 모양은 따로 받아 온다.
 */
export type CurrentUser = components['schemas']['CurrentUser']

/** 권한. 관리자 메뉴를 보일지 가른다 (COM-05). */
export type Role = CurrentUser['role']

/**
 * 로그인 요청 본문 (COM-07).
 *
 * 계약에서 뽑는다. 손으로 적어 두면 계약이 바뀌어도 컴파일 오류 없이 옛 모양으로 읽는다 —
 * 목 핸들러가 그 타입을 쓰고 있어 더 그렇다.
 */
export type LoginRequest = NonNullable<
  paths['/api/auth/login']['post']['requestBody']
>['content']['application/json']

/**
 * 예제 실행 결과 (SOLVE-08).
 *
 * 제출 결과와 달리 `cases`로 예제별 실제 출력을 준다. **기대 출력은 없다** — 계약이
 * "예제의 입력·기대 출력은 담지 않는다. 화면은 문제 상세의 `samples`와 `ordinal`로
 * 짝짓는다"로 정했다.
 */
export type SampleRunResult = components['schemas']['SampleRunResult']

/** 예제 하나의 실행 결과. */
export type SampleRunCase = SampleRunResult['cases'][number]

/** 제출·채점에 쓰는 언어 (SOLVE-04). */
export type Language = components['schemas']['Language']

export type ConceptTag = components['schemas']['ConceptTag']
export type ProblemSummary = components['schemas']['ProblemSummary']
export type ProblemPage = components['schemas']['ProblemPage']

/**
 * 문제 상세 (SOLVE-01~04·06).
 *
 * 계약에서 이 이름은 `ProblemDetailView`다. `ProblemDetail`은 RFC 9457 오류 본문 쪽
 * 이름이고(constants/errors.ts의 같은 이름이 그쪽이다), 둘은 아무 관계가 없다.
 */
export type ProblemDetailView = components['schemas']['ProblemDetailView']

/**
 * 채점 상태·결과 (RES-01~07). 끝나지 않았으면 판정·시간·메모리가 null이다(계약).
 */
export type SubmissionResult = components['schemas']['SubmissionResult']

/** 채점 진행 상태. `COMPLETED`면 판정이 있고, `JUDGE_ERROR`면 서버 문제다. */
export type SubmissionStatus = SubmissionResult['status']

/** 판정 여덟 가지. 끝나기 전에는 null이라 벗겨 쓴다. */
export type Verdict = NonNullable<SubmissionResult['verdict']>

/** 런타임 에러 종류 여덟 가지. 판정이 RUNTIME_ERROR일 때만 있다(계약). */
export type RuntimeErrorType = NonNullable<SubmissionResult['runtimeErrorType']>

/** 목록 조회 쿼리. toQuery와 목 테스트가 이 타입에 맞춘다. */
export type ProblemListQuery = NonNullable<operations['listProblems']['parameters']['query']>

/**
 * 난이도 정렬 순위.
 *
 * difficulty를 문자열로 비교하면 EASY, HARD, MEDIUM이 된다 — 알파벳순이라
 * HARD가 가운데로 온다. 정렬하는 쪽은 반드시 이 순위를 쓴다.
 */
export const DIFFICULTY_RANK: Record<Difficulty, number> = { EASY: 0, MEDIUM: 1, HARD: 2 }

/**
 * URL에서 들어온 값을 걸러낼 때 쓴다. 표시 순서도 이 순서(쉬움부터)를 따른다.
 *
 * 위 Record에서 뽑는다. 따로 적으면 계약에 난이도가 하나 늘 때 Record는 타입 오류로
 * 알려 주는데 이 배열만 조용히 뒤처져, parseParams가 주소의 그 값을 버려 필터가 무시된다.
 */
export const DIFFICULTIES = Object.keys(DIFFICULTY_RANK) as readonly Difficulty[]

export const SOLVE_STATUSES: readonly SolveStatus[] = ['SOLVED', 'WRONG', 'UNSOLVED']

import type { components, operations } from './schema'

/**
 * 계약이 정한 도메인 타입. `npm run gen:api`가 만든 schema.d.ts를 별칭으로 다시 잇는다.
 *
 * 별칭을 두는 이유는 호출부가 `components['schemas']['ProblemSummary']`를 열 줄마다 적지
 * 않게 하려는 것뿐이다. 모양을 고칠 자리는 여기가 아니라 contracts/openapi.yaml이다.
 *
 * 아래 값 목록과 순위는 손으로 유지한다 — OpenAPI는 enum의 값 배열이나 정렬 순위를
 * 만들어 주지 않는다. 계약에 값이 늘면 타입은 자동으로 늘지만 이 배열은 안 늘어난다.
 */

export type Difficulty = components['schemas']['Difficulty']

/** 풀이 상태 (LIST-01). 뜻은 계약의 description에 있다. */
export type SolveStatus = components['schemas']['SolveStatus']

export type ConceptTag = components['schemas']['ConceptTag']
export type ProblemSummary = components['schemas']['ProblemSummary']
export type ProblemPage = components['schemas']['ProblemPage']

/** 목록 조회 쿼리. toQuery와 목 테스트가 이 타입에 맞춘다. */
export type ProblemListQuery = NonNullable<operations['listProblems']['parameters']['query']>

/** URL에서 들어온 값을 걸러낼 때 쓴다. 표시 순서도 이 순서를 따른다. */
export const DIFFICULTIES: readonly Difficulty[] = ['EASY', 'MEDIUM', 'HARD']
export const SOLVE_STATUSES: readonly SolveStatus[] = ['SOLVED', 'WRONG', 'UNSOLVED']

/**
 * 난이도 정렬 순위.
 *
 * difficulty를 문자열로 비교하면 EASY, HARD, MEDIUM이 된다 — 알파벳순이라
 * HARD가 가운데로 온다. 정렬하는 쪽은 반드시 이 순위를 쓴다.
 */
export const DIFFICULTY_RANK: Record<Difficulty, number> = { EASY: 0, MEDIUM: 1, HARD: 2 }

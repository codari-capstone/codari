import createClient from 'openapi-fetch'

import { clientOptions } from './client'

/**
 * 명세(#2) 확정 전까지 쓰는 임시 계약.
 *
 * DB 스키마(PR #60)와 기능명세(PR #61)에서 역산했다. openapi-typescript가 만드는
 * paths 모양을 그대로 흉내내므로, 명세가 확정되면 다음만 하면 된다.
 *   1. npm run gen:api 로 schema.d.ts 생성
 *   2. 이 파일을 지우고 import를 @/api/client 의 api 로 바꾼다 (problemsQuery.ts 한 곳)
 *   3. 타입 오류가 나는 곳이 실제 응답과 어긋난 곳이다. 거기만 고친다
 * 호출부의 모양은 손대지 않는다.
 */

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD'

/**
 * 풀이 상태. 서버가 submissions에서 역산한다 (LIST-01, PR #61).
 *   SOLVED   — submission_kind='SUBMIT' 중 verdict='ACCEPTED'가 하나라도 있음 (맞음)
 *   WRONG    — SUBMIT 제출은 있으나 ACCEPTED가 없음 (틀림)
 *   UNSOLVED — SUBMIT 제출이 없음. SAMPLE_RUN과 job_status='JUDGE_ERROR'는 세지 않는다 (안 품)
 */
export type SolveStatus = 'SOLVED' | 'WRONG' | 'UNSOLVED'

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

export interface ConceptTag {
  slug: string
  name: string
}

export interface ProblemSummary {
  /** 화면에 보여 주는 번호. 스키마에 별도 번호 컬럼이 없어 problems.id를 쓴다. */
  id: number
  slug: string
  title: string
  difficulty: Difficulty
  tags: ConceptTag[]
  /** 비로그인이면 서버가 생략한다 (COM-05). 없는 것과 '안 품'은 다른 의미다. */
  solveStatus?: SolveStatus
}

/** Spring Data의 Page 응답. api/client.test.ts가 이미 이 형태를 가정하고 있었다. */
export interface Page<T> {
  content: T[]
  totalElements: number
}

export interface ProvisionalPaths {
  '/api/problems': {
    get: {
      parameters: {
        query?: {
          keyword?: string
          difficulty?: Difficulty[]
          tag?: string[]
          status?: SolveStatus[]
          /** Spring Data 규약. 'id,asc' | 'id,desc' | 'difficulty,asc' | 'difficulty,desc' */
          sort?: string
        }
      }
      responses: { 200: { content: { 'application/json': Page<ProblemSummary> } } }
    }
  }
  '/api/concept-tags': {
    get: {
      responses: { 200: { content: { 'application/json': ConceptTag[] } } }
    }
  }
}

/** 목록 조회 쿼리. 테스트와 toQuery가 이 타입에 맞춘다. */
export type ProblemListQuery = NonNullable<
  ProvisionalPaths['/api/problems']['get']['parameters']['query']
>

/** 명세가 확정되면 이 클라이언트는 사라지고 api를 쓴다. */
export const provisionalApi = createClient<ProvisionalPaths>(clientOptions)

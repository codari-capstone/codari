import createClient from 'openapi-fetch'

import { clientOptions } from './client'

/**
 * 명세(#2)가 확정되기 전에 쓰던 임시 계약. 지금은 /api/me·로그인·로그아웃 셋만 쓴다.
 *
 * npm run gen:api는 이미 돌렸고, 가입·재설정은 api로 옮겨졌다. 나머지 셋은 COM-04를 기다린다.
 * 계약의 세션 모델(메모리 access token과 Authorization 헤더)이 지금 코드가 가정하는 것과
 * 달라서, 호출만 바꿔서는 옮겨지지 않는다.
 *
 * DB 스키마(PR #60)와 기능명세(PR #61)에서 역산했다. openapi-typescript가 만드는
 * paths 모양을 그대로 흉내내므로, 명세가 확정돼도 호출부의 모양은 바뀌지 않는다.
 *
 * 다만 이 파일 전체가 임시인 것은 아니다. 명세가 오면 이렇게 갈린다.
 *
 * 사라지는 것 — ProvisionalPaths, ProblemListQuery, provisionalApi.
 *   gen:api가 만든 schema.d.ts의 paths와 @/api/client의 api가 대신한다.
 *   화면 코드에서 provisionalApi를 쓰는 곳은 features 폴더 아래의 Query.ts 파일들이다.
 *   테스트도 같은 클라이언트로 요청하므로 함께 바꾼다.
 *
 * 남는 것 — Difficulty, SolveStatus, ConceptTag, ProblemSummary, Role, AuthUser,
 *   LoginRequest는 생성된 components['schemas']에서 별칭으로 다시 잇는다.
 *   DIFFICULTIES·SOLVE_STATUSES·DIFFICULTY_RANK는 손으로 유지한다 — OpenAPI는
 *   값 목록이나 정렬 순위를 만들어 주지 않는다. 화면·목 데이터·테스트가 이
 *   심볼들을 직접 import하므로 파일을 통째로 지우면 전부 깨진다.
 *
 *   Page<T>도 남지만 애매하게 남는다 — ProvisionalPaths 안에서만 쓰여 그 타입과
 *   함께 죽는 '사라지는 것' 성격도 있고, problemsQuery.ts·client.test.ts·
 *   handlers.test.ts가 직접 import해 쓰는 '남는 것' 성격도 있다. springdoc이
 *   자기 방식의 페이지 타입(보통 Spring Data의 PageImpl 계열)을 만들어 줄 것이므로,
 *   이 손으로 적은 Page<T>는 생성된 그 타입으로 별칭을 바꿔 가리키게 한다 — 새로
 *   만들지 않는다.
 *
 * 순서(남은 세 엔드포인트의 계획): npm run gen:api(완료) → provisionalApi를 api로 교체 → '사라지는 것' 삭제 →
 * 남는 타입을 schema.d.ts 기준으로 다시 잇는다. 타입 오류가 나는 곳이 실제 응답과
 * 어긋난 곳이다.
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

export type Role = 'USER' | 'ADMIN'

/** 로그인한 사용자. GET /api/me와 로그인 응답이 같은 모양을 돌려준다. */
export interface AuthUser {
  id: number
  nickname: string
  role: Role
}

export interface LoginRequest {
  email: string
  password: string
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
  /**
   * 현재 세션. 비로그인이면 401이다.
   *
   * 200 + null도 가능한 계약이지만 401로 걸었다. contracts/auth-proposal.md에
   * 이 추측을 적어 두었다 — 서버가 다르게 가면 authQuery의 분기 한 줄이 바뀐다.
   */
  '/api/me': {
    get: {
      responses: { 200: { content: { 'application/json': AuthUser } } }
    }
  }
  '/api/auth/login': {
    post: {
      requestBody: { content: { 'application/json': LoginRequest } }
      responses: { 200: { content: { 'application/json': AuthUser } } }
    }
  }
  '/api/auth/logout': {
    post: {
      responses: { 204: { content?: never } }
    }
  }
}

/** 목록 조회 쿼리. 테스트와 toQuery가 이 타입에 맞춘다. */
export type ProblemListQuery = NonNullable<
  ProvisionalPaths['/api/problems']['get']['parameters']['query']
>

/** 명세가 확정되면 이 클라이언트는 사라지고 api를 쓴다. */
export const provisionalApi = createClient<ProvisionalPaths>(clientOptions)

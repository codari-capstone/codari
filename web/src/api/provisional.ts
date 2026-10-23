import createClient from 'openapi-fetch'

import { clientOptions } from './client'

/**
 * 세션 모델이 계약과 다른 세 경로(/api/me·로그인·로그아웃)만 남은 임시 계약.
 *
 * 나머지는 모두 `npm run gen:api`가 만든 schema.d.ts로 옮겼다 — 도메인 타입은
 * @/api/types, 호출은 @/api/client의 api다.
 *
 * 이 셋이 남은 이유는 타입이 아니라 **세션 모델**이다. 계약은 로그인 응답 본문으로
 * access token을 주고(`TokensIssued`) `Authorization` 헤더로 `/api/users/me`(#103)를
 * 부르게 한다. 지금 코드는 세션 쿠키와 `/api/me`를 가정하므로, import를 바꾸는 일이
 * 아니라 COM-04(토큰 자동 갱신) 구현이다. 그때 이 파일과 authQuery.ts의 fail 사본이
 * 함께 사라진다 (#20).
 */

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

/** COM-04에서 세션 모델을 계약에 맞추면 이 클라이언트는 사라지고 api를 쓴다. */
export const provisionalApi = createClient<ProvisionalPaths>(clientOptions)

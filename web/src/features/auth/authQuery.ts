import { queryOptions } from '@tanstack/react-query'

import { api } from '@/api/client'
import { fail } from '@/api/fail'
import { endSession, setAccessToken } from '@/api/session'
import type { CurrentUser, LoginRequest } from '@/api/types'

export const ME_QUERY_KEY = ['me'] as const

/**
 * 현재 세션. 비로그인은 오류가 아니라 null이다.
 *
 * 401을 던지면 이걸 읽는 화면마다 "비로그인인가 서버가 죽었나"를 가려야 한다.
 * useAuth의 반환 타입에 error가 없는 것도 같은 판단이다.
 *
 * 여기 닿는 401은 이미 갱신을 거친 뒤다 — 클라이언트 미들웨어가 401을 받으면 한 번
 * 갱신하고 다시 보낸다(api/client.ts). 그래도 401이면 세션이 끝난 것이다.
 *
 * retry: false인 이유: 401은 위에서 null로 돌려주고 던지지 않으므로 재시도 경로에 들어오지
 * 않는다. retry가 영향을 주는 것은 5xx와 네트워크 오류뿐이다. 앱 기본값(app/queryClient.ts의
 * retry: 1)이면 이 요청이 한 번 더 나가고, 그동안 useAuth가 isLoading이라 RequireAuth가
 * 스켈레톤에 머문다.
 */
export function meQuery() {
  return queryOptions({
    queryKey: ME_QUERY_KEY,
    queryFn: async (): Promise<CurrentUser | null> => {
      const result = await api.GET('/api/users/me')
      if (result.data !== undefined) return result.data
      if (result.response.status === 401) return null
      return fail(result)
    },
    staleTime: 60 * 1000,
    retry: false,
  })
}

/**
 * 로그인 (COM-07). 실패는 상태 코드를 실어 던진다 — 화면이 문구를 고르는 근거다.
 *
 * **두 걸음이다.** 계약의 로그인 응답에는 access token만 있고(`TokensIssued`) 사용자가
 * 없다 — 닉네임은 바뀔 수 있어 토큰이 아니라 `/api/users/me`로 받으라고 계약이 적어 두었다.
 * 그래서 토큰을 먼저 심고 그 토큰으로 사용자를 받아 온다.
 *
 * refresh token은 서버가 쿠키로 심는다. 프런트가 만질 것이 없다.
 */
export async function loginRequest(body: LoginRequest): Promise<CurrentUser> {
  const result = await api.POST('/api/auth/login', { body })
  if (result.data === undefined) fail(result)

  setAccessToken(result.data.accessToken)
  const me = await api.GET('/api/users/me')
  if (me.data === undefined) {
    // 방금 받은 토큰으로 자기 정보를 못 받는 경우다. 반쪽 세션을 남기지 않는다.
    setAccessToken(null)
    fail(me)
  }
  return me.data
}

/**
 * 로그아웃 (COM-03). 204라 돌려줄 본문이 없다.
 *
 * 서버는 쿠키의 refresh token을 폐기하고, 우리는 들고 있던 access token을 버린다. 둘 중
 * 하나만 하면 한쪽이 살아 있다 — 쿠키만 지우면 만료까지 이 탭이 계속 요청에 성공한다.
 *
 * `endSession`이 세대를 올리고 다른 탭에도 알린다(api/session.ts). 떠 있던 갱신 응답이
 * 늦게 도착해 방금 버린 세션을 되살리는 것과, 다른 탭이 만료까지 로그인 상태로 남는 것을
 * 둘 다 막는다.
 */
export async function logoutRequest(): Promise<void> {
  const result = await api.POST('/api/auth/logout')
  endSession()
  if (!result.response.ok) fail(result)
}

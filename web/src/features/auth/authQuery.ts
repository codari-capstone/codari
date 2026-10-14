import { queryOptions } from '@tanstack/react-query'

import { provisionalApi, type AuthUser, type LoginRequest } from '@/api/provisional'

export const ME_QUERY_KEY = ['me'] as const

/**
 * 오류를 ErrorState·toUserMessage가 읽을 수 있는 모양으로 올린다.
 *
 * features/problems/problemsQuery.ts의 unwrap이 오류를 올리는 방식과 같다.
 * 공통 모듈로 아직 빼지 않는다. 잠정 계약(provisionalApi)이 실제 API 명세가 나오면
 * 교체될 예정이라, 그때 두 곳을 함께 손보는 편이 지금 모듈을 만들어 맞추는 것보다 싸다.
 *
 * 오류 본문의 status는 선택 항목이라 빠져 올 수 있는데, 화면은 이 값으로 문구를 고른다.
 * 그래서 본문에 있든 없든 HTTP 상태를 덮어 싣는다. 둘이 다르면 실제 응답인 HTTP 상태가 맞다.
 */
function fail(result: { error?: unknown; response: Response }): never {
  if (typeof result.error === 'object' && result.error !== null) {
    throw { ...result.error, status: result.response.status }
  }
  throw { status: result.response.status }
}

/**
 * 현재 세션. 비로그인은 오류가 아니라 null이다.
 *
 * 401을 던지면 이걸 읽는 화면마다 "비로그인인가 서버가 죽었나"를 가려야 한다.
 * useAuth의 반환 타입에 error가 없는 것도 같은 판단이다.
 *
 * retry를 끄는 이유: 401은 위에서 null로 돌려주므로 재시도 대상이 아니다. retry가 영향을
 * 주는 것은 5xx와 네트워크 오류다. 기본값(3회)이면 서버가 죽은 동안 이 요청이 네 번 나가고,
 * 그동안 useAuth가 isLoading이라 RequireAuth가 스켈레톤에 머문다.
 */
export function meQuery() {
  return queryOptions({
    queryKey: ME_QUERY_KEY,
    queryFn: async (): Promise<AuthUser | null> => {
      const result = await provisionalApi.GET('/api/me')
      if (result.data !== undefined) return result.data
      if (result.response.status === 401) return null
      return fail(result)
    },
    staleTime: 60 * 1000,
    retry: false,
  })
}

/** 로그인. 실패는 상태 코드를 실어 던진다 — 화면이 COM-07 문구를 고르는 근거다. */
export async function loginRequest(body: LoginRequest): Promise<AuthUser> {
  const result = await provisionalApi.POST('/api/auth/login', { body })
  if (result.data !== undefined) return result.data
  return fail(result)
}

/** 로그아웃. 204라 돌려줄 본문이 없다. */
export async function logoutRequest(): Promise<void> {
  const result = await provisionalApi.POST('/api/auth/logout')
  if (!result.response.ok) fail(result)
}

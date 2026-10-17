import { queryOptions } from '@tanstack/react-query'

import { provisionalApi, type AuthUser, type LoginRequest } from '@/api/provisional'

export const ME_QUERY_KEY = ['me'] as const

/**
 * 오류를 ErrorState·toUserMessage가 읽을 수 있는 모양으로 올린다.
 *
 * @/api/fail의 fail과 같은 코드다. 이 모듈만 아직 임시 계약(provisionalApi)을 쓰고 있어
 * 남겨 둔다 — 세션 모델을 계약에 맞추는 COM-04에서 이 파일 자체가 바뀌므로, 그때
 * 공용 fail로 합친다 (#20). 다른 호출부는 이미 @/api/fail을 쓴다.
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
 * retry: false인 이유: 401은 위에서 null로 돌려주고 던지지 않으므로 재시도 경로에 들어오지
 * 않는다. retry가 영향을 주는 것은 5xx와 네트워크 오류뿐이다. 앱 기본값(app/queryClient.ts의
 * retry: 1)이면 이 요청이 한 번 더 나가고, 그동안 useAuth가 isLoading이라 RequireAuth가
 * 스켈레톤에 머문다.
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

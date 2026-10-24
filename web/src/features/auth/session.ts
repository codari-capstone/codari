import type { QueryClient } from '@tanstack/react-query'

import { ME_QUERY_KEY } from './authQuery'

function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const status = (error as { status?: unknown }).status
  return typeof status === 'number' ? status : undefined
}

/**
 * 401을 받았으면 들고 있던 세션을 버린다.
 *
 * 그래야 `RequireAuth`가 로그인 화면으로 보내고 돌아올 주소도 함께 담는다 — 문구만
 * 띄우면 사용자가 주소를 직접 쳐야 한다.
 *
 * `useLogout`이 ['me']에 null을 심지 않는 것과 어긋나지 않는다. 거기서는 로그아웃
 * **요청이 실패**해 서버 세션이 살아 있을 수 있는데 로그아웃된 것처럼 보이는 것이
 * 문제였다. 여기는 반대로 서버가 "세션이 없다"고 확정해 준 경우라, 화면을 사실에 맞추는
 * 쪽이 null을 심는 것이다.
 *
 * 제출(useSubmit)과 결과 조회(SubmissionResultPage)가 같이 쓴다. 두 곳에 같은 분기를
 * 적어 두면 한쪽만 고쳐지는 날이 온다.
 */
export function forgetSessionIfUnauthorized(client: QueryClient, error: unknown): void {
  if (statusOf(error) === 401) client.setQueryData(ME_QUERY_KEY, null)
}

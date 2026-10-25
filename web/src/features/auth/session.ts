import type { QueryClient } from '@tanstack/react-query'

import type { CurrentUser } from '@/api/types'
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

/**
 * 로그인에 성공한 세션을 캐시에 들인다 (COM-02·COM-07 공통).
 *
 * 이메일 로그인과 GitHub 로그인이 같이 쓴다. 두 곳에 같은 네 줄을 적어 두면 한쪽만
 * 고쳐지는 날이 온다 — 아래 세 가지가 다 "안 하면 조용히 틀린 화면이 나오는" 종류다.
 */
export async function adoptSession(client: QueryClient, user: CurrentUser): Promise<void> {
  // 로그인 전에 나간 /api/users/me가 아직 떠 있을 수 있다. 그게 늦게 401로 끝나면
  // queryFn이 돌려주는 null이 바로 아래에서 넣은 사용자를 덮어써, 방금 로그인한
  // 사람이 RequireAuth에 걸려 로그인 화면으로 되돌아온다. 먼저 취소한다.
  await client.cancelQueries({ queryKey: ME_QUERY_KEY })
  // 무효화만 하면 /api/users/me 왕복을 한 번 더 기다리며 헤더가 비로그인으로 한 번 더 그려진다.
  client.setQueryData(ME_QUERY_KEY, user)
  // 비로그인으로 받아 둔 문제 목록에는 이 사람의 풀이 상태가 없다. 지우지 않으면
  // staleTime(30초) 안에는 그 응답을 다시 써서, 열은 생겼는데 값이 전부 '—'로 보인다
  // (ProblemTable.tsx). 무효화가 아니라 제거다 — 무효화는 다시 받아 오는 동안 그
  // 틀린 값을 화면에 남긴다. 사용자별 응답을 캐시하는 키가 늘면 여기도 늘어난다.
  client.removeQueries({ queryKey: ['problems'] })
  // 제출 결과는 본인 것만 볼 수 있다(계약). 지우지 않으면 공용 PC에서 A의 세션이
  // 끊긴 뒤 B가 로그인해 기록으로 A의 /submissions/5를 열 때, gcTime 안에서는 A의
  // 판정이 그대로 그려진다.
  client.removeQueries({ queryKey: ['submission'] })
}

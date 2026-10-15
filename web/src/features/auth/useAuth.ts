import { useQuery } from '@tanstack/react-query'

import type { AuthUser } from '@/api/provisional'
import { meQuery } from './authQuery'

export interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  /** 아직 세션을 모른다는 뜻. 라우트 보호가 이 값일 때 리다이렉트하면 안 된다. */
  isLoading: boolean
}

/**
 * 로그인 상태. 화면은 이 훅만 본다.
 *
 * Context를 따로 두지 않는다. TanStack Query 캐시가 이미 전역 공유 저장소라,
 * 같은 때 여러 곳에서 마운트해도 진행 중인 /api/me 요청은 하나로 합쳐진다.
 * staleTime(60초)이 지난 뒤에는 새로 마운트될 때 다시 나간다. 창 포커스로는 나가지 않는다.
 * 앱 기본값이 refetchOnWindowFocus: false이기 때문이다(app/queryClient.ts).
 * Context를 더하면 같은 상태가 두 겹이 되고 무효화 경로도 둘이 된다.
 *
 * isLoading에 isPending을 쓰는 이유: isPending은 "데이터가 아직 없다"는 뜻이라
 * 오프라인이어서 요청이 멈춰 있는 동안(fetchStatus: 'paused')에도 켜져 있다.
 * isLoading은 isPending && isFetching이라 그때 꺼진다. 그 값을 쓰면 오프라인에서
 * RequireAuth가 "세션을 알아냈고 비로그인이다"로 오판해, 로그인한 사용자를
 * 로그인 화면으로 밀어낸다.
 *
 * error를 내보내지 않는다. 500일 때 무엇이 되는지는 캐시에 달려 있다.
 * 첫 조회가 실패하면 data가 없어 user가 null이고 비로그인으로 다뤄진다. 보호된 내용을
 * 새게 하지 않는 쪽이 안전하고, /login은 공개 화면이라 리다이렉트가 반복되지 않는다.
 * 이미 받아 둔 사용자가 있는데 재조회가 실패하면 TanStack Query가 이전 data를 지우지
 * 않으므로 로그인 상태가 그대로 유지된다. 이쪽도 의도한 것이다 — 서버가 한 번 흔들릴
 * 때마다 쓰던 사람을 로그아웃시키는 쪽이 더 나쁘다. 그래서 같은 500이라도 캐시가
 * 있느냐에 따라 가드의 판단이 갈린다.
 */
export function useAuth(): AuthState {
  const { data, isPending } = useQuery(meQuery())
  const user = data ?? null

  return { user, isAuthenticated: user !== null, isLoading: isPending }
}

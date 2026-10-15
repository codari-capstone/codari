import { Navigate, Outlet } from 'react-router'

import { useAuth } from '@/features/auth/useAuth'

/**
 * ADMIN만 들어가는 화면을 감싸는 레이아웃 (COM-05).
 *
 * RequireAuth 안에 중첩해 쓰는 것을 전제로 역할만 본다. 비로그인에게 403을 보여 주면
 * 로그인하면 된다는 걸 알 수 없으므로, 로그인 여부는 부모가 먼저 거른다.
 */
export function RequireAdmin() {
  const { user } = useAuth()

  if (user?.role !== 'ADMIN') return <Navigate to="/forbidden" replace />

  return <Outlet />
}

import { Navigate, Outlet, useLocation } from 'react-router'

import { ListSkeleton } from '@/components/ListSkeleton'
import { useAuth } from '@/features/auth/useAuth'

/** 로그인이 필요한 화면을 감싸는 레이아웃 (COM-05). */
export function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  // 아직 세션을 모른다. 리다이렉트하면 로그인한 사용자가 보호된 주소를 직접 열 때마다
  // 로그인 화면이 번쩍인다.
  if (isLoading) return <ListSkeleton rows={6} />

  if (!isAuthenticated) {
    // search까지 담는다. pathname만 담으면 로그인 후 쿼리가 사라져 1페이지로 돌아간다.
    return (
      <Navigate to="/login" state={{ from: `${location.pathname}${location.search}` }} replace />
    )
  }

  return <Outlet />
}

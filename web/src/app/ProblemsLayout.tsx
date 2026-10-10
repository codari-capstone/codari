import { Outlet } from 'react-router'

import { ProblemFilters } from '@/features/problems/ProblemFilters'
import { AppShell } from './AppShell'

/**
 * 사이드바에 필터를 붙인 레이아웃. /problems 전용이다.
 *
 * RootLayout도 AppShell을 렌더하므로 그 아래에 두면 헤더가 두 개가 된다.
 * router.tsx에서 RootLayout의 형제로 둔다.
 */
export function ProblemsLayout() {
  return (
    <AppShell sidebar={<ProblemFilters />}>
      <Outlet />
    </AppShell>
  )
}

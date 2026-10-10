import { Outlet } from 'react-router'

import { AppShell } from './AppShell'

/**
 * 사이드바가 없는 화면을 감싸는 레이아웃.
 *
 * AppShell의 sidebar 슬롯이 필요한 화면은 ProblemsLayout처럼 형제 레이아웃
 * 라우트를 따로 둔다. 이 레이아웃 아래에서 AppShell을 또 부르면 헤더가 두 개가 된다.
 */
export function RootLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

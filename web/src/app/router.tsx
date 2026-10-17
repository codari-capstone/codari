import { createBrowserRouter, redirect } from 'react-router'

import { ProblemsLayout } from './ProblemsLayout'
import { RequireAdmin } from './RequireAdmin'
import { RequireAuth } from './RequireAuth'
import { RootLayout } from './RootLayout'
import { RouteErrorBoundary } from './RouteErrorBoundary'

// 스택 문서 §4의 주소 설계. 각 화면은 담당 이슈에서 features/ 아래 컴포넌트로 채운다.
export const router = createBrowserRouter([
  {
    path: '/',
    // 모든 화면이 lazy 청크다. 배포 후 옛 청크가 404가 되는 경우를 여기서 받는다.
    // Component를 두지 않으므로 기본값인 <Outlet/>이 렌더된다.
    ErrorBoundary: RouteErrorBoundary,
    children: [
      {
        // 사이드바가 없는 화면들
        Component: RootLayout,
        children: [
          { index: true, loader: () => redirect('/problems') },
          { path: 'login', lazy: () => import('@/features/auth/LoginPage') },
          { path: 'signup', lazy: () => import('@/features/auth/SignupPage') },
          { path: 'password-reset', lazy: () => import('@/features/auth/PasswordResetPage') },
          { path: 'forbidden', lazy: () => import('@/app/ForbiddenPage') },
          {
            // 로그인이 필요한 화면들 (COM-05). 가드는 막거나 통과시킬 뿐 AppShell을 만들지 않으므로,
            // RootLayout 밖의 형제로 두면 헤더가 없어진다. 그래서 RootLayout의 자식으로 둔다.
            Component: RequireAuth,
            children: [
              { path: 'problems/:id', lazy: () => import('@/features/solve/SolvePage') },
              {
                path: 'submissions',
                lazy: () => import('@/features/history/SubmissionHistoryPage'),
              },
              {
                path: 'submissions/:id',
                lazy: () => import('@/features/result/SubmissionResultPage'),
              },
              { path: 'me/report', lazy: () => import('@/features/report/ReportPage') },
              {
                // RequireAdmin은 역할만 본다. 비로그인이 403을 보지 않도록 RequireAuth 안에 둔다.
                Component: RequireAdmin,
                children: [{ path: 'admin/*', lazy: () => import('@/features/admin/AdminPage') }],
              },
            ],
          },
          { path: '*', lazy: () => import('@/app/NotFoundPage') },
        ],
      },
      {
        // 사이드바에 필터가 붙는 화면 (#21). #46도 숙련도 사이드바로 같은 방식을 쓴다.
        Component: ProblemsLayout,
        children: [{ path: 'problems', lazy: () => import('@/features/problems/ProblemListPage') }],
      },
    ],
  },
])

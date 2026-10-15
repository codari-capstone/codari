import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AuthState } from '@/features/auth/useAuth'
import * as useAuthModule from '@/features/auth/useAuth'
import { RequireAdmin } from './RequireAdmin'
import { RequireAuth } from './RequireAuth'

afterEach(() => vi.restoreAllMocks())

function mockAuth(state: Partial<AuthState>) {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    ...state,
  })
}

/** 보호된 /submissions와 /admin, 그리고 도착지 표식들만 둔 라우터. */
function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        Component: RequireAuth,
        children: [
          { path: '/submissions', element: <h1>제출 기록 본문</h1> },
          {
            Component: RequireAdmin,
            children: [{ path: '/admin', element: <h1>관리자 본문</h1> }],
          },
        ],
      },
      { path: '/login', element: <h1>로그인 화면</h1> },
      { path: '/forbidden', element: <h1>권한 없음 화면</h1> },
    ],
    { initialEntries: [path] },
  )

  render(<RouterProvider router={router} />)
  return router
}

describe('RequireAuth', () => {
  it('세션을 모르는 동안에는 리다이렉트하지 않는다', () => {
    // 여기서 리다이렉트하면 로그인한 사용자가 /submissions를 직접 열 때마다
    // 로그인 화면이 한 번 번쩍인다.
    mockAuth({ isLoading: true })
    const router = renderAt('/submissions')

    expect(router.state.location.pathname).toBe('/submissions')
    expect(screen.getByRole('status')).toHaveTextContent('불러오는 중')
    expect(screen.queryByRole('heading', { name: '로그인 화면' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '제출 기록 본문' })).not.toBeInTheDocument()
  })

  it('비로그인은 로그인 화면으로 보내고 돌아갈 주소를 싣는다', () => {
    mockAuth({})
    const router = renderAt('/submissions')

    expect(screen.getByRole('heading', { name: '로그인 화면' })).toBeInTheDocument()
    expect(router.state.location.state).toMatchObject({ from: '/submissions' })
    // push면 뒤로 가기가 보호된 주소로 돌아가 다시 /login으로 튕기는 함정이 된다.
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('쿼리 문자열까지 돌아갈 주소에 담는다', () => {
    mockAuth({})
    const router = renderAt('/submissions?page=2')

    expect(router.state.location.state).toMatchObject({ from: '/submissions?page=2' })
  })

  it('로그인했으면 본문을 보여 준다', () => {
    mockAuth({ user: { id: 1, nickname: '코다리', role: 'USER' }, isAuthenticated: true })
    renderAt('/submissions')

    expect(screen.getByRole('heading', { name: '제출 기록 본문' })).toBeInTheDocument()
  })
})

describe('RequireAdmin', () => {
  it('USER는 권한 없음 화면으로 보낸다', () => {
    mockAuth({ user: { id: 1, nickname: '코다리', role: 'USER' }, isAuthenticated: true })
    const router = renderAt('/admin')

    expect(screen.getByRole('heading', { name: '권한 없음 화면' })).toBeInTheDocument()
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('ADMIN은 통과시킨다', () => {
    mockAuth({ user: { id: 2, nickname: '관리자', role: 'ADMIN' }, isAuthenticated: true })
    renderAt('/admin')

    expect(screen.getByRole('heading', { name: '관리자 본문' })).toBeInTheDocument()
  })

  it('비로그인은 권한 없음이 아니라 로그인 화면으로 간다', () => {
    // 부모인 RequireAuth가 먼저 잡는다. 403을 보여 주면 로그인하면 된다는 걸 알 수 없다.
    mockAuth({})
    const router = renderAt('/admin')

    expect(screen.getByRole('heading', { name: '로그인 화면' })).toBeInTheDocument()
    // RequireAdmin은 from을 쓰지 않는다. 돌아갈 주소가 있다는 것은 부모가 리다이렉트했다는 뜻이다.
    expect(router.state.location.state).toMatchObject({ from: '/admin' })
  })
})

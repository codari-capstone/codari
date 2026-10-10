import { render, screen } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppShell } from './AppShell'
import { Component as LoginPage } from './LoginPage'
import { RouteErrorBoundary } from './RouteErrorBoundary'
import { ThemeProvider } from './ThemeProvider'

/** 라우트가 실제로 던진 오류를 ErrorBoundary가 받는 상황을 만든다. */
function renderWithThrowingRoute(thrown: unknown) {
  const router = createMemoryRouter([
    {
      path: '/',
      loader: () => {
        throw thrown
      },
      Component: () => <p>본문</p>,
      ErrorBoundary: RouteErrorBoundary,
    },
  ])

  return render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  )
}

describe('RouteErrorBoundary', () => {
  // react-router가 받은 오류를 console.error로 찍는다. 테스트 출력만 조용히 한다.
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ErrorBoundary는 그 라우트의 Component를 대체한다. AppShell로 직접 감싸지
  // 않으면 상단바도 좌우 여백도 없이 본문만 뷰포트에 붙는다.
  it('레이아웃 안에서 그려진다', async () => {
    renderWithThrowingRoute(new Error('Failed to fetch dynamically imported module'))

    expect(await screen.findByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '주요 메뉴' })).toBeInTheDocument()
    expect(screen.queryByText('본문')).not.toBeInTheDocument()
  })

  it('청크 로드 실패는 기본 문구와 다시 시도 버튼으로 안내한다', async () => {
    renderWithThrowingRoute(new Error('Failed to fetch dynamically imported module'))

    expect(
      await screen.findByRole('heading', { level: 1, name: '문제가 발생했습니다' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/네트워크 연결을 확인하고/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })

  // 로더가 올린 RFC 9457 응답은 그 type에 맞는 한국어 문구가 나와야 한다
  it('서버가 내려준 오류는 해당 문구로 바꿔 보여 준다', async () => {
    renderWithThrowingRoute({
      type: '/problems/ai-quota-exceeded',
      status: 429,
      detail: 'Daily AI quota exceeded',
    })

    expect(
      await screen.findByRole('heading', { level: 1, name: '오늘 AI 분석을 다 썼습니다' }),
    ).toBeInTheDocument()
    // 다시 시도해도 같은 결과라 버튼을 보이지 않는다
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
  })

  // Component 없는 부모 라우트에 단 ErrorBoundary가 자식 오류를 받는지 확인한다.
  // 받지 못하면 청크 로드 실패가 빈 화면이 된다.
  it('Component가 없는 부모 라우트의 ErrorBoundary도 자식 오류를 받는다', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          ErrorBoundary: RouteErrorBoundary,
          children: [
            {
              Component: () => (
                <AppShell>
                  <Outlet />
                </AppShell>
              ),
              children: [
                {
                  path: 'boom',
                  loader: () => {
                    throw { type: '/problems/judge-unavailable', status: 503 }
                  },
                  Component: () => <p>여기는 보이면 안 된다</p>,
                },
              ],
            },
          ],
        },
      ],
      { initialEntries: ['/boom'] },
    )

    render(
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>,
    )

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('여기는 보이면 안 된다')).not.toBeInTheDocument()
    // 폴백도 AppShell을 쓰므로 헤더가 하나 있어야 한다
    expect(screen.getAllByRole('banner')).toHaveLength(1)
  })
})

describe('LoginPage', () => {
  // 헤더의 로그인 버튼이 404로 떨어지면 깨진 링크다
  it('준비 중임을 알리고 돌아갈 길을 준다', () => {
    const router = createMemoryRouter([{ path: '/', Component: LoginPage }])
    render(<RouterProvider router={router} />)

    // 이 화면의 제목은 EmptyState가 그리는 것뿐이다. h2로 두면 h1 없는 화면이 된다.
    expect(
      screen.getByRole('heading', { level: 1, name: '로그인 준비 중입니다' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '문제 보러 가기' })).toHaveAttribute(
      'href',
      '/problems',
    )
  })
})

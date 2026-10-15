import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { type ReactNode, useState } from 'react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppShell } from './AppShell'
import { RouteErrorBoundary } from './RouteErrorBoundary'
import { ThemeProvider } from './ThemeProvider'

// AppHeader가 useAuth로 세션을 조회하므로 QueryClient가 필요하다.
// 테스트마다 새로 만들어 앞 테스트의 ['me'] 캐시가 새지 않게 한다.
function TestProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  )
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  )
}

// 운영 라우터가 실제로 ErrorBoundary를 달고 있는지 검증하려면 청크 로드 실패를
// 재현해야 한다. SubmissionHistoryPage의 동적 import를 강제로 실패시킨다.
vi.mock('@/features/history/SubmissionHistoryPage', () => {
  throw new Error('청크를 불러오지 못했다')
})

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
    <TestProviders>
      <RouterProvider router={router} />
    </TestProviders>,
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
      <TestProviders>
        <RouterProvider router={router} />
      </TestProviders>,
    )

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('여기는 보이면 안 된다')).not.toBeInTheDocument()
    // 폴백도 AppShell을 쓰므로 헤더가 하나 있어야 한다
    expect(screen.getAllByRole('banner')).toHaveLength(1)
  })

  // 지금까지의 테스트는 손으로 짠 라우터 트리로 "ErrorBoundary가 전파된다"는
  // react-router의 동작만 증명한다. 운영 라우터(router.tsx)가 실제로 그 자리에
  // ErrorBoundary를 달고 있는지는 별개다 — 한 줄 삭제로 깨질 수 있고, 그래도
  // typecheck·lint·기존 테스트·build가 전부 통과한다. 배포 후 청크 404를
  // 흉내 내 운영 라우터 자체를 돌려 확인한다.
  it('운영 라우터도 청크 로드 실패를 오류 화면으로 받는다', async () => {
    window.history.pushState({}, '', '/submissions')
    const { router } = await import('./router')

    render(
      <TestProviders>
        <RouterProvider router={router} />
      </TestProviders>,
    )

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getAllByRole('banner')).toHaveLength(1)
  })
})

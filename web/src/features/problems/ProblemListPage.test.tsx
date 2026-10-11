import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/app/queryClient'
import { ProblemsLayout } from '@/app/ProblemsLayout'
import { ThemeProvider } from '@/app/ThemeProvider'
import * as useAuthModule from '@/features/auth/useAuth'
import { server } from '@/mocks/server'
import { Component as ProblemListPage } from './ProblemListPage'

// AppShell -> AppHeader -> ThemeToggle이 useTheme을 쓴다. ThemeProvider 없이
// 렌더하면 모든 테스트가 "ProblemListPage가 비었다"가 아니라 테마 컨텍스트
// 부재로 깨져, 실패 이유가 Step 3에서 기대한 것과 달라진다.
function renderPage(initialUrl = '/problems') {
  const router = createMemoryRouter(
    [
      {
        Component: ProblemsLayout,
        children: [{ path: '/problems', Component: ProblemListPage }],
      },
    ],
    { initialEntries: [initialUrl] },
  )

  render(
    <ThemeProvider>
      <QueryClientProvider client={createQueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  )

  return router
}

describe('ProblemListPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('제목이 h1이다', async () => {
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: '문제 목록' })).toBeInTheDocument()
  })

  // AppShell이 중첩되면 헤더가 두 개가 된다
  it('헤더가 하나다', async () => {
    renderPage()

    expect(screen.getAllByRole('banner')).toHaveLength(1)
  })

  it('목록을 표로 보여 준다', async () => {
    renderPage()

    expect(await screen.findByRole('link', { name: '두 수의 합' })).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(9) // 머리 1 + 본문 8
  })

  it('결과 개수를 보여 준다', async () => {
    renderPage()

    expect(await screen.findByText(/문제 8개/)).toBeInTheDocument()
  })

  it('필터가 걸리면 개수 문구가 바뀐다', async () => {
    renderPage('/problems?difficulty=HARD')

    expect(await screen.findByText(/조건에 맞는 문제 2개/)).toBeInTheDocument()
  })

  it('첫 로드에는 기다리는 중임을 알린다', () => {
    renderPage()

    expect(screen.getByRole('status')).toHaveTextContent('불러오는 중')
  })

  it('검색어를 입력하면 쿼리에 실려 나간다', async () => {
    let captured = ''
    server.use(
      http.get('*/api/problems', ({ request }) => {
        captured = new URL(request.url).search
        return HttpResponse.json({ content: [], totalElements: 0 })
      }),
    )
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByRole('searchbox', { name: '제목으로 검색' }), '괄호')

    await waitFor(() => {
      expect(captured).toContain('keyword=')
    })
    expect(decodeURIComponent(captured)).toContain('keyword=괄호')
  })

  // 글자마다 히스토리가 쌓이면 뒤로가기가 한 글자씩만 지운다
  it('검색어 입력은 히스토리를 쌓지 않는다', async () => {
    const user = userEvent.setup()
    const router = renderPage()

    await user.type(screen.getByRole('searchbox', { name: '제목으로 검색' }), '괄호')

    await waitFor(() => {
      expect(router.state.location.search).toContain('keyword')
    })

    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('열 머리를 누르면 정렬이 URL에 들어간다', async () => {
    const user = userEvent.setup()
    const router = renderPage()
    await screen.findByRole('link', { name: '두 수의 합' })

    await user.click(screen.getByRole('button', { name: /난이도/ }))

    await waitFor(() => {
      expect(router.state.location.search).toContain('sort=difficulty%2Casc')
    })
  })

  it('필터 결과가 0건이면 초기화 링크를 보여 준다', async () => {
    renderPage('/problems?keyword=없는제목')

    expect(await screen.findByText('조건에 맞는 문제가 없습니다')).toBeInTheDocument()
    // ProblemFilters 사이드바도 필터가 걸리면 같은 이름의 초기화 링크를 둔다.
    // 본문으로 좁히지 않으면 두 개가 걸려 getByRole이 바로 실패한다.
    const main = screen.getByRole('main')
    expect(within(main).getByRole('link', { name: '필터 초기화' })).toHaveAttribute(
      'href',
      '/problems',
    )
  })

  it('필터가 없는데 0건이면 다른 문구를 보여 준다', async () => {
    server.use(
      http.get('*/api/problems', () => HttpResponse.json({ content: [], totalElements: 0 })),
    )
    renderPage()

    expect(await screen.findByText('아직 등록된 문제가 없습니다')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '필터 초기화' })).not.toBeInTheDocument()
  })

  it('서버 오류는 한국어 문구로 보여 준다', async () => {
    server.use(
      http.get('*/api/problems', () =>
        HttpResponse.json({ status: 503, title: 'Service Unavailable' }, { status: 503 }),
      ),
    )
    renderPage()

    // retry:1이라 첫 시도 실패 뒤 재시도 지연(약 1초)을 거쳐야 error 상태가 된다.
    // findByRole 기본 타임아웃(1000ms)은 그 경계에 걸려 간헐적으로 떨어진다.
    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent(
      '문제가 발생했습니다',
    )
  })

  it('다시 시도를 누르면 재요청한다', async () => {
    let calls = 0
    server.use(
      http.get('*/api/problems', () => {
        calls += 1
        return HttpResponse.json({ status: 503 }, { status: 503 })
      }),
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: '다시 시도' }, { timeout: 3000 }))

    await waitFor(() => {
      expect(calls).toBeGreaterThan(2) // retry:1 포함 첫 시도 2회 + 재시도
    })
  })

  it('비로그인이면 로그인 안내를 보여 준다', async () => {
    renderPage()

    // 헤더에도 '로그인' 링크가 있다. 본문으로 좁혀야 이 화면의 안내문을 집는다.
    const main = screen.getByRole('main')
    expect(within(main).getByRole('link', { name: /로그인/ })).toBeInTheDocument()
  })

  it('비로그인이면 풀이 상태 열이 표에 없다', async () => {
    renderPage()

    await screen.findByRole('link', { name: '두 수의 합' })
    expect(screen.queryByRole('columnheader', { name: '풀이 상태' })).not.toBeInTheDocument()
  })

  it('로그인하면 안내가 사라지고 풀이 상태 열이 보인다', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: { id: 'u1', nickname: '찬우', role: 'USER' },
      isAuthenticated: true,
      isLoading: false,
    })
    renderPage()

    await screen.findByRole('link', { name: '두 수의 합' })
    expect(screen.getByRole('columnheader', { name: '풀이 상태' })).toBeInTheDocument()
    // 고정 픽스처에서 SOLVED가 2건이라 표 전체에 '맞음'이 두 번 나온다. 행으로
    // 좁혀야 '두 수의 합' 행의 풀이 상태 셀을 가리키는 단언이 된다.
    const row = screen.getByRole('row', { name: /두 수의 합/ })
    expect(within(row).getByText('맞음')).toBeInTheDocument()
  })
})

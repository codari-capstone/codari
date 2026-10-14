import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/app/queryClient'
import * as useAuthModule from '@/features/auth/useAuth'
import { server } from '@/mocks/server'
import { ProblemFilters } from './ProblemFilters'

function renderFilters(initialUrl = '/problems', queryClient = createQueryClient()) {
  const router = createMemoryRouter([{ path: '/problems', element: <ProblemFilters /> }], {
    initialEntries: [initialUrl],
  })

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return router
}

function asLoggedIn() {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    user: { id: 1, nickname: '찬우', role: 'USER' },
    isAuthenticated: true,
    isLoading: false,
  })
}

describe('ProblemFilters', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('난이도 선택지를 보여 준다', () => {
    renderFilters()

    expect(screen.getByRole('checkbox', { name: '쉬움' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '어려움' })).toBeInTheDocument()
  })

  it('개념 태그를 서버에서 받아 보여 준다', async () => {
    renderFilters()

    expect(await screen.findByRole('checkbox', { name: '동적 계획법' })).toBeInTheDocument()
  })

  // 태그 목록이 비는 것과 "못 불러온 것"이 구분되지 않으면, ?tag=dp로 들어온
  // 사용자가 자신의 결과를 좁히는 필터를 보거나 해제할 방법이 없어진다.
  it('태그를 못 불러오면 체크박스 대신 안내와 다시 시도를 보여 준다', async () => {
    server.use(
      http.get('*/api/concept-tags', () => HttpResponse.json({ status: 503 }, { status: 503 })),
    )
    renderFilters()

    // retry:1이라 첫 시도 실패 뒤 재시도 지연을 거쳐야 error 상태가 된다.
    expect(
      await screen.findByText('태그를 불러오지 못했습니다', {}, { timeout: 3000 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: '동적 계획법' })).not.toBeInTheDocument()
  })

  // TanStack Query v5는 백그라운드 refetch가 실패해도 data를 남기고 error만 켠다. 오류 줄이
  // error만 보고 체크박스를 대체하면, 탭을 오래 열어 둔 채 네트워크가 끊겼다 돌아온 사용자의
  // ?tag=dp 필터가 눈에 안 보이고 해제도 못 한다. 실제 refetchOnReconnect 경로와 같은
  // 상태(data 있음 + error 있음)를 refetchQueries로 만든다.
  it('캐시된 태그가 있으면 백그라운드 refetch가 실패해도 체크박스를 계속 보여 준다', async () => {
    const queryClient = createQueryClient()
    renderFilters('/problems?tag=dp', queryClient)
    expect(await screen.findByRole('checkbox', { name: '동적 계획법' })).toBeChecked()

    server.use(
      http.get('*/api/concept-tags', () => HttpResponse.json({ status: 503 }, { status: 503 })),
    )
    // retry:1이라 재시도 지연을 거쳐 실패가 확정된다
    // refetchQueries가 끝나도 observer 알림은 setTimeout(0)으로 미뤄져 DOM에는 아직 반영 전이다.
    // 그 알림까지 흘려보내지 않으면 오류 줄로 바꾸는 버그가 있어도 단언이 먼저 돌아 통과하는
    // 장식용 테스트가 된다 (오류 줄 분기를 되돌려 실제로 그렇게 통과하는 걸 확인했다).
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['concept-tags'] })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // 실패가 정말 상태에 반영됐는지 먼저 확인해야, 아래 단언이 "오류가 안 났다"로 통과하지 않는다
    expect(queryClient.getQueryState(['concept-tags'])?.error).not.toBeNull()
    expect(screen.getByRole('checkbox', { name: '동적 계획법' })).toBeChecked()
    expect(screen.queryByText('태그를 불러오지 못했습니다')).not.toBeInTheDocument()
  })

  it('다시 시도를 누르면 재요청해 성공하면 태그를 보여 준다', async () => {
    let calls = 0
    server.use(
      http.get('*/api/concept-tags', () => {
        calls += 1
        // retry:1이 포함된 첫 시도(2회) 동안은 계속 실패하고, 사용자가 누르는
        // 재요청부터는 성공해 태그가 그려지는지 본다.
        if (calls <= 2) return HttpResponse.json({ status: 503 }, { status: 503 })
        return HttpResponse.json([{ slug: 'dp', name: '동적 계획법' }])
      }),
    )
    const user = userEvent.setup()
    renderFilters()

    await user.click(await screen.findByRole('button', { name: '다시 시도' }, { timeout: 3000 }))

    expect(await screen.findByRole('checkbox', { name: '동적 계획법' })).toBeInTheDocument()
    expect(screen.queryByText('태그를 불러오지 못했습니다')).not.toBeInTheDocument()
  })

  it('난이도를 고르면 URL에 들어간다', async () => {
    const user = userEvent.setup()
    const router = renderFilters()

    await user.click(screen.getByRole('checkbox', { name: '보통' }))

    await waitFor(() => {
      expect(router.state.location.search).toContain('difficulty=MEDIUM')
    })
  })

  it('고른 난이도를 다시 누르면 URL에서 빠진다', async () => {
    const user = userEvent.setup()
    const router = renderFilters('/problems?difficulty=MEDIUM')

    await user.click(screen.getByRole('checkbox', { name: '보통' }))

    await waitFor(() => {
      expect(router.state.location.search).not.toContain('difficulty')
    })
  })

  it('URL에 있는 필터가 체크된 상태로 보인다', () => {
    renderFilters('/problems?difficulty=HARD')

    expect(screen.getByRole('checkbox', { name: '어려움' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '쉬움' })).not.toBeChecked()
  })

  // 열을 숨기면서 필터를 남기면 동작하지 않는 필터가 보인다
  it('비로그인이면 풀이 상태 섹션이 없다', () => {
    renderFilters()

    expect(screen.queryByRole('checkbox', { name: '맞음' })).not.toBeInTheDocument()
    expect(screen.queryByText('풀이 상태')).not.toBeInTheDocument()
  })

  it('로그인하면 풀이 상태 섹션이 있다', () => {
    asLoggedIn()
    renderFilters()

    expect(screen.getByRole('checkbox', { name: '맞음' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '안 품' })).toBeInTheDocument()
  })

  it('필터가 없으면 초기화 버튼을 보이지 않는다', () => {
    renderFilters()

    expect(screen.queryByRole('link', { name: '필터 초기화' })).not.toBeInTheDocument()
  })

  it('필터가 있으면 초기화 링크가 쿼리 없는 주소를 가리킨다', () => {
    renderFilters('/problems?difficulty=HARD')

    expect(screen.getByRole('link', { name: '필터 초기화' })).toHaveAttribute('href', '/problems')
  })
})

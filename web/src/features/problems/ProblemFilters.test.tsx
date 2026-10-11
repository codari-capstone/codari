import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/app/queryClient'
import * as useAuthModule from '@/features/auth/useAuth'
import { server } from '@/mocks/server'
import { ProblemFilters } from './ProblemFilters'

function renderFilters(initialUrl = '/problems') {
  const router = createMemoryRouter([{ path: '/problems', element: <ProblemFilters /> }], {
    initialEntries: [initialUrl],
  })

  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return router
}

function asLoggedIn() {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    user: { id: 'u1', nickname: '찬우', role: 'USER' },
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

import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/app/queryClient'
import * as useAuthModule from '@/features/auth/useAuth'
import { ProblemFilters } from './ProblemFilters'

function renderFilters(initialUrl = '/problems') {
  const router = createMemoryRouter(
    [{ path: '/problems', element: <ProblemFilters /> }],
    { initialEntries: [initialUrl] },
  )

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

    expect(screen.getByRole('link', { name: '필터 초기화' })).toHaveAttribute(
      'href',
      '/problems',
    )
  })
})

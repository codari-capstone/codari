import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { server } from '@/mocks/server'
import { ME_QUERY_KEY } from './authQuery'
import { useLogout } from './useLogout'

function LogoutButton() {
  const { logout } = useLogout()
  return <button onClick={logout}>로그아웃</button>
}

function renderLogout() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(ME_QUERY_KEY, { id: 1, nickname: '코다리', role: 'USER' })
  client.setQueryData(['problems', {}], { content: [{ id: 1 }], totalElements: 1 })

  const router = createMemoryRouter(
    [
      { path: '/me/report', Component: LogoutButton },
      { path: '/problems', element: <h1>문제 목록 도착</h1> },
    ],
    { initialEntries: ['/me/report'] },
  )

  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return { client }
}

describe('useLogout', () => {
  it('문제 목록으로 이동한다 (COM-03)', async () => {
    const user = userEvent.setup()
    renderLogout()

    await user.click(screen.getByRole('button', { name: '로그아웃' }))

    expect(await screen.findByRole('heading', { name: '문제 목록 도착' })).toBeInTheDocument()
  })

  it('세션뿐 아니라 다른 사용자 데이터 캐시까지 비운다', async () => {
    const user = userEvent.setup()
    const { client } = renderLogout()

    await user.click(screen.getByRole('button', { name: '로그아웃' }))
    await screen.findByRole('heading', { name: '문제 목록 도착' })

    // ['me']만 지우면 목록의 풀이 상태·제출 기록이 이전 사용자 것으로 남는다.
    expect(client.getQueryData(ME_QUERY_KEY)).toBeUndefined()
    expect(client.getQueryData(['problems', {}])).toBeUndefined()
  })

  it('로그아웃 요청이 실패해도 로컬 세션을 버리고 이동한다', async () => {
    server.use(
      http.post('*/api/auth/logout', () =>
        HttpResponse.json({ status: 500, title: 'Server Error' }, { status: 500 }),
      ),
    )
    const user = userEvent.setup()
    const { client } = renderLogout()

    await user.click(screen.getByRole('button', { name: '로그아웃' }))

    // 실패를 삼키고 멈추면 로그아웃 버튼이 먹지 않는 것처럼 보인다.
    expect(await screen.findByRole('heading', { name: '문제 목록 도착' })).toBeInTheDocument()
    expect(client.getQueryData(ME_QUERY_KEY)).toBeUndefined()
  })
})

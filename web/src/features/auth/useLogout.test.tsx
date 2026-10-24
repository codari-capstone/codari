import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { server } from '@/mocks/server'
import { readSavedCode, storeSavedCode } from '@/features/solve/savedCode'
import { ME_QUERY_KEY } from './authQuery'
import { useAuth } from './useAuth'
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

/** 도착한 화면이 세션을 다시 묻는 것까지 보려면 useAuth를 쓰는 화면이 있어야 한다. */
function SessionLabel() {
  const { isAuthenticated, isLoading } = useAuth()
  return <p>{isLoading ? '확인 중' : isAuthenticated ? '로그인 상태' : '비로그인'}</p>
}

function renderLogoutWithSessionLabel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(ME_QUERY_KEY, { id: 1, nickname: '코다리', role: 'USER' })

  const router = createMemoryRouter(
    [
      { path: '/me/report', Component: LogoutButton },
      {
        path: '/problems',
        element: (
          <>
            <h1>문제 목록 도착</h1>
            <SessionLabel />
          </>
        ),
      },
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
  afterEach(() => {
    localStorage.clear()
  })

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

  /**
   * 캐시만 비우면 공용 컴퓨터에서 로그아웃한 사람의 풀이 코드가 디스크에 남는다.
   * 로그아웃은 "이 사람의 데이터를 전부 잊는다"는 뜻이다 (useLogout 주석).
   */
  it('브라우저에 저장한 풀이 코드까지 지운다 (SOLVE-11)', async () => {
    const user = userEvent.setup()
    storeSavedCode(1, 1, 'PYTHON', 'print(1)')
    localStorage.setItem('codari-theme', 'dark')
    renderLogout()

    await user.click(screen.getByRole('button', { name: '로그아웃' }))
    await screen.findByRole('heading', { name: '문제 목록 도착' })

    expect(readSavedCode(1, 1, 'PYTHON')).toBeNull()
    // 테마는 사람이 아니라 이 기기의 보기 설정이라 남긴다.
    expect(localStorage.getItem('codari-theme')).toBe('dark')
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

  it('요청이 실패하고 서버 세션이 살아 있으면 로그아웃을 꾸며 내지 않는다', async () => {
    // 캐시를 비웠으므로 도착한 화면이 /api/me를 다시 묻는다. 세션이 남아 있으면 로그인
    // 상태가 그대로 돌아온다. ['me']에 null을 심어 로그아웃된 것처럼 보이게 하지 않는다 —
    // 공용 컴퓨터에서 "로그아웃됐다"고 본 사람의 세션이 실제로는 살아 있는 쪽이 더 위험하다.
    server.use(
      http.post('*/api/auth/logout', () =>
        HttpResponse.json({ status: 500, title: 'Server Error' }, { status: 500 }),
      ),
      http.get('*/api/me', () => HttpResponse.json({ id: 1, nickname: '코다리', role: 'USER' })),
    )
    const user = userEvent.setup()
    renderLogoutWithSessionLabel()

    await user.click(screen.getByRole('button', { name: '로그아웃' }))

    await screen.findByRole('heading', { name: '문제 목록 도착' })
    expect(await screen.findByText('로그인 상태')).toBeInTheDocument()
  })
})

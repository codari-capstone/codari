import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { server } from '@/mocks/server'
import { logoutRequest } from './authQuery'
import { Component as LoginPage } from './LoginPage'
import { safeRedirect } from './safeRedirect'

// MSW의 쿠키 저장소는 테스트 사이에 비워지지 않는다. 앞 테스트의 로그인이 남으면
// 다음 테스트가 이미 로그인한 상태로 시작해 폼 대신 이동 화면을 만난다.
afterEach(async () => {
  vi.restoreAllMocks()
  await logoutRequest()
})

// COM-07이 정한 고정 문구. 일부만 비교하면 꼬리가 바뀌어도 통과하므로 전체를 비교한다.
const CREDENTIAL_MESSAGE =
  '이메일 또는 비밀번호가 맞지 않아요. GitHub로 가입했다면 GitHub 로그인을 이용해 주세요'
const RATE_LIMIT_MESSAGE = '로그인 시도가 너무 많아요. 5분 후 다시 시도해 주세요'

/** 로그인 후 도착지를 확인할 수 있게 /submissions에 표식을 둔 메모리 라우터. */
function renderLogin(state?: unknown) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/login', Component: LoginPage },
      { path: '/problems', element: <h1>문제 목록 도착</h1> },
      { path: '/submissions', element: <h1>제출 기록 도착</h1> },
    ],
    { initialEntries: [{ pathname: '/login', state }] },
  )

  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return { router }
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('이메일'), 'user@codari.test')
  await user.type(screen.getByLabelText('비밀번호'), 'Codari!test1')
  await user.click(screen.getByRole('button', { name: '로그인' }))
}

describe('safeRedirect', () => {
  it('사이트 안 경로는 그대로 쓴다', () => {
    expect(safeRedirect('/submissions?page=2')).toBe('/submissions?page=2')
  })

  it('프로토콜 상대 주소를 거부한다', () => {
    // '//evil.com'을 navigate에 넘기면 외부로 나간다.
    expect(safeRedirect('//evil.com')).toBe('/problems')
  })

  it('절대 URL을 거부한다', () => {
    expect(safeRedirect('https://evil.com/x')).toBe('/problems')
  })

  it('경로가 아니거나 없으면 문제 목록으로 보낸다', () => {
    expect(safeRedirect(undefined)).toBe('/problems')
    expect(safeRedirect(42)).toBe('/problems')
    expect(safeRedirect('submissions')).toBe('/problems')
  })
})

describe('로그인 화면', () => {
  it('성공하면 from으로 돌아간다', async () => {
    const user = userEvent.setup()
    renderLogin({ from: '/submissions' })

    await fillAndSubmit(user)

    expect(await screen.findByRole('heading', { name: '제출 기록 도착' })).toBeInTheDocument()
  })

  it('from이 없으면 문제 목록으로 간다', async () => {
    const user = userEvent.setup()
    renderLogin()

    await fillAndSubmit(user)

    expect(await screen.findByRole('heading', { name: '문제 목록 도착' })).toBeInTheDocument()
  })

  it('401이면 COM-07 공통 문구를 보여 준다', async () => {
    server.use(
      http.post('*/api/auth/login', () =>
        HttpResponse.json({ status: 401, title: 'Unauthorized' }, { status: 401 }),
      ),
    )
    const user = userEvent.setup()
    renderLogin()

    await fillAndSubmit(user)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(CREDENTIAL_MESSAGE)
  })

  it('본문에 status가 없는 401도 COM-07 공통 문구를 보여 준다', async () => {
    // 오류 본문의 모든 member는 선택이라 status 없는 401도 적법한 응답이다.
    // 판단 근거는 본문이 아니라 HTTP 상태여야 한다.
    server.use(
      http.post('*/api/auth/login', () =>
        HttpResponse.json(
          { type: '/auth/invalid-credentials', title: 'Unauthorized' },
          { status: 401 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderLogin()

    await fillAndSubmit(user)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(CREDENTIAL_MESSAGE)
  })

  it('429면 제한 문구를 보여 준다', async () => {
    server.use(
      http.post('*/api/auth/login', () =>
        HttpResponse.json({ status: 429, title: 'Too Many' }, { status: 429 }),
      ),
    )
    const user = userEvent.setup()
    renderLogin()

    await fillAndSubmit(user)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(RATE_LIMIT_MESSAGE)
  })

  it('비밀번호 칸에서 Enter로 제출된다', async () => {
    const user = userEvent.setup()
    renderLogin({ from: '/submissions' })

    await user.type(screen.getByLabelText('이메일'), 'user@codari.test')
    await user.type(screen.getByLabelText('비밀번호'), 'Codari!test1{Enter}')

    expect(await screen.findByRole('heading', { name: '제출 기록 도착' })).toBeInTheDocument()
  })

  it('제출 중에는 버튼이 눌리지 않아 요청이 한 번만 나간다', async () => {
    let calls = 0
    server.use(
      http.post('*/api/auth/login', async () => {
        calls += 1
        // 두 번째 클릭이 들어올 틈을 만든다. 즉시 응답하면 이 테스트는
        // 버튼이 disabled가 아니어도 통과해 버린다.
        await new Promise((resolve) => setTimeout(resolve, 50))
        return HttpResponse.json({ id: 1, nickname: '코다리', role: 'USER' })
      }),
    )
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText('이메일'), 'user@codari.test')
    await user.type(screen.getByLabelText('비밀번호'), 'Codari!test1')

    const button = screen.getByRole('button', { name: /로그인/ })
    await user.click(button)
    await waitFor(() => expect(button).toBeDisabled())
    await user.click(button)

    await screen.findByRole('heading', { name: '문제 목록 도착' })
    expect(calls).toBe(1)
  })

  it('빈 칸으로 제출하면 요청을 보내지 않고 안내한다', async () => {
    let calls = 0
    server.use(
      http.post('*/api/auth/login', () => {
        calls += 1
        return HttpResponse.json({ id: 1, nickname: '코다리', role: 'USER' })
      }),
    )
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByText('이메일을 입력해 주세요')).toBeInTheDocument()
    expect(calls).toBe(0)
  })

  it('이미 로그인한 사람은 폼을 보지 않고 바로 이동한다', async () => {
    server.use(
      http.get('*/api/me', () => HttpResponse.json({ id: 1, nickname: '코다리', role: 'USER' })),
    )
    renderLogin({ from: '/submissions' })

    expect(await screen.findByRole('heading', { name: '제출 기록 도착' })).toBeInTheDocument()
    expect(screen.queryByLabelText('비밀번호')).not.toBeInTheDocument()
  })

  it('목 계정을 화면에 노출하지 않는다', async () => {
    renderLogin()

    const form = await screen.findByRole('form', { name: '로그인' })
    expect(within(form).queryByText(/codari\.test/)).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('Codari!test1')
  })

  it('아직 없는 화면으로 가는 링크를 두지 않는다', async () => {
    // 회원가입(COM-06)·비밀번호 찾기(COM-08)는 2차다. 링크를 미리 두면 404로 떨어진다.
    renderLogin()

    await screen.findByRole('form', { name: '로그인' })
    expect(screen.queryByRole('link', { name: /회원가입/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /비밀번호 찾기/ })).not.toBeInTheDocument()
  })
})

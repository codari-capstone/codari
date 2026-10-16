import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { resetEmailCodes } from '@/mocks/fixtures/emailCodes'
import { mockAccounts } from '@/mocks/fixtures/users'
import { server } from '@/mocks/server'
import { Component as PasswordResetPage } from './PasswordResetPage'

afterEach(() => resetEmailCodes())

function renderReset(from?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/password-reset', Component: PasswordResetPage },
      { path: '/login', element: <h1>로그인 화면</h1> },
      { path: '/problems', element: <h1>문제 목록 도착</h1> },
    ],
    // from은 로그인 화면의 [비밀번호 찾기] 링크가 넘긴다 (원래 가려던 화면).
    { initialEntries: [{ pathname: '/password-reset', state: from ? { from } : null }] },
  )

  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return { router }
}

/** 인증까지 끝낸 상태로 만든다. 재설정은 가입된 이메일에만 번호를 보낸다. */
async function verifyEmail(user: ReturnType<typeof userEvent.setup>, email: string) {
  await user.type(await screen.findByLabelText('이메일'), email)
  await user.click(screen.getByRole('button', { name: '인증번호 받기' }))
  await user.type(await screen.findByLabelText('인증번호'), '123456')
  await user.click(screen.getByRole('button', { name: '확인' }))
  await screen.findByText('인증됐어요')
}

const NEW_PASSWORD = 'Codari!new12'

async function typePasswords(
  user: ReturnType<typeof userEvent.setup>,
  password = NEW_PASSWORD,
  confirm = password,
) {
  await user.type(screen.getByLabelText('새 비밀번호'), password)
  await user.type(screen.getByLabelText('새 비밀번호 확인'), confirm)
}

describe('비밀번호 재설정 화면', () => {
  it('처음에는 재설정이 꺼져 있다', async () => {
    renderReset()
    expect(await screen.findByRole('button', { name: '재설정' })).toBeDisabled()
  })

  it('가입되지 않은 이메일이면 서버 문구를 보여 준다', async () => {
    const user = userEvent.setup()
    renderReset()

    await user.type(await screen.findByLabelText('이메일'), 'nobody@codari.test')
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))

    expect(
      await screen.findByText('가입되지 않은 이메일이에요. 이메일을 정확히 입력해 주세요'),
    ).toBeInTheDocument()
    // 가입 화면과 달리 [로그인하러 가기]를 붙이지 않는다 — 그 이메일에는 계정이 없다.
    expect(screen.queryByRole('link', { name: '로그인하러 가기' })).not.toBeInTheDocument()
  })

  it('인증하고 새 비밀번호를 넣으면 재설정이 켜진다', async () => {
    const user = userEvent.setup()
    renderReset()

    await verifyEmail(user, mockAccounts[0]!.email)
    await typePasswords(user)

    expect(screen.getByRole('button', { name: '재설정' })).toBeEnabled()
  })

  it('인증하지 않았으면 비밀번호가 맞아도 재설정이 꺼져 있다', async () => {
    const user = userEvent.setup()
    renderReset()

    await screen.findByLabelText('이메일')
    await typePasswords(user)

    expect(screen.getByRole('button', { name: '재설정' })).toBeDisabled()
  })

  it('규칙에 맞지 않는 비밀번호면 재설정이 꺼져 있다', async () => {
    const user = userEvent.setup()
    renderReset()

    await verifyEmail(user, mockAccounts[0]!.email)
    await typePasswords(user, 'short1!')

    expect(screen.getByRole('button', { name: '재설정' })).toBeDisabled()
  })

  it('두 비밀번호가 다르면 재설정이 꺼져 있다', async () => {
    const user = userEvent.setup()
    renderReset()

    await verifyEmail(user, mockAccounts[0]!.email)
    await typePasswords(user, NEW_PASSWORD, 'Codari!new13')

    expect(screen.getByRole('button', { name: '재설정' })).toBeDisabled()
  })

  it('재설정하면 로그인 화면으로 가고 안내를 넘긴다', async () => {
    const user = userEvent.setup()
    const { router } = renderReset()

    await verifyEmail(user, mockAccounts[0]!.email)
    await typePasswords(user)
    await user.click(screen.getByRole('button', { name: '재설정' }))

    expect(await screen.findByRole('heading', { name: '로그인 화면' })).toBeInTheDocument()
    expect(router.state.location.state).toEqual({
      notice: '비밀번호를 바꿨어요. 새 비밀번호로 로그인해 주세요',
    })
  })

  it('원래 가려던 화면을 로그인 화면으로 넘긴다', async () => {
    // 로그인 화면의 [비밀번호 찾기]가 실어 준 목적지다. 끊기면 비밀번호를 바꾸고
    // 로그인해도 들어오려던 화면이 아니라 문제 목록으로 간다.
    const user = userEvent.setup()
    const { router } = renderReset('/problems/42')

    await verifyEmail(user, mockAccounts[0]!.email)
    await typePasswords(user)
    await user.click(screen.getByRole('button', { name: '재설정' }))

    await screen.findByRole('heading', { name: '로그인 화면' })
    expect(router.state.location.state).toMatchObject({ from: '/problems/42' })
  })

  it('규칙 오류 뒤에는 같은 증명서로 다시 시도해 성공한다', async () => {
    // 서버는 규칙을 UPDATE보다 먼저 검사하므로 증명서가 쓰이지 않는다.
    let calls = 0
    const tokens: unknown[] = []
    server.use(
      http.post('*/api/auth/password-reset', async ({ request }) => {
        calls += 1
        tokens.push(((await request.json()) as { resetToken: unknown }).resetToken)
        if (calls === 1) {
          return HttpResponse.json(
            { status: 400, code: 'INVALID_PASSWORD', detail: '서버가 거절한 비밀번호예요' },
            { status: 400 },
          )
        }
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderReset()

    await verifyEmail(user, mockAccounts[0]!.email)
    await typePasswords(user)
    await user.click(screen.getByRole('button', { name: '재설정' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('서버가 거절한 비밀번호예요')
    // 증명서를 버리지 않았다: 인증 표시가 남고 재설정도 켜져 있다.
    expect(screen.getByText('인증됐어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '재설정' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '재설정' }))

    expect(await screen.findByRole('heading', { name: '로그인 화면' })).toBeInTheDocument()
    expect(calls).toBe(2)
    expect(tokens[1]).toBe(tokens[0])
  })

  it('RESET_EXPIRED면 인증 단계로 되돌린다', async () => {
    server.use(
      http.post('*/api/auth/password-reset', () =>
        HttpResponse.json(
          {
            status: 400,
            code: 'RESET_EXPIRED',
            detail: '인증 시간이 지났어요. 인증번호를 다시 받아 주세요',
          },
          { status: 400 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderReset()

    await verifyEmail(user, mockAccounts[0]!.email)
    await typePasswords(user)
    await user.click(screen.getByRole('button', { name: '재설정' }))

    expect(await screen.findByText(/인증번호를 다시 받아 주세요/)).toBeInTheDocument()
    expect(screen.queryByText('인증됐어요')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '재설정' })).toBeDisabled()
  })

  it('RESET_EXPIRED 뒤 다시 인증하면 오류가 사라지고 재설정할 수 있다', async () => {
    let calls = 0
    server.use(
      http.post('*/api/auth/password-reset', () => {
        calls += 1
        if (calls === 1) {
          return HttpResponse.json(
            {
              status: 400,
              code: 'RESET_EXPIRED',
              detail: '인증 시간이 지났어요. 인증번호를 다시 받아 주세요',
            },
            { status: 400 },
          )
        }
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderReset()

    await verifyEmail(user, mockAccounts[0]!.email)
    await typePasswords(user)
    await user.click(screen.getByRole('button', { name: '재설정' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    // 이메일 단계가 새로 마운트돼 이메일 칸이 비었고 다시 인증할 수 있다.
    await verifyEmail(user, mockAccounts[0]!.email)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '재설정' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '재설정' }))
    expect(await screen.findByRole('heading', { name: '로그인 화면' })).toBeInTheDocument()
  })

  it('재설정을 두 번 눌러도 요청은 한 번 나간다', async () => {
    // 두 번째는 RESET_EXPIRED를 받아, 바뀐 사람에게 실패 문구가 뜬다.
    let calls = 0
    server.use(
      http.post('*/api/auth/password-reset', async () => {
        calls += 1
        await new Promise((resolve) => setTimeout(resolve, 50))
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderReset()

    await verifyEmail(user, mockAccounts[0]!.email)
    await typePasswords(user)

    const submit = screen.getByRole('button', { name: /재설정/ })
    await user.click(submit)
    await user.click(submit)

    await screen.findByRole('heading', { name: '로그인 화면' })
    expect(calls).toBe(1)
  })

  it('이미 로그인한 사람은 문제 목록으로 보낸다', async () => {
    server.use(
      http.get('*/api/me', () => HttpResponse.json({ id: 1, nickname: '코다리', role: 'USER' })),
    )
    renderReset()

    expect(await screen.findByRole('heading', { name: '문제 목록 도착' })).toBeInTheDocument()
  })
})

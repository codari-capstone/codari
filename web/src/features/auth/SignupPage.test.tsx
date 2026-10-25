import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { resetEmailCodes } from '@/mocks/fixtures/emailCodes'
import { mockAccounts } from '@/mocks/fixtures/users'
import { server } from '@/mocks/server'
import { Component as SignupPage } from './SignupPage'

afterEach(() => resetEmailCodes())

type User = ReturnType<typeof userEvent.setup>

function renderSignup(from?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/signup', Component: SignupPage },
      { path: '/login', element: <h1>로그인 화면</h1> },
      { path: '/problems', element: <h1>문제 목록 도착</h1> },
    ],
    // from은 RequireAuth가 로그인 화면에 실어 주고, 로그인 화면의 [회원가입] 링크가 여기로 넘긴다.
    { initialEntries: [{ pathname: '/signup', state: from ? { from } : null }] },
  )

  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return { router }
}

/** 이메일 인증까지 끝낸 상태로 만든다. 대부분의 테스트가 여기서 시작한다. */
async function verifyEmail(user: User, email = 'new@codari.test') {
  await user.type(await screen.findByLabelText('이메일'), email)
  await user.click(screen.getByRole('button', { name: '인증번호 받기' }))
  await user.type(await screen.findByLabelText('인증번호'), '123456')
  await user.click(screen.getByRole('button', { name: '확인' }))
  await screen.findByText('인증됐어요')
}

async function checkNickname(user: User, nickname: string) {
  await user.type(screen.getByLabelText('닉네임'), nickname)
  await user.click(screen.getByRole('button', { name: '중복 확인' }))
  await screen.findByText('쓸 수 있어요')
}

async function fillPasswords(user: User, password = 'Codari!test1', confirm = password) {
  await user.type(screen.getByLabelText('비밀번호'), password)
  await user.type(screen.getByLabelText('비밀번호 확인'), confirm)
}

const submitButton = () => screen.getByRole('button', { name: /^가입/ })

describe('회원가입 화면', () => {
  it('처음에는 가입 완료가 꺼져 있다', async () => {
    renderSignup()
    expect(await screen.findByRole('button', { name: '가입 완료' })).toBeDisabled()
  })

  it('닉네임 규칙을 칸 아래에 보인다', async () => {
    // 규칙에 안 맞으면 중복 확인이 꺼지는데, 이유가 화면에 없으면 죽은 버튼으로 보인다.
    renderSignup()
    expect(await screen.findByText('2~16자, 한글·영문·숫자')).toBeInTheDocument()
  })

  it('세 조건을 다 채우면 가입 완료가 켜진다', async () => {
    const user = userEvent.setup()
    renderSignup()

    await verifyEmail(user)
    await checkNickname(user, '새사람')
    await fillPasswords(user)

    expect(screen.getByRole('button', { name: '가입 완료' })).toBeEnabled()
  })

  it('이메일 인증이 없으면 나머지를 채워도 꺼져 있고, 인증을 되돌리면 다시 꺼진다', async () => {
    const user = userEvent.setup()
    renderSignup()

    // 인증 전에 닉네임 확인과 비밀번호를 먼저 채운다.
    await screen.findByLabelText('이메일') // 세션 확인이 끝나 폼이 그려질 때까지
    await checkNickname(user, '새사람')
    await fillPasswords(user)
    expect(submitButton()).toBeDisabled()

    await verifyEmail(user)
    expect(submitButton()).toBeEnabled()

    // 이메일 바꾸기는 증명서를 버린다. 버튼이 켜진 채 남으면 죽은 증명서로 가입을 보낸다.
    await user.click(screen.getByRole('button', { name: '이메일 바꾸기' }))
    expect(submitButton()).toBeDisabled()
  })

  it('닉네임 중복 확인을 하지 않았으면 꺼져 있다', async () => {
    const user = userEvent.setup()
    renderSignup()

    await verifyEmail(user)
    await user.type(screen.getByLabelText('닉네임'), '새사람')
    await fillPasswords(user)

    expect(submitButton()).toBeDisabled()
  })

  it('비밀번호가 규칙을 어기면 확인 칸이 같아도 꺼져 있다', async () => {
    const user = userEvent.setup()
    renderSignup()

    await verifyEmail(user)
    await checkNickname(user, '새사람')
    await fillPasswords(user, 'short1!')

    expect(submitButton()).toBeDisabled()
  })

  it('비밀번호 확인만 고쳐도 버튼 상태가 따라온다', async () => {
    // 한 칸만 보고 판단하면 확인 칸을 고쳐도 버튼이 꺼진 채 남는다 (Review Focus 5).
    const user = userEvent.setup()
    renderSignup()

    await verifyEmail(user)
    await checkNickname(user, '새사람')
    await fillPasswords(user, 'Codari!test1', 'Codari!test2')

    expect(screen.getByRole('button', { name: '가입 완료' })).toBeDisabled()

    await user.clear(screen.getByLabelText('비밀번호 확인'))
    await user.type(screen.getByLabelText('비밀번호 확인'), 'Codari!test1')

    expect(screen.getByRole('button', { name: '가입 완료' })).toBeEnabled()
  })

  it('닉네임을 바꾸면 중복 확인이 풀린다', async () => {
    const user = userEvent.setup()
    renderSignup()

    await verifyEmail(user)
    await checkNickname(user, '새사람')
    await fillPasswords(user)
    expect(submitButton()).toBeEnabled()

    await user.type(screen.getByLabelText('닉네임'), '2')

    expect(screen.queryByText('쓸 수 있어요')).not.toBeInTheDocument()
    expect(submitButton()).toBeDisabled()
  })

  it('이미 쓰는 닉네임이면 서버 문구 대신 안내를 보여 주고, 고치면 안내가 사라진다', async () => {
    // available: false는 200이라 서버 문구가 없다. 이 문구는 프론트가 정한다.
    const user = userEvent.setup()
    renderSignup()

    await verifyEmail(user)
    await user.type(screen.getByLabelText('닉네임'), mockAccounts[0]!.user.nickname)
    await user.click(screen.getByRole('button', { name: '중복 확인' }))

    expect(await screen.findByText('이미 사용 중인 닉네임이에요')).toBeInTheDocument()

    await user.type(screen.getByLabelText('닉네임'), '2')
    expect(screen.queryByText('이미 사용 중인 닉네임이에요')).not.toBeInTheDocument()
  })

  it('이미 가입된 이메일이면 서버 문구와 로그인 링크를 보여 준다', async () => {
    const user = userEvent.setup()
    renderSignup()

    await user.type(await screen.findByLabelText('이메일'), mockAccounts[0]!.email)
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))

    expect(await screen.findByText('이미 가입된 이메일이에요')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '로그인하러 가기' })).toHaveAttribute('href', '/login')
  })

  it('가입하면 로그인 화면으로 가고 안내를 넘긴다', async () => {
    const user = userEvent.setup()
    const { router } = renderSignup()

    await verifyEmail(user)
    await checkNickname(user, '새사람')
    await fillPasswords(user)
    await user.click(screen.getByRole('button', { name: '가입 완료' }))

    expect(await screen.findByRole('heading', { name: '로그인 화면' })).toBeInTheDocument()
    expect(router.state.location.state).toEqual({ notice: '가입이 완료됐어요. 로그인해 주세요' })
  })

  it('가입 완료를 두 번 눌러도 요청은 한 번 나간다', async () => {
    // 첫 요청이 계정을 만들고, 두 번째는 409 EMAIL_TAKEN을 받아 가입된 사람에게
    // "이미 가입된 이메일이에요"가 뜬다.
    let calls = 0
    server.use(
      http.post('*/api/auth/signup', async () => {
        calls += 1
        await new Promise((resolve) => setTimeout(resolve, 50))
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderSignup()

    await verifyEmail(user)
    await checkNickname(user, '새사람')
    await fillPasswords(user)

    const submit = submitButton()
    await user.click(submit)
    await user.click(submit)

    await screen.findByRole('heading', { name: '로그인 화면' })
    expect(calls).toBe(1)
  })

  it('원래 가려던 화면을 로그인 화면으로 넘긴다', async () => {
    // RequireAuth가 문제 상세에서 보낸 사람이 가입을 거쳤다. 로그인하면 목록이 아니라
    // 그 상세로 들어가야 한다. 넘기지 않으면 그 정보가 여기서 끊긴다.
    const user = userEvent.setup()
    const { router } = renderSignup('/problems/42')

    await verifyEmail(user)
    await checkNickname(user, '새사람')
    await fillPasswords(user)
    await user.click(screen.getByRole('button', { name: '가입 완료' }))

    await screen.findByRole('heading', { name: '로그인 화면' })
    expect(router.state.location.state).toMatchObject({ from: '/problems/42' })
  })

  it('가입 요청 중에는 중복 확인을 눌러도 가입이 다시 열리지 않는다', async () => {
    // 중복 확인의 onSuccess가 submit.reset()을 부른다. 진행 중까지 지워 버리면 [가입 완료]가
    // 다시 켜지고, 한 번 더 누르면 두 번째 POST가 나가 이미 가입된 사람이 409를 본다.
    let calls = 0
    server.use(
      http.post('*/api/auth/signup', async () => {
        calls += 1
        await new Promise((resolve) => setTimeout(resolve, 80))
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderSignup()

    await verifyEmail(user)
    await checkNickname(user, '새사람')
    await fillPasswords(user)
    await user.click(submitButton())

    const recheck = screen.getByRole('button', { name: '중복 확인' })
    expect(recheck).toBeDisabled()
    await user.click(recheck)

    expect(submitButton()).toBeDisabled()
    await user.click(submitButton())

    await screen.findByRole('heading', { name: '로그인 화면' })
    expect(calls).toBe(1)
  })

  it('가입 때 닉네임이 선점되면 닉네임만 풀리고, 새 닉네임으로 이어서 가입한다', async () => {
    // 중복 확인 시점에는 비어 있었다가 가입 시점에 선점된 경쟁을 만든다. 확인 응답만 한 번
    // 거짓으로 덮고, 가입은 목의 실제 경로(NICKNAME_TAKEN)를 탄다.
    const taken = mockAccounts[0]!.user.nickname
    server.use(
      http.get('*/api/auth/nickname-availability', () => HttpResponse.json({ available: true }), {
        once: true,
      }),
    )
    const user = userEvent.setup()
    renderSignup()

    await verifyEmail(user)
    await checkNickname(user, taken)
    await fillPasswords(user)
    await user.click(screen.getByRole('button', { name: '가입 완료' }))

    // 닉네임 확인만 풀린다. 이메일 인증은 살아 있어야 한다 — 명세가 "닉네임만 다시 입력"이다.
    // 목이 보낸 서버 문구다. 프론트의 같은 문구와 구분하려고 submit 오류 문단(role="alert")을 집는다.
    expect(await screen.findByRole('alert')).toHaveTextContent('이미 사용 중인 닉네임이에요')
    expect(screen.queryByText('쓸 수 있어요')).not.toBeInTheDocument()
    // 경고를 들은 사용자가 고칠 칸으로 커서가 간다.
    expect(screen.getByLabelText('닉네임')).toHaveFocus()
    expect(screen.getByText('인증됐어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '가입 완료' })).toBeDisabled()

    // 증명서는 닳지 않는다. 닉네임만 고쳐 다시 확인하면 같은 증명서로 가입된다.
    await user.clear(screen.getByLabelText('닉네임'))
    await checkNickname(user, '새사람')
    expect(screen.getByText('인증됐어요')).toBeInTheDocument()
    // 지난 가입 실패 문구가 새 확인 결과 옆에 남아 있으면 안 된다.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '가입 완료' }))

    expect(await screen.findByRole('heading', { name: '로그인 화면' })).toBeInTheDocument()
  })

  it('증명서가 만료되면 이메일 단계로 되돌린다', async () => {
    server.use(
      http.post('*/api/auth/signup', () =>
        HttpResponse.json(
          {
            status: 400,
            code: 'VERIFICATION_EXPIRED',
            detail: '인증 시간이 지났어요. 이메일을 다시 인증해 주세요',
          },
          { status: 400 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderSignup()

    await verifyEmail(user)
    await checkNickname(user, '새사람')
    await fillPasswords(user)
    await user.click(screen.getByRole('button', { name: '가입 완료' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/이메일을 다시 인증해 주세요/)
    expect(screen.queryByText('인증됐어요')).not.toBeInTheDocument()
    // 다시 마운트돼 send.error가 비었으니 이 상태에는 링크가 하나도 없어야 한다.
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    // 이메일 단계가 새로 마운트돼 입력이 비고 다시 편집할 수 있다.
    expect(screen.getByLabelText('이메일')).toHaveValue('')
    expect(screen.getByLabelText('이메일')).not.toHaveAttribute('readonly')

    // 이메일을 다시 인증하면 만료 문구가 설명하던 상태는 끝났다.
    server.resetHandlers()
    await verifyEmail(user, 'again@codari.test')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('가입 때 이메일이 이미 쓰였으면 서버 문구를 보이고 이메일 단계로 되돌린다', async () => {
    const user = userEvent.setup()
    renderSignup()

    await verifyEmail(user)
    await checkNickname(user, '새사람')
    await fillPasswords(user)
    // 인증 뒤 다른 경로로 같은 이메일이 가입됐다.
    server.use(
      http.post('*/api/auth/signup', () =>
        HttpResponse.json(
          { status: 409, code: 'EMAIL_TAKEN', detail: '이미 가입된 이메일이에요' },
          { status: 409 },
        ),
      ),
    )
    await user.click(screen.getByRole('button', { name: '가입 완료' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('이미 가입된 이메일이에요')
    // 이메일 칸이 비어 있어도 갈 곳이 있어야 한다.
    expect(screen.getByRole('link', { name: '로그인하러 가기' })).toHaveAttribute('href', '/login')
    expect(screen.queryByText('인증됐어요')).not.toBeInTheDocument()
    expect(submitButton()).toBeDisabled()
  })

  it('확인하는 사이 닉네임을 고치면 늦게 온 응답은 무시한다', async () => {
    server.use(
      http.get('*/api/auth/nickname-availability', async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        return HttpResponse.json({ available: false })
      }),
    )
    const user = userEvent.setup()
    renderSignup()

    await user.type(await screen.findByLabelText('닉네임'), '새사람')
    await user.click(screen.getByRole('button', { name: '중복 확인' }))
    await user.type(screen.getByLabelText('닉네임'), '2')
    await new Promise((resolve) => setTimeout(resolve, 150))

    // 고치기 전 값에 대한 "사용 중" 응답을 지금 값에 붙이면 안 된다.
    expect(screen.queryByText('이미 사용 중인 닉네임이에요')).not.toBeInTheDocument()
    expect(screen.queryByText('쓸 수 있어요')).not.toBeInTheDocument()
  })

  it('증명서를 브라우저 저장소에 남기지 않는다', async () => {
    // 가입 증명서는 그 이메일의 소유를 증명하는 값이다. 남기면 그 기기를 다음에 쓰는
    // 사람이 꺼내 쓸 수 있다 (명세서 3.2). 새로고침하면 처음부터 하는 쪽이 맞다.
    const user = userEvent.setup()
    renderSignup()

    await verifyEmail(user)

    const stored = [localStorage, sessionStorage].flatMap((store) =>
      Object.keys(store).map((key) => store.getItem(key) ?? ''),
    )
    expect(stored.some((value) => value.includes('mock-signup'))).toBe(false)
  })

  it('이미 로그인한 사람은 문제 목록으로 보낸다', async () => {
    server.use(
      http.get('*/api/users/me', () =>
        HttpResponse.json({ id: 1, nickname: '코다리', role: 'USER' }),
      ),
    )
    renderSignup()

    expect(await screen.findByRole('heading', { name: '문제 목록 도착' })).toBeInTheDocument()
  })

  it('가입 요청 중에는 이메일 단계가 잠겨 두 번 제출되지 않는다', async () => {
    // [이메일 바꾸기]로 다른 주소를 인증하면 onVerified가 submit.reset()을 부른다. 가드가
    // 없으면 '진행 중'까지 지워 [가입 완료]가 다시 켜지고, 한 번 더 누르면 두 번째 POST가
    // 나간다. 첫 요청이 성공하면 로그인 화면으로 가고 두 번째는 409로 돌아와 어긋난다.
    const user = userEvent.setup()
    let calls = 0
    let finishSignup: () => void = () => {}
    server.use(
      http.post('*/api/auth/signup', async () => {
        calls += 1
        await new Promise<void>((resolve) => (finishSignup = resolve))
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderSignup()

    await verifyEmail(user)
    await checkNickname(user, '코다리2')
    await fillPasswords(user)
    await user.click(submitButton())

    // 제출 중에는 이메일을 바꿀 수도, 다시 인증할 수도 없다.
    expect(screen.getByRole('button', { name: '이메일 바꾸기' })).toBeDisabled()
    expect(submitButton()).toBeDisabled()

    finishSignup()
    await screen.findByRole('heading', { name: '로그인 화면' })
    expect(calls).toBe(1)
  })

  it('EMAIL_TAKEN의 로그인하러 가기가 원래 가려던 화면을 싣는다', async () => {
    // 가입 성공 뒤 이동은 from을 싣는데 이 링크가 안 실으면, /problems/42에서 넘어온
    // 사람이 로그인에 성공해도 문제 목록으로 간다. 같은 화면의 두 동작이 달라진다.
    const user = userEvent.setup()
    server.use(
      http.post('*/api/auth/signup/email-code', () =>
        HttpResponse.json(
          { status: 409, code: 'EMAIL_TAKEN', detail: '이미 가입된 이메일이에요' },
          { status: 409 },
        ),
      ),
    )
    const { router } = renderSignup('/problems/42')

    await user.type(await screen.findByLabelText('이메일'), 'taken@codari.test')
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))
    await screen.findByText(/이미 가입된 이메일이에요/)

    await user.click(screen.getByRole('link', { name: '로그인하러 가기' }))

    await screen.findByRole('heading', { name: '로그인 화면' })
    expect(router.state.location.state).toMatchObject({ from: '/problems/42' })
  })
})

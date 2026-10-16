import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EmailCodeStep } from './EmailCodeStep'

function setup(overrides: Partial<Parameters<typeof EmailCodeStep>[0]> = {}) {
  const sendCode = vi.fn<(email: string) => Promise<void>>().mockResolvedValue(undefined)
  const verifyCode = vi
    .fn<(input: { email: string; code: string }) => Promise<string>>()
    .mockResolvedValue('token-1')
  const onVerified = vi.fn()

  // EmailCodeStep이 useMutation을 쓰므로 Provider가 필요하다. 변이의 기본값은 재시도
  // 없음이라 mutations에는 설정할 것이 없다.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <EmailCodeStep
        sendCode={sendCode}
        verifyCode={verifyCode}
        onVerified={onVerified}
        {...overrides}
      />
    </QueryClientProvider>,
  )

  return { sendCode, verifyCode, onVerified }
}

describe('EmailCodeStep', () => {
  it('발송 전에는 인증번호 칸이 없다', () => {
    setup()
    expect(screen.queryByLabelText('인증번호')).not.toBeInTheDocument()
  })

  it('이메일 모양이 아니면 보내지 않는다', async () => {
    const user = userEvent.setup()
    const { sendCode } = setup()

    await user.type(screen.getByLabelText('이메일'), 'codari.test')
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))

    expect(await screen.findByText('이메일 형식이 올바르지 않아요')).toBeInTheDocument()
    expect(sendCode).not.toHaveBeenCalled()
  })

  it('발송에 성공하면 인증번호 칸이 열린다', async () => {
    const user = userEvent.setup()
    setup()

    await user.type(screen.getByLabelText('이메일'), 'new@codari.test')
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))

    expect(await screen.findByLabelText('인증번호')).toBeInTheDocument()
  })

  it('6자리가 아니면 확인을 보내지 않는다', async () => {
    // 계약의 패턴은 ^[0-9]{6}$다 (Review Focus 2).
    const user = userEvent.setup()
    const { verifyCode } = setup()

    await user.type(screen.getByLabelText('이메일'), 'new@codari.test')
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))
    await user.type(await screen.findByLabelText('인증번호'), '12345')
    await user.click(screen.getByRole('button', { name: '확인' }))

    expect(verifyCode).not.toHaveBeenCalled()
  })

  it('확인에 성공하면 증명서를 올려 준다', async () => {
    const user = userEvent.setup()
    const { onVerified } = setup()

    await user.type(screen.getByLabelText('이메일'), 'new@codari.test')
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))
    await user.type(await screen.findByLabelText('인증번호'), '123456')
    await user.click(screen.getByRole('button', { name: '확인' }))

    expect(onVerified).toHaveBeenCalledWith('token-1')
  })

  it('인증이 끝나면 이메일 칸을 잠그고, 바꾸면 인증이 풀린다', async () => {
    const user = userEvent.setup()
    const { onVerified } = setup()

    await user.type(screen.getByLabelText('이메일'), 'new@codari.test')
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))
    await user.type(await screen.findByLabelText('인증번호'), '123456')
    await user.click(screen.getByRole('button', { name: '확인' }))

    expect(screen.getByLabelText('이메일')).toHaveAttribute('readonly')

    await user.click(screen.getByRole('button', { name: '이메일 바꾸기' }))

    // 인증이 풀렸다는 것을 부모에게 알려야 한다. 알리지 않으면 다른 이메일로 받은
    // 증명서로 가입이 된다.
    expect(onVerified).toHaveBeenLastCalledWith('')
    expect(screen.getByLabelText('이메일')).not.toHaveAttribute('readonly')
    expect(screen.queryByLabelText('인증번호')).not.toBeInTheDocument()
  })

  it('발송 오류의 서버 문구를 그대로 보여 주고, 부모가 준 동작을 옆에 붙인다', async () => {
    const user = userEvent.setup()
    setup({
      sendCode: vi.fn().mockRejectedValue({
        status: 409,
        code: 'EMAIL_TAKEN',
        detail: '이미 가입된 이메일이에요',
      }),
      sendErrorAction: (code) =>
        code === 'EMAIL_TAKEN' ? <a href="/login">로그인하러 가기</a> : null,
    })

    await user.type(screen.getByLabelText('이메일'), 'user@codari.test')
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))

    expect(await screen.findByText('이미 가입된 이메일이에요')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '로그인하러 가기' })).toBeInTheDocument()
  })

  it('MAIL_FAILED면 인증번호 칸을 닫고 다시 받게 한다', async () => {
    // 서버는 이전 번호를 무효로 만든 뒤 새 번호를 저장하고 메일을 보낸다(EmailCodeService).
    // 발송이 실패하면 새 번호는 사용자에게 가지 않았고 이전 번호는 이미 죽었다. 칸을 열어
    // 두면 옛 번호를 넣어 CODE_MISMATCH를 받고, 받아 본 적 없는 번호에 시도 횟수만 쌓인다.
    // 계약도 "번호는 만들어진 채라 1분 뒤 다시 받아야 한다"고 적었다.
    const user = userEvent.setup()
    setup({
      sendCode: vi.fn().mockRejectedValue({
        status: 503,
        code: 'MAIL_FAILED',
        detail: '메일을 보내지 못했어요. 1분 뒤 다시 시도해 주세요',
      }),
    })

    await user.type(screen.getByLabelText('이메일'), 'new@codari.test')
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))

    expect(await screen.findByText(/메일을 보내지 못했어요/)).toBeInTheDocument()
    expect(screen.queryByLabelText('인증번호')).not.toBeInTheDocument()
    // 실패해도 쿨다운은 돈다. 서버는 번호를 만들었으므로 1분 안에 또 보내면 429를 맞는다.
    // 칸을 열지 않으므로 버튼 이름은 '다시 받기'가 아니라 '인증번호 받기'로 남는다 —
    // 번호를 받아 본 적 없는 사용자에게는 그게 맞는 말이다.
    const resend = screen.getByRole('button', { name: /인증번호 받기/ })
    expect(resend).toBeDisabled()
    expect(resend).toHaveTextContent(/[0-9]+초/)
  })

  it('MAIL_FAILED 뒤 다시 보내 성공하면 칸이 열리고 실패 문구가 사라진다', async () => {
    const user = userEvent.setup()
    let calls = 0
    setup({
      sendCode: vi.fn(async () => {
        calls += 1
        if (calls === 1) {
          throw {
            status: 503,
            code: 'MAIL_FAILED',
            detail: '메일을 보내지 못했어요. 1분 뒤 다시 시도해 주세요',
          }
        }
      }),
    })

    await user.type(screen.getByLabelText('이메일'), 'new@codari.test')
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))
    await screen.findByText(/메일을 보내지 못했어요/)

    // 쿨다운이 버튼을 막으므로 주소를 고쳐 상태를 비우고 다시 보낸다. 사용자가 1분을
    // 기다린 뒤 다시 받는 자리와 같다 — 여기서 보려는 것은 성공한 뒤의 화면이다.
    await user.clear(screen.getByLabelText('이메일'))
    await user.type(screen.getByLabelText('이메일'), 'other@codari.test')
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))

    expect(await screen.findByLabelText('인증번호')).toBeInTheDocument()
    expect(screen.queryByText(/메일을 보내지 못했어요/)).not.toBeInTheDocument()
  })

  it('발송 오류 문구는 인증에 성공하면 사라진다', async () => {
    // 429는 번호를 새로 만들지 않으므로 먼저 받은 번호가 아직 유효하다. 인증은 이어지는데
    // "요청이 너무 많아요"가 인증됐어요 옆에 남으면 모순이다. MAIL_FAILED는 칸을 닫으므로
    // 이 자리에 올 수 없다 — 위 테스트가 그것을 고정한다.
    const user = userEvent.setup()
    setup()

    await user.type(screen.getByLabelText('이메일'), 'new@codari.test')
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))
    await screen.findByLabelText('인증번호')

    await user.type(screen.getByLabelText('인증번호'), '123456')
    await user.click(screen.getByRole('button', { name: '확인' }))

    expect(await screen.findByText('인증됐어요')).toBeInTheDocument()
    expect(screen.queryByText(/요청이 너무 많아요/)).not.toBeInTheDocument()
    expect(screen.queryByText(/메일을 보내지 못했어요/)).not.toBeInTheDocument()
  })

  it('번호가 가지 않은 발송 오류(EMAIL_TAKEN)에서는 바로 다시 보낼 수 있고 칸은 닫혀 있다', async () => {
    // 번호를 보내지 않았으므로 쿨다운을 돌리면 오타를 고친 사용자가 이유도 모른 채 막힌다.
    const user = userEvent.setup()
    setup({
      sendCode: vi.fn().mockRejectedValue({
        status: 409,
        code: 'EMAIL_TAKEN',
        detail: '이미 가입된 이메일이에요',
      }),
    })

    await user.type(screen.getByLabelText('이메일'), 'user@codari.test')
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))
    await screen.findByText('이미 가입된 이메일이에요')

    expect(screen.getByRole('button', { name: '인증번호 받기' })).toBeEnabled()
    expect(screen.queryByLabelText('인증번호')).not.toBeInTheDocument()
  })

  it('TOO_MANY_REQUESTS에서는 카운트다운이 보이고 칸은 닫혀 있다', async () => {
    const user = userEvent.setup()
    setup({
      sendCode: vi.fn().mockRejectedValue({
        status: 429,
        code: 'TOO_MANY_REQUESTS',
        detail: '잠시 후 다시 시도해 주세요',
      }),
    })

    await user.type(screen.getByLabelText('이메일'), 'new@codari.test')
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))
    await screen.findByText('잠시 후 다시 시도해 주세요')

    const button = screen.getByRole('button', { name: /인증번호 받기/ })
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent(/\(\d+초\)/)
    expect(screen.queryByLabelText('인증번호')).not.toBeInTheDocument()
  })

  it('인증 뒤 이메일을 바꾸면 이전 주소의 쿨다운을 물려받지 않는다', async () => {
    const user = userEvent.setup()
    setup()

    await user.type(screen.getByLabelText('이메일'), 'new@codari.test')
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))
    await user.type(await screen.findByLabelText('인증번호'), '123456')
    await user.click(screen.getByRole('button', { name: '확인' }))
    await user.click(screen.getByRole('button', { name: '이메일 바꾸기' }))

    expect(screen.getByRole('button', { name: '인증번호 받기' })).toBeEnabled()
  })

  it('인증 전에 이메일을 고치면 번호 칸과 쿨다운이 함께 풀린다', async () => {
    // 제한은 이메일마다 따로 센다. 오타를 고친 사람이 기다릴 이유가 없고, 열린 칸에 옛
    // 번호를 넣으면 새 주소로 확인이 나가 엉뚱한 오류를 본다.
    const user = userEvent.setup()
    setup()

    await user.type(screen.getByLabelText('이메일'), 'jhon@codari.test')
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))
    await user.type(await screen.findByLabelText('인증번호'), '123456')
    expect(screen.getByRole('button', { name: /다시 받기/ })).toBeDisabled()

    // 오타를 고친다.
    await user.type(screen.getByLabelText('이메일'), '{backspace>16/}john@codari.test')

    expect(screen.queryByLabelText('인증번호')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '인증번호 받기' })).toBeEnabled()
  })

  it('확인 요청이 오가는 동안에는 이메일을 고칠 수 없다', async () => {
    // 보낸 주소와 화면의 주소가 갈라지면, A용 증명서를 쥔 채 B가 인증된 것처럼 잠긴다.
    const user = userEvent.setup()
    let release: ((token: string) => void) | undefined
    setup({
      verifyCode: vi.fn(() => new Promise<string>((resolve) => (release = resolve))),
    })

    await user.type(screen.getByLabelText('이메일'), 'a@codari.test')
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))
    await user.type(await screen.findByLabelText('인증번호'), '123456')
    await user.click(screen.getByRole('button', { name: '확인' }))

    await user.type(screen.getByLabelText('이메일'), 'x')
    expect(screen.getByLabelText('이메일')).toHaveValue('a@codari.test')

    release?.('token-1')
    expect(await screen.findByText('인증됐어요')).toBeInTheDocument()
    expect(screen.getByLabelText('이메일')).toHaveValue('a@codari.test')
  })

  it('확인 요청 중에는 발송 버튼이 꺼진다', async () => {
    // 두 요청이 겹치면, 서버가 이전 번호를 무효로 만든 뒤 확인이 도착해 CODE_MISMATCH가
    // 되거나(시도 횟수만 쌓인다), 늦게 온 발송 성공이 비워 둔 칸을 다시 열고 쿨다운을 돈다.
    const user = userEvent.setup()
    let resolveVerify: (token: string) => void = () => {}
    setup({
      verifyCode: vi.fn(() => new Promise<string>((resolve) => (resolveVerify = resolve))),
    })

    await user.type(screen.getByLabelText('이메일'), 'new@codari.test')
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))
    await user.type(await screen.findByLabelText('인증번호'), '123456')
    await user.click(screen.getByRole('button', { name: '확인' }))

    expect(screen.getByRole('button', { name: /다시 받기/ })).toBeDisabled()

    resolveVerify('token-1')
    await screen.findByText('인증됐어요')
  })

  it('번호를 고치면 이전 오류 문구가 사라진다', async () => {
    const user = userEvent.setup()
    setup({
      verifyCode: vi.fn().mockRejectedValue({
        status: 400,
        code: 'CODE_MISMATCH',
        detail: '인증번호가 맞지 않아요',
      }),
    })

    await user.type(screen.getByLabelText('이메일'), 'new@codari.test')
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))
    await user.type(await screen.findByLabelText('인증번호'), '123456')
    await user.click(screen.getByRole('button', { name: '확인' }))
    expect(await screen.findByText('인증번호가 맞지 않아요')).toBeInTheDocument()

    // 칸이 maxLength=6이라 6자리가 차 있으면 글자를 더할 수 없다. 사용자가 실제로 하는
    // 동작은 지우고 다시 넣는 것이다.
    await user.clear(screen.getByLabelText('인증번호'))

    expect(screen.queryByText('인증번호가 맞지 않아요')).not.toBeInTheDocument()
  })

  it('자리 수가 모자랄 때 서버 오류 문구와 겹쳐 보이지 않는다', async () => {
    const user = userEvent.setup()
    setup({
      verifyCode: vi.fn().mockRejectedValue({
        status: 400,
        code: 'CODE_MISMATCH',
        detail: '인증번호가 맞지 않아요',
      }),
    })

    await user.type(screen.getByLabelText('이메일'), 'new@codari.test')
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))
    await user.type(await screen.findByLabelText('인증번호'), '123456')
    await user.click(screen.getByRole('button', { name: '확인' }))
    await screen.findByText('인증번호가 맞지 않아요')

    await user.clear(screen.getByLabelText('인증번호'))
    await user.type(screen.getByLabelText('인증번호'), '12345')
    await user.click(screen.getByRole('button', { name: '확인' }))

    expect(await screen.findByText('인증번호 6자리를 입력해 주세요')).toBeInTheDocument()
    expect(screen.queryByText('인증번호가 맞지 않아요')).not.toBeInTheDocument()
  })

  it('이메일을 고치면 형식 오류 문구가 사라진다', async () => {
    const user = userEvent.setup()
    setup()

    await user.type(screen.getByLabelText('이메일'), 'codari.test')
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))
    expect(await screen.findByText('이메일 형식이 올바르지 않아요')).toBeInTheDocument()

    await user.type(screen.getByLabelText('이메일'), 'a')

    expect(screen.queryByText('이메일 형식이 올바르지 않아요')).not.toBeInTheDocument()
  })

  it('busy면 이메일 단계 전체가 잠긴다', async () => {
    const user = userEvent.setup()
    setup({ busy: true })

    expect(screen.getByLabelText('이메일')).toHaveAttribute('readonly')
    expect(screen.getByRole('button', { name: /인증번호 받기/ })).toBeDisabled()
    await user.type(screen.getByLabelText('이메일'), 'new@codari.test')
    expect(screen.getByLabelText('이메일')).toHaveValue('')
  })

  describe('쿨다운', () => {
    // shouldAdvanceTime이 없으면 react-query의 알림(setTimeout 0)과 findBy의 폴링이 멈춰
    // 테스트가 영원히 기다린다. 실제 시계로 천천히 흘러가므로 직후의 60초 표시는 그대로다.
    beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
    // 테스트가 중간에 실패해도 실제 타이머로 되돌려야 뒤의 테스트가 가짜 타이머를 물려받지 않는다.
    afterEach(() => vi.useRealTimers())

    it('다시 받기가 도는 동안에는 확인이 꺼진다', async () => {
      // 칸이 열린 채 발송이 도는 상황은 쿨다운을 넘긴 뒤 [다시 받기]뿐이다. 그때 [확인]이
      // 열려 있으면, 서버가 이전 번호를 무효로 만든 뒤 확인이 도착해 CODE_MISMATCH가 되고
      // 받아 본 적 없는 새 번호에 시도 횟수만 쌓인다.
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      let calls = 0
      let resolveSend: () => void = () => {}
      setup({
        sendCode: vi.fn(() => {
          calls += 1
          if (calls === 1) return Promise.resolve()
          return new Promise<void>((resolve) => (resolveSend = resolve))
        }),
      })

      await user.type(screen.getByLabelText('이메일'), 'new@codari.test')
      await user.click(screen.getByRole('button', { name: '인증번호 받기' }))
      await screen.findByLabelText('인증번호')

      await act(async () => {
        vi.advanceTimersByTime(60_000)
      })
      await user.click(screen.getByRole('button', { name: '다시 받기' }))

      expect(screen.getByRole('button', { name: '확인' })).toBeDisabled()

      resolveSend()
      await act(async () => {})
      expect(screen.getByRole('button', { name: '확인' })).toBeEnabled()
    })

    it('쿨다운이 끝나도 확인 요청 중이면 다시 받기가 꺼진다', async () => {
      // 쿨다운만 보면 이 단언은 공짜로 통과한다. 60초를 넘긴 뒤에야 "확인 중이라 꺼진다"를
      // 확인할 수 있다. 두 요청이 겹치면 서버가 이전 번호를 무효로 만든 뒤 확인이 도착해
      // CODE_MISMATCH가 되거나, 늦게 온 발송 성공이 비워 둔 칸을 다시 열고 쿨다운을 돈다.
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      let resolveVerify: (token: string) => void = () => {}
      setup({
        verifyCode: vi.fn(() => new Promise<string>((resolve) => (resolveVerify = resolve))),
      })

      await user.type(screen.getByLabelText('이메일'), 'new@codari.test')
      await user.click(screen.getByRole('button', { name: '인증번호 받기' }))
      await screen.findByLabelText('인증번호')

      await act(async () => {
        vi.advanceTimersByTime(60_000)
      })
      expect(screen.getByRole('button', { name: '다시 받기' })).toBeEnabled()

      await user.type(screen.getByLabelText('인증번호'), '123456')
      await user.click(screen.getByRole('button', { name: '확인' }))

      expect(screen.getByRole('button', { name: '다시 받기' })).toBeDisabled()

      resolveVerify('token-1')
      await screen.findByText('인증됐어요')
    })

    it('발송 직후에는 다시 받기가 꺼지고 남은 초가 보인다', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      setup()

      await user.type(screen.getByLabelText('이메일'), 'new@codari.test')
      await user.click(screen.getByRole('button', { name: '인증번호 받기' }))

      const resend = await screen.findByRole('button', { name: /다시 받기/ })
      expect(resend).toBeDisabled()
      // 실제 시계가 흐르므로 느린 환경에서는 59로 보일 수 있다.
      expect(resend.textContent).toMatch(/\((60|5\d)초\)/)
    })
  })
})

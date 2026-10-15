import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
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

    expect(await screen.findByText('이메일 형식이 아닙니다')).toBeInTheDocument()
    expect(sendCode).not.toHaveBeenCalled()
  })

  it('이메일의 앞뒤 공백을 떼고 보낸다', async () => {
    // 서버는 strip해서 받는다. 떼지 않으면 확인에 보내는 값이 달라 CODE_EXPIRED가 난다.
    const user = userEvent.setup()
    const { sendCode } = setup()

    await user.type(screen.getByLabelText('이메일'), '  new@codari.test  ')
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))

    expect(sendCode).toHaveBeenCalledWith('new@codari.test')
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

  it('확인에 성공하면 토큰과 이메일을 올려 준다', async () => {
    const user = userEvent.setup()
    const { onVerified } = setup()

    await user.type(screen.getByLabelText('이메일'), 'new@codari.test')
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }))
    await user.type(await screen.findByLabelText('인증번호'), '123456')
    await user.click(screen.getByRole('button', { name: '확인' }))

    expect(onVerified).toHaveBeenCalledWith('token-1', 'new@codari.test')
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
    expect(onVerified).toHaveBeenLastCalledWith('', '')
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

  it('MAIL_FAILED에서는 인증번호 칸을 열어 둔다', async () => {
    // 계약: 번호는 만들어진 채다. 칸을 닫으면 1분 뒤 다시 받아야만 할 것처럼 보인다.
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
    expect(screen.getByLabelText('인증번호')).toBeInTheDocument()
    // 실패해도 쿨다운은 돈다. 서버는 번호를 만들었으므로 1분 안에 또 보내면 429를 맞는다.
    expect(screen.getByRole('button', { name: /다시 받기/ })).toBeDisabled()
  })

  describe('쿨다운', () => {
    // shouldAdvanceTime이 없으면 react-query의 알림(setTimeout 0)과 findBy의 폴링이 멈춰
    // 테스트가 영원히 기다린다. 실제 시계로 천천히 흘러가므로 직후의 60초 표시는 그대로다.
    beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
    // 테스트가 중간에 실패해도 실제 타이머로 되돌려야 뒤의 테스트가 가짜 타이머를 물려받지 않는다.
    afterEach(() => vi.useRealTimers())

    it('발송 직후에는 다시 받기가 꺼지고 남은 초가 보인다', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      setup()

      await user.type(screen.getByLabelText('이메일'), 'new@codari.test')
      await user.click(screen.getByRole('button', { name: '인증번호 받기' }))

      const resend = await screen.findByRole('button', { name: /다시 받기/ })
      expect(resend).toBeDisabled()
      expect(resend.textContent).toMatch(/60/)
    })
  })
})

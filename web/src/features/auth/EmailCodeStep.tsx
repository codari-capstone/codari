import { useMutation } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CODE_LENGTH, EMAIL_PATTERN, isValidCode } from './accountRules'
import { problemCode, problemMessage } from './problemCode'
import { useResendCooldown } from './useResendCooldown'

/** 재발송 쿨다운. 발송 제한이 같은 이메일 1분 간격이다 (계정 규칙). */
const RESEND_SECONDS = 60

interface EmailCodeStepProps {
  sendCode: (email: string) => Promise<void>
  verifyCode: (input: { email: string; code: string }) => Promise<string>
  /** 인증이 끝나면 토큰과 그때의 이메일을 올린다. 인증이 풀리면 빈 문자열 둘로 알린다. */
  onVerified: (token: string, email: string) => void
  /** 발송 오류 문구 옆에 붙는 동작. 가입의 EMAIL_TAKEN에 [로그인하러 가기]를 붙이는 자리. */
  sendErrorAction?: (code: string | undefined) => ReactNode
}

/**
 * 이메일 → 인증번호 두 단계. 가입(COM-06)과 재설정(COM-08)이 같이 쓴다.
 *
 * 두 화면이 다른 것은 어느 경로로 보내나, 무슨 토큰을 받나, 발송 오류에 무엇을 붙이나
 * 셋뿐이다. 그 셋을 props로 받고, 쿨다운·칸 잠금·오류 표시는 여기 가둔다.
 */
export function EmailCodeStep({
  sendCode,
  verifyCode,
  onVerified,
  sendErrorAction,
}: EmailCodeStepProps) {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [codeOpen, setCodeOpen] = useState(false)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [verified, setVerified] = useState(false)
  const { remaining, start } = useResendCooldown(RESEND_SECONDS)

  const send = useMutation({
    mutationFn: () => sendCode(email.trim()),
    onSuccess: () => {
      setCodeOpen(true)
      start()
    },
    onError: (error) => {
      // 번호는 만들어진 채다(계약). 칸을 열어 두어 방금 온 메일을 쓸 수 있게 한다.
      if (problemCode(error) === 'MAIL_FAILED') setCodeOpen(true)
      start()
    },
  })

  const verify = useMutation({
    mutationFn: () => verifyCode({ email: email.trim(), code }),
    onSuccess: (token) => {
      setVerified(true)
      setCodeError(null)
      onVerified(token, email.trim())
    },
    onError: (error) => {
      const failed = problemCode(error)
      // 번호가 죽은 경우다. 칸을 비우고 다시 받게 한다.
      if (failed === 'CODE_EXPIRED' || failed === 'CODE_ATTEMPTS_EXCEEDED') setCode('')
    },
  })

  function handleSend() {
    const trimmed = email.trim()
    if (!EMAIL_PATTERN.test(trimmed)) {
      setEmailError('이메일 형식이 아닙니다')
      return
    }
    setEmailError(null)
    send.mutate()
  }

  function handleVerify() {
    if (!isValidCode(code)) {
      setCodeError(`인증번호 ${CODE_LENGTH}자리를 입력해 주세요`)
      return
    }
    setCodeError(null)
    verify.mutate()
  }

  function handleChangeEmail() {
    setVerified(false)
    setCodeOpen(false)
    setCode('')
    setCodeError(null)
    // 부모가 들고 있는 증명서를 버리게 한다. 안 버리면 다른 이메일로 받은 증명서로 가입된다.
    onVerified('', '')
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          이메일
        </label>
        <div className="flex gap-2">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            readOnly={verified}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {verified ? (
            <Button type="button" variant="outline" onClick={handleChangeEmail}>
              이메일 바꾸기
            </Button>
          ) : (
            <Button
              type="button"
              className="shrink-0"
              disabled={send.isPending || remaining > 0}
              onClick={handleSend}
            >
              {codeOpen
                ? remaining > 0
                  ? `다시 받기 (${remaining}초)`
                  : '다시 받기'
                : '인증번호 받기'}
            </Button>
          )}
        </div>
        {emailError ? <p className="text-destructive text-sm">{emailError}</p> : null}
        {send.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {problemMessage(send.error)} {sendErrorAction?.(problemCode(send.error))}
          </p>
        ) : null}
      </div>

      {codeOpen ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="code" className="text-sm font-medium">
            인증번호
          </label>
          <div className="flex gap-2">
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={CODE_LENGTH}
              readOnly={verified}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
            {verified ? (
              <p className="self-center text-sm">인증됐어요</p>
            ) : (
              <Button
                type="button"
                className="shrink-0"
                disabled={verify.isPending}
                onClick={handleVerify}
              >
                확인
              </Button>
            )}
          </div>
          {codeError ? <p className="text-destructive text-sm">{codeError}</p> : null}
          {verify.isError ? (
            <p role="alert" className="text-destructive text-sm">
              {problemMessage(verify.error)}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

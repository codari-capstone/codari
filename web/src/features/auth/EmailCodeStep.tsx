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
  const { remaining, start, reset } = useResendCooldown(RESEND_SECONDS)

  // type="email" 입력은 앞뒤 공백을 HTML 값 정리 규칙으로 이미 떼어 준다. 이 trim은
  // 코드로 넣은 값을 위한 안전망이며, 어떤 UI 테스트로도 실패시킬 수 없어 일부러 테스트로
  // 고정하지 않는다. 한 번만 계산해 발송·확인·부모에게 올리는 값이 서로 같게 한다.
  const trimmedEmail = email.trim()

  const send = useMutation({
    mutationFn: () => sendCode(trimmedEmail),
    onSuccess: () => {
      setCodeOpen(true)
      start()
    },
    onError: (error) => {
      const failed = problemCode(error)
      // 서버가 번호를 만들었거나 횟수에 센 경우만 쿨다운을 돈다 (계정 규칙).
      // - MAIL_FAILED: 번호는 만들어진 채다(계약). 칸을 열어 방금 온 메일을 쓰게 하고,
      //   1분 안에 또 보내면 429이므로 쿨다운도 돈다.
      // - TOO_MANY_REQUESTS: 이미 제한에 걸렸다. 언제 풀리는지 모르니 카운트다운과 서버 문구로 보인다.
      // - EMAIL_TAKEN·EMAIL_NOT_FOUND·INVALID_EMAIL: 번호를 보내지 않았다. 가입 여부 조회는
      //   IP 하루 상한에만 세고 이메일당 1분 간격에는 세지 않으므로, 막으면 오타를 고친
      //   사용자가 이유도 모른 채 기다리게 된다.
      if (failed === 'MAIL_FAILED') setCodeOpen(true)
      if (failed === 'MAIL_FAILED' || failed === 'TOO_MANY_REQUESTS') start()
    },
  })

  const verify = useMutation({
    mutationFn: () => verifyCode({ email: trimmedEmail, code }),
    onSuccess: (token) => {
      setVerified(true)
      setCodeError(null)
      // MAIL_FAILED 뒤에도 번호는 만들어져 있어 인증이 이어진다. 인증됐는데 발송 실패 문구가 남으면 모순이다.
      send.reset()
      onVerified(token, trimmedEmail)
    },
    onError: (error) => {
      const failed = problemCode(error)
      // 번호가 죽은 경우다. 칸을 비우고 다시 받게 한다.
      if (failed === 'CODE_EXPIRED' || failed === 'CODE_ATTEMPTS_EXCEEDED') setCode('')
    },
  })

  function handleSend() {
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
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
    send.reset()
    // 제한은 이메일마다 따로 센다. 다른 주소가 이전 주소의 쿨다운을 물려받으면 안 된다.
    reset()
    // 부모가 들고 있는 증명서를 버리게 한다. 안 버리면 다른 이메일로 받은 증명서로 가입된다.
    // 인증을 푸는 곳이 여기뿐인 것은 인증된 동안 이메일 칸이 readOnly이기 때문이다. readOnly를
    // 없애면 편집할 때도 증명서를 버려야 한다. 아니면 바뀐 주소가 이전 주소의 증명서를 쥔다.
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
              {/* 꺼진 버튼에 이유가 없으면 죽은 버튼으로 보인다. 카운트다운이 그 이유다. */}
              {codeOpen ? '다시 받기' : '인증번호 받기'}
              {remaining > 0 ? ` (${remaining}초)` : ''}
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

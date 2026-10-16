import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'

import { ListSkeleton } from '@/components/ListSkeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isValidPassword } from './accountRules'
import { EmailCodeStep } from './EmailCodeStep'
import { problemCode, problemMessage } from './problemCode'
import { resetPassword, sendResetCode, verifyResetCode } from './passwordResetQuery'
import { useAuth } from './useAuth'

/** 재설정 뒤 로그인 화면에 띄우는 안내. 명세에 없어 화면이 정한 문구다 (명세서 9절). */
const RESET_NOTICE = '비밀번호를 바꿨어요. 새 비밀번호로 로그인해 주세요'

/**
 * 비밀번호 재설정 (COM-08).
 *
 * 이메일 → 인증번호 → 새 비밀번호. 성공하면 모든 기기에서 로그아웃되므로(계약) 다시
 * 로그인해야 한다. 그 사실을 아는 길이 위 안내 한 줄이다.
 *
 * 비로그인 화면이라 비울 캐시가 없다. 로그인한 사람은 아래에서 되돌려보낸다.
 */
export function Component() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading } = useAuth()

  const [resetToken, setResetToken] = useState<string | null>(null)
  const [emailStepKey, setEmailStepKey] = useState(0)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')

  const submit = useMutation({
    mutationFn: () => resetPassword({ resetToken: resetToken ?? '', password, passwordConfirm }),
    onSuccess: () => {
      void navigate('/login', { replace: true, state: { notice: RESET_NOTICE } })
    },
    onError: (error) => {
      // 증명서가 죽었거나 이미 쓰였다. 인증번호부터 다시 받아야 한다.
      // 규칙 오류(INVALID_PASSWORD·PASSWORD_MISMATCH)는 서버가 UPDATE 전에 검사하므로
      // 증명서가 살아 있다. 그때는 버리지 않고 비밀번호만 고치게 둔다.
      if (problemCode(error) === 'RESET_EXPIRED') {
        setResetToken(null)
        // EmailCodeStep은 "인증됨" 표시를 스스로 들고 있어 부모가 증명서를 버려도 그대로 남는다.
        // key를 바꿔 새로 마운트하면 이메일 단계가 처음 상태로 돌아간다. 이때 입력해 둔 이메일이
        // 지워지고 재발송 쿨다운도 풀린다. 쿨다운이 풀려도 괜찮은 이유: 이메일당 1분 간격은
        // 서버가 지키고 TOO_MANY_REQUESTS와 그 문구를 EmailCodeStep이 보여 준다. 화면의
        // 카운트다운은 편의일 뿐 통제가 아니다.
        setEmailStepKey((current) => current + 1)
      }
    },
  })

  // 세션을 모르는 동안 폼을 보여 주면, 이미 로그인한 사람이 입력을 시작한 뒤 아래
  // <Navigate>가 실행돼 입력이 사라진 채 이동한다 (LoginPage와 같은 선택).
  if (isLoading) return <ListSkeleton rows={4} />
  if (isAuthenticated) return <Navigate to="/problems" replace />

  const ready = resetToken !== null && isValidPassword(password) && password === passwordConfirm

  return (
    <section className="mx-auto flex w-full max-w-sm flex-col gap-6 py-10">
      <h1 className="text-2xl font-semibold">비밀번호 찾기</h1>

      <EmailCodeStep
        key={emailStepKey}
        sendCode={sendResetCode}
        verifyCode={verifyResetCode}
        // 빈 토큰은 "인증을 되돌렸다"는 신호다(이메일 바꾸기). 들고 있던 증명서를 버린다.
        onVerified={(token) => {
          setResetToken(token || null)
          // 다시 인증했다면 재설정 실패 문구(만료)가 설명하던 상태는 끝났다.
          if (token) submit.reset()
        }}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          새 비밀번호
        </label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <p className="text-muted-foreground text-sm">
          10~20자, 영문 대문자·소문자·숫자·특수문자를 각각 하나 이상
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="passwordConfirm" className="text-sm font-medium">
          새 비밀번호 확인
        </label>
        <Input
          id="passwordConfirm"
          type="password"
          autoComplete="new-password"
          value={passwordConfirm}
          onChange={(event) => setPasswordConfirm(event.target.value)}
        />
        {passwordConfirm.length > 0 && password !== passwordConfirm ? (
          <p className="text-destructive text-sm">비밀번호가 일치하지 않아요</p>
        ) : null}
      </div>

      {submit.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {problemMessage(submit.error)}
        </p>
      ) : null}

      {/* isPending 동안 끈다. 두 번 누르면 두 번째는 RESET_EXPIRED를 받아, 바뀐 사람에게 실패 문구가 뜬다. */}
      <Button
        type="button"
        size="lg"
        className="min-h-11"
        disabled={!ready || submit.isPending}
        onClick={() => submit.mutate()}
      >
        {submit.isPending ? '바꾸는 중…' : '재설정'}
      </Button>
    </section>
  )
}

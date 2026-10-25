import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'

import { ListSkeleton } from '@/components/ListSkeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isValidPassword } from './accountRules'
import { EmailCodeStep } from './EmailCodeStep'
import { NicknameField } from './NicknameField'
import { problemCode, problemMessage } from './problemCode'
import { sendSignupCode, signUp, verifySignupCode } from './signupQuery'
import { useAuth } from './useAuth'
import { useNicknameCheck } from './useNicknameCheck'

/** 가입 뒤 로그인 화면에 띄우는 안내. 명세 COM-06이 이 문구로 정했다 (#113). */
const SIGNUP_NOTICE = '가입이 완료됐어요. 로그인해 주세요'

/**
 * 이메일 회원가입 (COM-06).
 *
 * 한 화면에서 이메일 인증 → 닉네임 중복 확인 → 비밀번호를 마쳐야 [가입 완료]가 켜진다.
 * 인증하거나 확인한 값을 바꾸면 그 확인이 풀린다(명세).
 *
 * 비밀번호 규칙을 여기서 검사한다. 로그인(COM-07)은 반대로 검사하지 않는데, 그쪽은 규칙이
 * 강화되기 전에 만든 계정이 잠기기 때문이다. 가입은 그 위험이 없다 — 규칙을 어긴 값으로는
 * 계정이 만들어지지 않으므로, 보내기 전에 알려 주는 쪽이 친절하다.
 */
export function Component() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading } = useAuth()

  const location = useLocation()
  // RequireAuth가 로그인 화면으로 보낼 때 실어 준 원래 목적지. 가입을 마치고 로그인 화면으로
  // 넘길 때 그대로 다시 실어, 로그인하면 여기로 들어오려던 화면으로 간다. 값은 믿지 않는다 —
  // 로그인 화면이 safeRedirect로 검사한다.
  const from = (location.state as { from?: unknown } | null)?.from

  const [verificationToken, setVerificationToken] = useState<string | null>(null)
  const [emailStepKey, setEmailStepKey] = useState(0)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  // 닉네임 입력칸. 선점됐을 때 거기로 포커스를 옮긴다 (useNicknameCheck.release).
  const nicknameInput = useRef<HTMLInputElement>(null)

  const submit = useMutation({
    mutationFn: () =>
      signUp({
        verificationToken: verificationToken ?? '',
        nickname: nickname.value,
        password,
        passwordConfirm,
      }),
    onSuccess: () => {
      // 계약이 가입 응답에 토큰을 주지 않는다. 로그인은 사용자가 직접 한다.
      void navigate('/login', { replace: true, state: { notice: SIGNUP_NOTICE, from } })
    },
    onError: (error) => {
      const failed = problemCode(error)
      // 그 사이 누가 그 닉네임을 가져갔다. 명세가 "닉네임만 다시 입력"으로 정했다.
      if (failed === 'NICKNAME_TAKEN') nickname.release()
      // 증명서가 죽었거나 그 사이 같은 이메일로 가입됐다. 이메일부터 다시 인증해야 한다.
      // 나머지 입력값 오류는 계약이 "`EMAIL_TAKEN`을 뺀 입력값 오류는 verificationToken을
      // 쓰지 않으므로 인증 후 30분 안에는 값만 고쳐 같은 verificationToken으로 다시 보낼 수
      // 있다"고 적는다. 그때는 버리지 않는다.
      if (failed === 'VERIFICATION_EXPIRED' || failed === 'EMAIL_TAKEN') {
        setVerificationToken(null)
        // EmailCodeStep은 "인증됨" 표시를 스스로 들고 있어 부모가 증명서를 버려도 그대로 남는다.
        // key를 바꿔 새로 마운트하면 이메일 단계가 처음 상태로 돌아간다. 이때 입력해 둔 이메일이
        // 지워지고 재발송 쿨다운도 풀린다. 쿨다운이 풀려도 괜찮은 이유: 이메일당 1분 간격은
        // 서버가 지키고 TOO_MANY_REQUESTS와 그 문구를 EmailCodeStep이 보여 준다. 화면의
        // 카운트다운은 편의일 뿐 통제가 아니다.
        setEmailStepKey((current) => current + 1)
      }
    },
  })

  // submit 뒤에 선언한다 — 확인이 끝나면 이 변이의 실패 문구를 지운다.
  //
  // 가입 실패 문구(닉네임 선점)는 방금 다시 확인한 값에 대한 것이 아니다. 다만 가입 요청이
  // 오가는 중이면 지우지 않는다 — reset()은 문구만이 아니라 '진행 중'까지 지워 [가입 완료]를
  // 다시 켠다. 그 상태로 한 번 더 누르면 두 번째 POST가 나가고, 첫 요청으로 이미 가입된
  // 사람이 두 번째 응답의 409를 실패 문구로 본다.
  const nickname = useNicknameCheck(nicknameInput, () => {
    if (!submit.isPending) submit.reset()
  })

  // 세션을 모르는 동안 폼을 보여 주면, 이미 로그인한 사람이 입력을 시작한 뒤 아래
  // <Navigate>가 실행돼 입력이 사라진 채 이동한다 (LoginPage와 같은 선택).
  if (isLoading) return <ListSkeleton rows={4} />
  if (isAuthenticated) return <Navigate to="/problems" replace />

  const passwordOk = isValidPassword(password) && password === passwordConfirm
  const ready = verificationToken !== null && nickname.ok && passwordOk

  return (
    <section className="mx-auto flex w-full max-w-sm flex-col gap-6 py-10">
      <h1 className="text-2xl font-semibold">회원가입</h1>

      <EmailCodeStep
        key={emailStepKey}
        sendCode={sendSignupCode}
        verifyCode={verifySignupCode}
        // 빈 토큰은 "인증을 되돌렸다"는 신호다(이메일 바꾸기). 들고 있던 증명서를 버린다.
        // 이메일은 받지 않는다 — 계약의 가입 본문에 email이 없다(증명서가 그 주소를 담는다).
        busy={submit.isPending}
        onVerified={(token) => {
          setVerificationToken(token || null)
          // 다시 인증했다면 가입 실패 문구(만료·이미 가입)가 설명하던 상태는 끝났다.
          // 다만 가입 요청이 오가는 중이면 지우지 않는다 — reset()은 문구만이 아니라
          // '진행 중'까지 지워 [가입 완료]를 다시 켠다. 그 상태로 한 번 더 누르면 두 번째
          // POST가 나가고, 첫 요청으로 이미 가입된 사람이 두 번째 응답의 409를 본다.
          // busy로 이 단계를 잠그는 것과 두 겹이다 (useNicknameCheck의 가드와 같은 이유).
          if (token && !submit.isPending) submit.reset()
        }}
        sendErrorAction={(code) =>
          code === 'EMAIL_TAKEN' ? (
            // 가입 성공 뒤 이동과 같이 원래 가려던 화면을 싣는다. 안 실으면 /problems/42에서
            // 넘어온 사람이 로그인에 성공해도 문제 목록으로 간다 (값 검사는 로그인 화면이 한다).
            <Link to="/login" state={{ from }} className="text-primary underline">
              로그인하러 가기
            </Link>
          ) : null
        }
      />

      <NicknameField check={nickname} inputRef={nicknameInput} busy={submit.isPending} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          비밀번호
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
          비밀번호 확인
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
          {problemCode(submit.error) === 'EMAIL_TAKEN' ? (
            <>
              {' '}
              <Link to="/login" state={{ from }} className="text-primary underline">
                로그인하러 가기
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      {/* isPending 동안 끈다. 두 번 누르면 두 번째는 409 EMAIL_TAKEN을 받아, 가입된 사람에게 실패 문구가 뜬다. */}
      <Button
        type="button"
        size="lg"
        className="min-h-11"
        disabled={!ready || submit.isPending}
        onClick={() => submit.mutate()}
      >
        {submit.isPending ? '가입 중…' : '가입 완료'}
      </Button>
    </section>
  )
}

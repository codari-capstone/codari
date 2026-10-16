import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'

import { ListSkeleton } from '@/components/ListSkeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isValidNickname, isValidPassword } from './accountRules'
import { EmailCodeStep } from './EmailCodeStep'
import { problemCode, problemMessage } from './problemCode'
import { checkNickname, sendSignupCode, signUp, verifySignupCode } from './signupQuery'
import { useAuth } from './useAuth'

/** 가입 뒤 로그인 화면에 띄우는 안내. 명세에 없어 화면이 정한 문구다 (명세서 9절). */
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

  const [verification, setVerification] = useState<{ token: string; email: string } | null>(null)
  const [emailStepKey, setEmailStepKey] = useState(0)
  const [nickname, setNickname] = useState('')
  const [nicknameOk, setNicknameOk] = useState<string | null>(null)
  const [nicknameTaken, setNicknameTaken] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')

  // 응답이 올 때 입력칸에 있는 값. 렌더에 갇힌 nickname은 요청을 보낸 시점의 값이다.
  const nicknameRef = useRef(nickname)
  // 입력칸 요소. 위의 값 ref와 다르다. 가입 때 선점되면 여기로 포커스를 옮긴다.
  const nicknameInputRef = useRef<HTMLInputElement>(null)

  const nicknameCheck = useMutation({
    mutationFn: (value: string) => checkNickname(value),
    onSuccess: (available, checked) => {
      // 확인하는 사이 칸을 고쳤다면 그 응답은 지금 값에 대한 것이 아니다.
      if (checked !== nicknameRef.current) return
      setNicknameOk(available ? checked : null)
      setNicknameTaken(!available)
      // 가입 실패 문구(닉네임 선점)는 방금 다시 확인한 값에 대한 것이 아니다.
      submit.reset()
    },
  })

  const submit = useMutation({
    mutationFn: () =>
      signUp({
        verificationToken: verification?.token ?? '',
        nickname,
        password,
        passwordConfirm,
      }),
    onSuccess: () => {
      // 계약이 가입 응답에 토큰을 주지 않는다. 로그인은 사용자가 직접 한다.
      void navigate('/login', { replace: true, state: { notice: SIGNUP_NOTICE } })
    },
    onError: (error) => {
      const failed = problemCode(error)
      // 그 사이 누가 그 닉네임을 가져갔다. 명세가 "닉네임만 다시 입력"으로 정했다.
      if (failed === 'NICKNAME_TAKEN') {
        setNicknameOk(null)
        nicknameInputRef.current?.focus()
      }
      // 증명서가 죽었거나 그 사이 같은 이메일로 가입됐다. 이메일부터 다시 인증해야 한다.
      if (failed === 'VERIFICATION_EXPIRED' || failed === 'EMAIL_TAKEN') {
        setVerification(null)
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

  const passwordOk = isValidPassword(password) && password === passwordConfirm
  const ready = verification !== null && nicknameOk === nickname && passwordOk

  return (
    <section className="mx-auto flex w-full max-w-sm flex-col gap-6 py-10">
      <h1 className="text-2xl font-semibold">회원가입</h1>

      <EmailCodeStep
        key={emailStepKey}
        sendCode={sendSignupCode}
        verifyCode={verifySignupCode}
        // 빈 토큰은 "인증을 되돌렸다"는 신호다(이메일 바꾸기). 들고 있던 증명서를 버린다.
        onVerified={(token, email) => {
          setVerification(token ? { token, email } : null)
          // 다시 인증했다면 가입 실패 문구(만료·이미 가입)가 설명하던 상태는 끝났다.
          if (token) submit.reset()
        }}
        sendErrorAction={(code) =>
          code === 'EMAIL_TAKEN' ? (
            <Link to="/login" className="text-primary underline">
              로그인하러 가기
            </Link>
          ) : null
        }
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="nickname" className="text-sm font-medium">
          닉네임
        </label>
        <div className="flex gap-2">
          <Input
            id="nickname"
            ref={nicknameInputRef}
            value={nickname}
            onChange={(event) => {
              setNickname(event.target.value)
              nicknameRef.current = event.target.value
              nicknameCheck.reset()
              // 확인한 값과 달라지면 nicknameOk === nickname이 깨져 자동으로 풀린다.
              // 안내 문구만 직접 지운다.
              setNicknameTaken(false)
            }}
          />
          <Button
            type="button"
            className="shrink-0"
            disabled={!isValidNickname(nickname) || nicknameCheck.isPending}
            onClick={() => nicknameCheck.mutate(nickname)}
          >
            중복 확인
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">2~16자, 한글·영문·숫자</p>
        {nicknameOk === nickname ? <p className="text-sm">쓸 수 있어요</p> : null}
        {nicknameTaken ? (
          <p role="alert" className="text-destructive text-sm">
            이미 사용 중인 닉네임이에요
          </p>
        ) : null}
        {nicknameCheck.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {problemMessage(nicknameCheck.error)}
          </p>
        ) : null}
      </div>

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
              <Link to="/login" className="text-primary underline">
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

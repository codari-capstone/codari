import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { ListSkeleton } from '@/components/ListSkeleton'
import { Button } from '@/components/ui/button'
import { gitHubSignUp, resumeGitHubSession, takeGitHubReturnPath } from './githubQuery'
import { NicknameField } from './NicknameField'
import { problemCode, problemMessage } from './problemCode'
import { safeRedirect } from './safeRedirect'
import { adoptSession } from './session'
import { SIGNUP_NOTICE } from './SignupPage'
import { useNicknameCheck } from './useNicknameCheck'

/**
 * 시작 단계가 실패했을 때의 문구.
 *
 * 계약은 콜백 실패를 이유 없이 `result=error` 하나로 묶는다 — 취소·state 불일치·GitHub
 * 응답 오류·서버 오류가 다 여기다. 그래서 화면도 이유를 말하지 않고 다시 해 보라고만 한다.
 */
const GITHUB_FAILED = 'GitHub 로그인에 실패했어요. 다시 시도해 주세요'

/**
 * GitHub 로그인이 돌아오는 자리 (COM-02).
 *
 * 계약이 정한 주소가 `/login/github?result=...` 하나라서 세 갈래를 한 화면에서 가른다.
 * - `success`: 쿠키만 심겨 왔다. 갱신으로 토큰을 받아 세션을 들이고 원래 보던 화면으로
 * - `signup`: 처음이다. 닉네임만 받아 가입하고 로그인 화면으로(가입은 로그인시키지 않는다)
 * - 그 밖: 전부 실패다. 계약이 `error`로 묶어 보내고, 주소를 직접 친 경우도 여기로 온다
 */
export function Component() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const result = params.get('result')

  // 닉네임 입력칸. 선점됐을 때 거기로 포커스를 옮긴다 (useNicknameCheck.release).
  const nicknameInput = useRef<HTMLInputElement>(null)

  // 딱 한 번 읽는다 — takeGitHubReturnPath가 읽으면서 지운다. 지우지 않으면 다음 로그인이
  // 옛 주소로 끌려간다. 값은 믿지 않는다(safeRedirect) — sessionStorage는 사용자가 고칠 수 있다.
  const [from] = useState(() => safeRedirect(takeGitHubReturnPath()))

  const toLogin = useCallback(
    (error?: unknown) => {
      const message = error === undefined ? GITHUB_FAILED : problemMessage(error)
      // 원래 가려던 화면을 그대로 싣는다. 안 실으면 /problems/42에서 시작한 사람이 로그인에
      // 성공해도 문제 목록으로 간다 (값 검사는 로그인 화면이 다시 한다).
      void navigate('/login', { replace: true, state: { error: message, from } })
    },
    [navigate, from],
  )

  const resume = useMutation({
    mutationFn: resumeGitHubSession,
    onSuccess: async (user) => {
      await adoptSession(queryClient, user)
      void navigate(from, { replace: true })
    },
    // 성공이라고 돌아왔는데 세션이 없다. 이유를 말할 수 없으니 일반 문구다.
    onError: () => toLogin(),
  })

  const signUp = useMutation({
    mutationFn: () => gitHubSignUp(nickname.value),
    onSuccess: () => {
      // 계약이 가입 응답에 토큰을 주지 않는다. 사용자는 GitHub 로그인을 다시 누른다.
      void navigate('/login', { replace: true, state: { notice: SIGNUP_NOTICE, from } })
    },
    onError: (error) => {
      const failed = problemCode(error)
      // 그 사이 누가 그 닉네임을 가져갔다. 명세가 "닉네임만 다시 입력"으로 정했다.
      if (failed === 'NICKNAME_TAKEN') nickname.release()
      // 증명서가 죽었거나(30분) 그 사이 같은 GitHub 계정으로 가입됐다. 둘 다 닉네임을 고쳐도
      // 풀리지 않고 GitHub 로그인부터 다시 해야 한다 — 서버 문구도 그렇게 적혀 있어 그대로 싣는다.
      if (failed === 'VERIFICATION_EXPIRED' || failed === 'ALREADY_REGISTERED') toLogin(error)
    },
  })

  // signUp 뒤에 선언한다 — 확인이 끝나면 이 변이의 실패 문구를 지운다. 가입 요청이 오가는
  // 중이면 지우지 않는다(reset()이 '진행 중'까지 지워 버튼을 다시 켠다). SignupPage와 같다.
  const nickname = useNicknameCheck(nicknameInput, () => {
    if (!signUp.isPending) signUp.reset()
  })

  // 한 번만 한다. StrictMode는 효과를 두 번 돌리고, 그러면 갱신 요청이 두 번 나간다.
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    if (result === 'success') resume.mutate()
    else if (result !== 'signup') toLogin()
  }, [result, resume, toLogin])

  if (result !== 'signup') {
    // 이동하는 동안의 한 화면이다. 비워 두면 흰 화면이 번쩍인다.
    return (
      <section className="mx-auto flex w-full max-w-sm flex-col gap-6 py-10">
        <p role="status" className="text-sm">
          GitHub 계정을 확인하고 있어요…
        </p>
        <ListSkeleton rows={2} />
      </section>
    )
  }

  return (
    <section className="mx-auto flex w-full max-w-sm flex-col gap-6 py-10">
      <h1 className="text-2xl font-semibold">닉네임 정하기</h1>
      <p className="text-muted-foreground text-sm">
        GitHub 계정으로 처음 오셨어요. 쓸 닉네임만 정하면 가입이 끝나요.
      </p>

      <NicknameField check={nickname} inputRef={nicknameInput} busy={signUp.isPending} />

      {signUp.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {problemMessage(signUp.error)}
        </p>
      ) : null}

      {/* isPending 동안 끈다. 두 번 누르면 두 번째는 409 ALREADY_REGISTERED를 받아, 가입된 사람에게 실패 문구가 뜬다. */}
      <Button
        type="button"
        size="lg"
        className="min-h-11"
        disabled={!nickname.ok || signUp.isPending}
        onClick={() => signUp.mutate()}
      >
        {signUp.isPending ? '가입 중…' : '가입 완료'}
      </Button>
    </section>
  )
}

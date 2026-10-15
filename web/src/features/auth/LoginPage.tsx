import { useMutation, useQueryClient } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { loginRequest, ME_QUERY_KEY } from './authQuery'
import { loginErrorMessage, loginSchema, type LoginForm } from './loginSchema'
import { safeRedirect } from './safeRedirect'
import { useAuth } from './useAuth'

/** 이메일 로그인 (COM-07). */
export function Component() {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isAuthenticated } = useAuth()

  const target = safeRedirect((location.state as { from?: unknown } | null)?.from)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  const login = useMutation({
    mutationFn: loginRequest,
    onSuccess: (user) => {
      // 무효화만 하면 /api/me 왕복을 한 번 더 기다리며 헤더가 비로그인으로 한 번 더 그려진다.
      queryClient.setQueryData(ME_QUERY_KEY, user)
      // 아래의 <Navigate> 분기도 setQueryData로 isAuthenticated가 바뀌면 같은 곳으로 보내므로
      // 이 호출이 없어도 도착한다. 그래도 두는 이유는 재렌더에 기대지 않고 바로 이동하기 위해서다.
      // replace를 빼면 /login이 기록에 남는다. LoginPage.test.tsx가 PUSH 여부로 이를 지킨다.
      void navigate(target, { replace: true })
    },
  })

  // 이미 로그인했으면 폼을 보여 주지 않는다. 로그인한 사람이 주소로 직접 들어오거나
  // 이 화면이 열려 있는 동안 세션이 생긴 경우다.
  if (isAuthenticated) return <Navigate to={target} replace />

  return (
    <section className="mx-auto flex w-full max-w-sm flex-col gap-6 py-10">
      <h1 className="text-2xl font-semibold">로그인</h1>

      {/*
        form의 onSubmit에 건다. 제출 버튼의 onClick에 걸어도 Enter는 브라우저가 기본 버튼을
        눌러 주므로 동작하지만, onSubmit은 버튼 클릭을 거치지 않는 제출까지 모두 잡고
        한 컨트롤이 아니라 폼 자신의 이벤트다.
        aria-label이 있어야 테스트와 스크린 리더가 이 폼을 이름으로 집을 수 있다.
      */}
      <form
        aria-label="로그인"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((values) => login.mutate(values))}
      >
        {/*
          네이티브 label을 쓴다. ProblemFilters의 체크박스와 같은 선택이다 — Radix 래퍼
          없이도 htmlFor로 입력칸과 이어지고, @/components/ui에 label이 없어 shadcn
          컴포넌트를 새로 들이지 않아도 된다.
          autoComplete은 브라우저와 비밀번호 관리자에게 각 칸이 무엇인지 알려 준다.
        */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            이메일
          </label>
          <Input id="email" type="email" autoComplete="email" {...register('email')} />
          {errors.email ? <p className="text-destructive text-sm">{errors.email.message}</p> : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            비밀번호
          </label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register('password')}
          />
          {errors.password ? (
            <p className="text-destructive text-sm">{errors.password.message}</p>
          ) : null}
        </div>

        {/*
          role="alert"이어야 제출 후 문구가 생길 때 스크린 리더가 읽는다.
          COM-07은 실패 이유를 구분해 주지 않으므로 칸별 오류가 아니라 폼 단위 한 줄이다.
        */}
        {login.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {loginErrorMessage(login.error)}
          </p>
        ) : null}

        {/* isPending 동안 비활성화한다. 두 번 누르면 같은 시도가 두 번 전송되어, 실패하면 서버의 시도 제한이 두 번 소모된다. */}
        <Button type="submit" size="lg" className="min-h-11" disabled={login.isPending}>
          {login.isPending ? '로그인 중…' : '로그인'}
        </Button>
      </form>
    </section>
  )
}

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router'

import type { SubmissionResult } from '@/api/types'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Button } from '@/components/ui/button'
import { STATUS_LABEL, VERDICT_LABEL } from '@/constants/verdicts'
import { LANGUAGE_LABEL } from '@/features/solve/labels'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { parsePathId } from '@/lib/pathId'
import { nextActions } from './nextActions'
import { isTransient, submissionResultQuery } from './resultQuery'

/**
 * 지금 무슨 일이 일어나고 있는지 한 줄 (RES-01·02).
 *
 * **진행 문구와 판정이 같은 live region을 쓴다.** 처음에는 진행만 `role="status"`로 두고
 * 판정은 일반 문단에 그렸더니, 끝나는 순간 live region이 통째로 사라져 **가장 중요한
 * 마지막 변화인 판정이 안내되지 않았다.** 화면을 보지 않는 사용자는 '채점 중 60%'까지
 * 듣고는 결과를 직접 찾아다녀야 했다.
 *
 * 판정이 났을 때 글씨가 커지는 것은 같은 자리의 모양만 바뀌는 것이다.
 */
function Headline({ result }: { result: SubmissionResult }) {
  const { status, progress, verdict } = result

  if (verdict !== null) {
    return (
      <p role="status" className="text-xl font-semibold">
        {VERDICT_LABEL[verdict]}
      </p>
    )
  }

  const label = STATUS_LABEL[status]
  return (
    <p role="status" className="text-muted-foreground text-sm">
      {/* 진행률은 채점 중일 때만 뜻이 있다. 다른 상태의 0%는 "아직 시작도 안 했다"로 읽혀 오해를 준다 */}
      {status === 'RUNNING' ? `${label} ${progress}%` : label}
    </p>
  )
}

/** 제출 번호·언어·시간·메모리 (RES-02). */
function Meta({ result }: { result: SubmissionResult }) {
  const { verdict, language, executionTimeMs, memoryUsedKb } = result
  if (verdict === null) return null

  return (
    <div className="flex flex-col gap-1">
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span>제출 #{result.id}</span>
        <span>{LANGUAGE_LABEL[language]}</span>
        {/*
          컴파일 에러와 채점 불가는 실행 자체를 못 해 둘 다 null이다(계약). 없는 값을
          '0ms'로 적으면 "아주 빨랐다"로 읽히므로 줄을 아예 뺀다.
        */}
        {executionTimeMs !== null ? <span>{executionTimeMs}ms</span> : null}
        {memoryUsedKb !== null ? <span>{memoryUsedKb.toLocaleString('ko-KR')}KB</span> : null}
      </div>
    </div>
  )
}

/** 다음 행동 (RES-07). */
function NextActions({ result }: { result: SubmissionResult }) {
  const actions = nextActions(result)
  if (actions.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) =>
        action.to ? (
          <Button key={action.label} asChild className="min-h-11">
            <Link to={action.to}>{action.label}</Link>
          </Button>
        ) : (
          // 못 누르는 이유를 글자로 적는다. 비활성 버튼만 두면 왜 안 되는지 알 길이 없고,
          // 스크린 리더도 "흐리다"는 것까지만 읽는다.
          <Button key={action.label} variant="outline" className="min-h-11" disabled>
            {`${action.label} (준비 중)`}
          </Button>
        ),
      )}
    </div>
  )
}

/** 제출 결과 (RES-01·02·07). 설명과 에러 원문은 #32가 더한다. */
export function Component() {
  const params = useParams()
  const submissionId = parsePathId(params.id)
  const { data, isPending, error, refetch } = useQuery({
    ...submissionResultQuery(submissionId ?? 0),
    enabled: submissionId !== null,
  })

  /**
   * 세션이 끊겼으면 로그인 화면으로 보낸다 (session.ts).
   *
   * 폴링 중에 만료되는 일이 실제로 생긴다 — 오래 걸리는 채점을 띄워 둔 채 자리를 비우는
   * 경우다. 문구만 띄우면 사용자는 주소를 직접 쳐야 한다. 제출(useSubmit)이 하는 것과
   * 같은 처리이고, mutation이 아니라 query라 effect로 건다.
   */
  const queryClient = useQueryClient()
  useEffect(() => {
    forgetSessionIfUnauthorized(queryClient, error)
  }, [queryClient, error])

  // 주소를 손으로 고친 경우다. 요청을 보내지 않고 없는 제출과 같은 문구로 끝낸다
  // (parsePathId 주석).
  if (submissionId === null) return <ErrorState problem={{ status: 404 }} headingLevel={1} />
  /**
   * 오류 화면은 **다시 물어도 같은 답일 때만** 띄운다.
   *
   * 처음에는 `error`를 `data`보다 먼저 봤더니 '채점 중 60%'를 보던 중 폴링이 한 번만
   * 실패해도 진행 상태가 통째로 사라졌다. 그래서 "데이터가 있으면 숨긴다"로 바꿨는데,
   * 이번에는 세션이 만료돼 401이 계속 와도 멈춘 진행률만 보여 주게 됐다.
   *
   * 가르는 것은 데이터 유무가 아니라 **오류의 성격**이다(resultQuery의 `isTransient`).
   * 5xx나 네트워크 끊김이면 받아 둔 상태를 그대로 두고 폴링도 이어 간다. 401·403·404는
   * 다시 물어도 같은 답이라 화면을 오류로 바꾼다 — 받아 둔 것이 남의 결과일 수도 있다.
   */
  if (error && !isTransient(error)) {
    return <ErrorState problem={error} headingLevel={1} onRetry={() => void refetch()} />
  }
  if (isPending || !data) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">제출 결과</h1>
        <ListSkeleton rows={3} />
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">제출 결과</h1>

      {/* 다시 풀기와 같은 곳으로 가야 한다. 언어가 빠지면 여기로 들어온 사람만 첫
          언어(PYTHON) 자리를 보게 된다 (nextActions 주석). */}
      <Link
        to={`/problems/${data.problemId}?language=${data.language}`}
        className="text-primary text-sm underline"
      >
        {data.problemTitle}
      </Link>

      <Headline result={data} />
      <Meta result={data} />
      <NextActions result={data} />
    </section>
  )
}

import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'

import type { SubmissionResult } from '@/api/types'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Button } from '@/components/ui/button'
import { STATUS_LABEL, VERDICT_LABEL } from '@/constants/verdicts'
import { LANGUAGE_LABEL } from '@/features/solve/labels'
import { nextActions } from './nextActions'
import { parseSubmissionId, submissionResultQuery } from './resultQuery'

/**
 * 채점이 끝나기 전 상태 (RES-01).
 *
 * `role="status"`여야 폴링으로 문구가 바뀔 때 스크린 리더가 읽어 준다. 화면을 보지 않는
 * 사용자에게는 이것이 유일한 진행 신호다.
 */
function Progress({ result }: { result: SubmissionResult }) {
  const { status, progress } = result
  if (status === 'COMPLETED') return null

  const label = STATUS_LABEL[status]
  return (
    <p role="status" className="text-muted-foreground text-sm">
      {/* 진행률은 채점 중일 때만 뜻이 있다. 다른 상태의 0%는 "아직 시작도 안 했다"로 읽혀 오해를 준다 */}
      {status === 'RUNNING' ? `${label} ${progress}%` : label}
    </p>
  )
}

/** 판정과 제출 정보 (RES-02). */
function Verdict({ result }: { result: SubmissionResult }) {
  const { verdict, language, executionTimeMs, memoryUsedKb } = result
  if (verdict === null) return null

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xl font-semibold">{VERDICT_LABEL[verdict]}</p>
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
  const submissionId = parseSubmissionId(params.id)
  const { data, isPending, error, refetch } = useQuery({
    ...submissionResultQuery(submissionId ?? 0),
    enabled: submissionId !== null,
  })

  // 주소를 손으로 고친 경우다. 요청을 보내지 않고 없는 제출과 같은 문구로 끝낸다
  // (parseSubmissionId 주석).
  if (submissionId === null) return <ErrorState problem={{ status: 404 }} headingLevel={1} />
  if (error) {
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

      <Link to={`/problems/${data.problemId}`} className="text-primary text-sm underline">
        {data.problemTitle}
      </Link>

      <Progress result={data} />
      <Verdict result={data} />
      <NextActions result={data} />
    </section>
  )
}

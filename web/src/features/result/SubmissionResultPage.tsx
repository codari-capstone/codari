import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router'

import type { SubmissionResult } from '@/api/types'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Button } from '@/components/ui/button'
import { RUNTIME_ERROR_INFO, STATUS_LABEL, VERDICT_INFO } from '@/constants/verdicts'
import { LANGUAGE_LABEL } from '@/features/solve/labels'
import { solvePath } from '@/features/solve/solvePath'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { parsePathId } from '@/lib/pathId'
import { nextActions } from './nextActions'
import { isDeadEnd, submissionResultQuery } from './resultQuery'

/**
 * 지금 무슨 일이 일어나고 있는지 한 줄 (RES-01·02·05).
 *
 * **진행 문구와 판정이 같은 live region을 쓴다.** 처음에는 진행만 `role="status"`로 두고
 * 판정은 일반 문단에 그렸더니, 끝나는 순간 live region이 통째로 사라져 **가장 중요한
 * 마지막 변화인 판정이 안내되지 않았다.** 화면을 보지 않는 사용자는 '채점 중 60%'까지
 * 듣고는 결과를 직접 찾아다녀야 했다.
 *
 * 그래서 **래퍼의 종류도 분기마다 바꾸지 않는다.** 컴파일 에러일 때만 `div`를 쓰고 그
 * 밖에는 `p`를 썼더니, 상태가 COMPILING에서 COMPILE_ERROR로 넘어갈 때 React가 live
 * region 노드를 지우고 새로 붙였다 — 내용을 이미 담은 채 새로 붙은 live region은 스크린
 * 리더가 읽지 않는 경우가 많아, 같은 문제가 컴파일 에러에서만 되살아났다. 늘 같은
 * `div`를 두고 그 안의 내용만 바꾼다.
 */
function Headline({ result }: { result: SubmissionResult }) {
  const { status, progress, verdict, compilerMessage } = result
  // 채점 불가는 판정이 아니라 상태다(계약). 화면에서는 같은 자리에 나온다.
  const key = status === 'JUDGE_ERROR' ? 'JUDGE_ERROR' : verdict

  /*
    컴파일 에러는 판정 자체가 펼치는 자리다 — 설명이 "결과를 누르면 … 메시지를 볼 수
    있어요"라고 약속하기 때문이다(AI_FEATURES 10절). 접히는 것은 메시지뿐이고, 설명과
    제출 정보는 아래에 늘 보인다.

    판정도 함께 본다. 계약은 `compilerMessage`를 "COMPILE_ERROR일 때" 있다고만 적고
    `runtimeErrorType`처럼 "일 때만"이라고 하지 않아서, 메시지만 보고 가르면 서버가
    다른 판정에 컴파일 경고를 실어 보낼 때 '맞았습니다!!'가 접히는 토글이 된다.

    live region 안에 두므로 펼칠 때 메시지가 함께 안내될 수 있다. 사용자가 직접 연
    것이라 그대로 둔다 — 판정이 안내되지 않는 쪽이 훨씬 나쁘다.
  */
  const foldable = verdict === 'COMPILE_ERROR' && compilerMessage !== null

  return (
    <div role="status">
      {key === null ? (
        <p className="text-muted-foreground text-sm">
          {/* 진행률은 채점 중일 때만 뜻이 있다. 다른 상태의 0%는 "아직 시작도 안 했다"로 읽혀 오해를 준다 */}
          {status === 'RUNNING' ? `${STATUS_LABEL[status]} ${progress}%` : STATUS_LABEL[status]}
        </p>
      ) : foldable ? (
        <details>
          {/*
            flex를 걸지 않는다. summary의 기본 display가 list-item이라 브라우저가 ▶ 표식을
            그려 주는데, flex로 바꾸면 그 표식이 사라져 펼칠 수 있다는 단서가 마우스를
            올렸을 때의 커서뿐이 된다.
          */}
          <summary className="min-h-11 cursor-pointer py-2 text-xl font-semibold">
            {VERDICT_INFO[key].label}
          </summary>
          <Raw text={compilerMessage ?? ''} />
        </details>
      ) : (
        <p className="text-xl font-semibold">{VERDICT_INFO[key].label}</p>
      )}
    </div>
  )
}

/** 제출 번호·언어·시간·메모리. */
function Meta({ result }: { result: SubmissionResult }) {
  const { language, executionTimeMs, memoryUsedKb } = result
  return (
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
  )
}

/**
 * 학생 코드가 만든 원문 (RES-04·05).
 *
 * **글자 그대로 그린다.** 계약이 `runtimeErrorMessage`·`compilerMessage`에 "학생 코드가
 * 만든 문자열이라 글자 그대로 보여 준다(HTML로 렌더링하지 않는다)"고 적어 뒀다. 지문과
 * 정반대다 — 여기에 Markdown을 물리면 학생이 쓴 `*`이나 `<`가 해석되어 원문이 달라지고,
 * 무엇이 틀렸는지 알아볼 수 없게 된다.
 */
function Raw({ text }: { text: string }) {
  return (
    <pre className="bg-muted mt-2 overflow-x-auto rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap">
      {text}
    </pre>
  )
}

/**
 * 쉬운 설명 (RES-03).
 *
 * 판정 이름은 `Headline`이 live region 안에서 띄운다 — 여기서 또 적으면 같은 글자가
 * 두 번 보이고 스크린 리더도 두 번 읽는다.
 */
function Explanation({ result }: { result: SubmissionResult }) {
  const { verdict, status } = result
  // 채점 불가는 판정이 아니라 상태다(계약). 설명은 같은 표에서 가져온다.
  const key = status === 'JUDGE_ERROR' ? 'JUDGE_ERROR' : verdict
  if (key === null) return null

  const info = VERDICT_INFO[key]
  return (
    <div className="flex flex-col gap-2">
      <Meta result={result} />
      <p className="text-sm leading-relaxed">{info.description}</p>
      <p className="text-muted-foreground text-sm leading-relaxed">
        <span className="font-medium">먼저 확인해 볼 것: </span>
        {info.checkFirst}
      </p>
      {verdict === 'RUNTIME_ERROR' ? <RuntimeError result={result} /> : null}
    </div>
  )
}

/**
 * 런타임 에러 종류와 원문 (RES-04).
 *
 * 원문은 **공개 예제에서 난 에러일 때만** 온다(계약: 비공개 테스트에서 났으면 null이고
 * 종류만 보여 준다). 비공개 입력이 섞인 메시지를 보여 주면 테스트 데이터가 새기 때문이라
 * 화면이 없는 원문을 만들어 내서는 안 된다. C++ Segfault처럼 원문 자체가 없는 경우도
 * 같은 null이다.
 */
function RuntimeError({ result }: { result: SubmissionResult }) {
  const { runtimeErrorType, runtimeErrorMessage } = result
  if (runtimeErrorType === null) return null

  const info = RUNTIME_ERROR_INFO[runtimeErrorType]
  return (
    <div className="border-border/60 flex flex-col gap-1 rounded-lg border p-3">
      <p className="text-sm font-medium">{info.label}</p>
      <p className="text-muted-foreground text-sm leading-relaxed">{info.description}</p>
      {runtimeErrorMessage !== null ? <Raw text={runtimeErrorMessage} /> : null}
    </div>
  )
}

/** 다음 행동 (RES-06·07). */
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

/** 제출 결과 (RES-01~07). */
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
  // 오류 화면을 띄우는 때와 폴링을 멈추는 때가 같다 (resultQuery의 isDeadEnd).
  // 그 주석에 세 번 어긋났던 경위를 적어 뒀다.
  if (isDeadEnd(error, data !== undefined)) {
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

      {/* 다시 풀기와 같은 주소를 쓴다 (solvePath) */}
      <Link
        to={solvePath(data.problemId, data.language)}
        className="text-primary text-sm underline"
      >
        {data.problemTitle}
      </Link>

      <Headline result={data} />
      <Explanation result={data} />
      <NextActions result={data} />
    </section>
  )
}

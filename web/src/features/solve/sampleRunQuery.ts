import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { api } from '@/api/client'
import { fail } from '@/api/fail'
import type { SampleRunResult } from '@/api/types'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { isDeadEnd, isFinished, pollingInterval } from '@/features/result/resultQuery'
import type { SubmitInput } from './submitQuery'

/**
 * 예제 실행 접수 (SOLVE-08).
 *
 * 202로 접수만 되고 결과는 폴링으로 받는다 — 제출과 같은 모양이다. 요청 본문과 오류도
 * 제출과 같아서(계약: "요청 본문과 오류는 코드 제출과 같다") `SubmitInput`을 그대로 쓴다.
 *
 * **시도 횟수·풀이 상태·제출 기록에 들어가지 않는다**(계약). 그래서 제출과 달리 몇 번
 * 눌러도 되돌릴 수 없는 것이 없다.
 *
 * `Location` 헤더는 따라가지 않는다. 계약이 주는 `id`로 우리가 쿼리를 만든다 — 헤더를
 * 믿으면 "서버 경로와 우리 쿼리가 같다"는 가정이 코드에 숨는다(submitQuery와 같다).
 */
export async function runSamples(input: SubmitInput): Promise<number> {
  const result = await api.POST('/api/sample-runs', { body: input })
  if (result.data === undefined) fail(result)
  return result.data.id
}

/**
 * 예제 실행 상태·예제별 결과 (SOLVE-08).
 *
 * 멈추는 때와 간격은 제출 채점과 **같은 함수**가 정한다(`pollingInterval`) — 계약이 이
 * 엔드포인트의 `status`를 "`SubmissionResult.status`와 같다"로 정하고 폴링 조건도 같은
 * 문장으로 적었다.
 *
 * `retry: false`는 404가 없는 실행과 **남의 실행**에 같이 쓰이기 때문이다(계약).
 */
export function sampleRunQuery(id: number) {
  return queryOptions({
    queryKey: ['sample-run', id] as const,
    queryFn: async (): Promise<SampleRunResult> => {
      const result = await api.GET('/api/sample-runs/{id}', { params: { path: { id } } })
      if (result.data === undefined) fail(result)
      return result.data
    },
    refetchInterval: (query) => pollingInterval(query.state.error, query.state.data?.status),
    retry: false,
  })
}

/**
 * 예제 실행 한 번 (SOLVE-08).
 *
 * **반응형 분기 바깥에서 불러야 한다.** 에디터 칸은 넓은 화면의 grid와 좁은 화면의 Tabs라는
 * 서로 다른 트리에 들어가므로, 실행 중에 폭이 64rem을 넘나들면(창 크기 조절·기기 회전)
 * 그 안의 컴포넌트가 새로 마운트된다. 실행 번호가 거기 있으면 사라져 결과를 영영 못
 * 본다 — 서버는 실행했는데 화면은 아무 일도 없었던 것처럼 된다(submitQuery와 같은 이유).
 *
 * 실행 번호 하나만 들고 있는다. 지난 실행을 쌓지 않는 것은 계약이 "제출 기록에 들어가지
 * 않는다"고 한 것과 같은 선택이다 — 다시 누르면 앞의 결과는 쓸모가 없다.
 *
 * **진행·실패·결과를 여기서 다 정해 내려보낸다.** 화면이 `pending`과 응답 상태를 함께
 * 보고 "실행 중"을 계산하게 두면, 폴링이 더 해 볼 것 없는 실패로 멈춘 뒤에도 마지막
 * 응답(RUNNING)이 캐시에 남아 버튼이 영원히 잠긴다 — 새로고침밖에 길이 없다. 결과
 * 화면이 `isDeadEnd` 하나로 "오류를 띄우는 때"와 "폴링을 멈추는 때"를 맞춘 것과 같은
 * 이유다(그 주석에 세 번 어긋났던 경위가 적혀 있다).
 */
export function useSampleRun() {
  const queryClient = useQueryClient()
  const [id, setId] = useState<number | null>(null)

  const start = useMutation({
    mutationFn: runSamples,
    // 접수가 실패하면 사람이 다시 누르게 한다. 자동 재시도는 같은 실행을 둘 만든다.
    retry: false,
    onSuccess: setId,
    // 세션이 끊겼으면 로그인 화면으로 보낸다(session.ts).
    onError: (error) => forgetSessionIfUnauthorized(queryClient, error),
  })

  // enabled만 끄면 지난 결과가 캐시에 남아 다음 실행을 누르는 순간 잠깐 보인다.
  // 번호가 바뀌면 queryKey가 달라져 data가 undefined부터 시작한다.
  const poll = useQuery({ ...sampleRunQuery(id ?? 0), enabled: id !== null })

  /**
   * 폴링이 401로 끝났으면 세션을 지운다 — RequireAuth가 로그인 화면으로 보낸다.
   *
   * mutation의 onError만으로는 안 된다. 접수가 성공한 뒤 세션이 끊기면 401은 조회에서
   * 온다. 그러면 캐시의 사용자가 남아 있어 사용자는 에디터에 그대로 머문 채 인증 오류
   * 문구만 보게 된다. query라 effect로 건다(결과 화면과 같은 처리).
   */
  const queryError = poll.error
  useEffect(() => {
    forgetSessionIfUnauthorized(queryClient, queryError)
  }, [queryClient, queryError])

  /**
   * 더 해 볼 것이 없는 조회 실패만 꺼낸다.
   *
   * 일시적 실패(5xx·네트워크)는 폴링이 간격만 늘려 계속한다(pollingInterval). 그것까지
   * 내보내면 '실행하고 있어요…' 아래에 실패 문구가 떴다 다음 조회에서 사라져, 사용자와
   * 스크린 리더는 실행이 실패한 줄 알게 된다.
   */
  const stuck = isDeadEnd(queryError, poll.data !== undefined) ? queryError : null
  const failure = start.error ?? stuck

  // 끝났거나 막혔으면 진행 중이 아니다. 실패를 먼저 보는 것이 핵심이다 — 안 그러면
  // 멈춘 폴링의 마지막 RUNNING 때문에 영원히 '실행 중'이 된다.
  const running =
    failure === null &&
    (start.isPending || (id !== null && (poll.data === undefined || !isFinished(poll.data.status))))

  return {
    /** 앞 실행의 결과를 먼저 버린다 — 접수가 오가는 동안 옛 판정이 새 코드의 것으로 읽힌다. */
    start: (input: SubmitInput) => {
      setId(null)
      start.mutate(input)
    },
    pending: running,
    result: id === null ? undefined : poll.data,
    /** 접수 실패와 막힌 조회를 한 자리로 모은다 — 사용자에게는 "실행이 안 됐다" 하나다. */
    error: failure,
  }
}

/** 화면이 받아 쓰는 모양. `useSampleRun`을 반응형 분기 위에서 부르고 이 값을 내려보낸다. */
export type SampleRunState = ReturnType<typeof useSampleRun>

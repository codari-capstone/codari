import { queryOptions } from '@tanstack/react-query'

import { api } from '@/api/client'
import { fail } from '@/api/fail'
import type { SubmissionResult } from '@/api/types'
import { POLL_INTERVAL_MS } from '@/app/queryClient'
import { toUserMessage } from '@/constants/errors'

/** 더 물어볼 것이 없는 상태. 판정이 났거나(COMPLETED) 서버 문제(JUDGE_ERROR)다. */
export function isFinished(status: SubmissionResult['status']): boolean {
  return status === 'COMPLETED' || status === 'JUDGE_ERROR'
}

/**
 * 다시 물어볼 만한 실패인지. 5xx와 네트워크 실패가 그렇고, 401·403·404는 아니다.
 *
 * 상태 코드 표를 여기서 새로 적지 않는다 — `toUserMessage`가 이미 그 판단을 들고 있고
 * (constants/errors.ts), 두 벌이 되면 한쪽만 고쳐지는 날이 온다.
 */
export function isTransient(error: unknown): boolean {
  return toUserMessage(error).retryable
}

/**
 * 실패하는 동안의 간격. 정상일 때의 다섯 배로 늦춘다.
 *
 * 서버가 같은 제출에 계속 500을 내도 1초마다 두드리는 것은 과하다. 몇 번까지 받아 주고
 * 멈추는 쪽을 먼저 짰는데, `fetchFailureCount`는 fetch가 시작될 때마다 0으로 돌아가서
 * (retry를 끈 이 쿼리에서는 1을 넘지 못한다) 상한이 영영 걸리지 않았다 — 테스트가 9초를
 * 기다려도 포기하지 않는 것으로 잡았다. 연속 실패를 직접 세려면 상태를 하나 더 들고 있어야
 * 해서, 세는 대신 뜸하게 묻는 쪽으로 바꿨다.
 */
const FAILING_INTERVAL_MS = POLL_INTERVAL_MS * 5

/**
 * 더 해 볼 것이 없는 상태인지 — **화면이 오류를 띄우는 때와 폴링을 멈추는 때가 같다.**
 *
 * 이 자리를 세 번 고쳤다. 처음에는 오류를 데이터보다 먼저 봐서 폴링 한 번만 실패해도
 * 진행 상태가 사라졌고, 다음에는 데이터가 있으면 숨기게 해서 401이 와도 멈추지 않았고,
 * 그다음에는 오류의 성격만 보다가 **데이터 없이 첫 조회가 503으로 끝나면** 오류 화면도
 * 다시 시도 버튼도 없이 스켈레톤만 남겼다. 조건을 두 곳에서 따로 적은 것이 원인이었다.
 *
 * 그래서 기준을 하나로 묶었다. 포기하는 경우는 셋이다.
 *
 * 1. **보여 줄 것이 없다.** 받아 둔 데이터가 없으면 숨길 진행 상태도 없다 — 끝나지 않는
 *    로딩 대신 오류와 다시 시도 버튼을 보여 준다(일시적 실패는 `retryable`이라 버튼이 뜬다).
 * 2. **다시 물어도 같은 답이다.** 401·403·404. 받아 둔 것이 남의 결과일 수도 있다.
 *
 * 받아 둔 데이터가 있는 채로 일시적 실패가 이어지면 포기하지 않고 간격만 늘린다
 * (`FAILING_INTERVAL_MS`) — 채점이 끝나는 것을 놓치지 않으면서 서버를 덜 두드린다.
 */
export function isDeadEnd(error: unknown, hasData: boolean): boolean {
  if (error === null || error === undefined) return false
  return !hasData || !isTransient(error)
}

/**
 * 채점 상태·결과 (RES-01·02).
 *
 * 끝날 때까지 주기적으로 묻는다(계약: "화면은 `status`가 `COMPLETED`나 `JUDGE_ERROR`가 될
 * 때까지 주기적으로 부른다"). 간격은 `VITE_POLL_INTERVAL_MS`로 바꿀 수 있다 —
 * e2e가 기다리는 시간을 줄이려고 둔 값이다(queryClient.ts).
 *
 * 멈추는 때가 둘이다.
 *
 * 1. **끝났을 때.** 계속 물으면 탭을 열어 둔 채 자리를 비운 사용자에게 밤새 요청이 나간다.
 * 2. **더 해 볼 것이 없을 때** (`isDeadEnd`). `retry: false`는 한 번의 fetch 안에서
 *    재시도만 막고 interval 재조회는 막지 않는다 — 그래서 없는 제출을 열면 '찾을 수
 *    없습니다' 화면 뒤에서 1초마다 404가 반복됐다.
 *
 * 화면도 같은 `isDeadEnd`로 가른다. 조건을 두 곳에서 따로 적었다가 세 번 어긋났다.
 *
 * `retry: false`를 두는 이유는 이 엔드포인트의 404가 없는 제출과 **남의 제출**에 같이
 * 쓰이기 때문이다(계약: 번호를 바꿔 물어도 있는지 드러나지 않는다).
 *
 * `staleTime`은 건드리지 않는다. 처음에는 0으로 두고 "기본값 30초면 폴링이 캐시만 읽는다"고
 * 적었는데 **틀린 설명이었다** — `refetchInterval`은 staleTime과 상관없이 fetch를 실행한다
 * (30초로 바꿔 놓고 폴링 테스트가 그대로 통과하는 것으로 확인했다).
 */
export function submissionResultQuery(id: number) {
  return queryOptions({
    queryKey: ['submission', id] as const,
    queryFn: async (): Promise<SubmissionResult> => {
      const result = await api.GET('/api/submissions/{id}', { params: { path: { id } } })
      if (result.data === undefined) fail(result)
      return result.data
    },
    refetchInterval: (query) => {
      const { error, data } = query.state
      if (isDeadEnd(error, data !== undefined)) return false
      if (data !== undefined && isFinished(data.status)) return false
      // 실패하는 중에는 뜸하게 묻는다 (FAILING_INTERVAL_MS 주석).
      return error === null ? POLL_INTERVAL_MS : FAILING_INTERVAL_MS
    },
    retry: false,
  })
}

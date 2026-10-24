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
 * 채점 상태·결과 (RES-01·02).
 *
 * 끝날 때까지 주기적으로 묻는다(계약: "화면은 `status`가 `COMPLETED`나 `JUDGE_ERROR`가 될
 * 때까지 주기적으로 부른다"). 간격은 `VITE_POLL_INTERVAL_MS`로 바꿀 수 있다 —
 * e2e가 기다리는 시간을 줄이려고 둔 값이다(queryClient.ts).
 *
 * 멈추는 때가 둘이다.
 *
 * 1. **끝났을 때.** 계속 물으면 탭을 열어 둔 채 자리를 비운 사용자에게 밤새 요청이 나간다.
 * 2. **다시 물어도 같은 답인 오류일 때.** `retry: false`는 한 번의 fetch 안에서 재시도만
 *    막고 interval 재조회는 막지 않는다. 그래서 없는 제출을 열면 '찾을 수 없습니다' 화면
 *    뒤에서 1초마다 404가 반복됐다.
 *
 * **받아 둔 데이터가 있는지로 가르지 않는다.** 처음에는 그렇게 했는데, '채점 중 60%'를
 * 보는 동안 세션이 만료되면 401이 오고 또 와도 멈추지 않았다 — 화면은 멈춘 진행률을
 * 보여 주고 브라우저는 401을 끝없이 보냈다. 끝나지 않는 채점으로 읽힌다.
 *
 * 가르는 기준은 `toUserMessage`의 `retryable`이다(constants/errors.ts). 401·403·404는
 * 다시 물어도 같은 답이고, 5xx와 네트워크 실패(status 0)는 잠깐의 일이다. 같은 판단을
 * 여기서 새로 적으면 상태 코드 표가 두 벌이 된다.
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
      const { status, error, data } = query.state
      if (status === 'error' && !isTransient(error)) return false
      if (data !== undefined && isFinished(data.status)) return false
      return POLL_INTERVAL_MS
    },
    retry: false,
  })
}

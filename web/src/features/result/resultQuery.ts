import { queryOptions } from '@tanstack/react-query'

import { api } from '@/api/client'
import { fail } from '@/api/fail'
import type { SubmissionResult } from '@/api/types'
import { POLL_INTERVAL_MS } from '@/app/queryClient'

/** 더 물어볼 것이 없는 상태. 판정이 났거나(COMPLETED) 서버 문제(JUDGE_ERROR)다. */
export function isFinished(status: SubmissionResult['status']): boolean {
  return status === 'COMPLETED' || status === 'JUDGE_ERROR'
}

/**
 * 채점 상태·결과 (RES-01·02).
 *
 * 끝날 때까지 주기적으로 묻는다(계약: "화면은 `status`가 `COMPLETED`나 `JUDGE_ERROR`가 될
 * 때까지 주기적으로 부른다"). 간격은 `VITE_POLL_INTERVAL_MS`로 바꿀 수 있다 —
 * e2e가 기다리는 시간을 줄이려고 둔 값이다(queryClient.ts).
 *
 * 끝나면 폴링을 멈춘다. 계속 물으면 서버와 배터리를 버리고, 탭을 열어 둔 채 자리를 비운
 * 사용자에게 밤새 요청이 나간다.
 *
 * 다시 묻지 않는다(`retry: false`). 앱 기본값은 `retry: 1`인데, 이 엔드포인트의 404는
 * 없는 제출과 **남의 제출**에 같이 쓰이므로(계약: 번호를 바꿔 물어도 있는지 드러나지
 * 않는다) 한 번 더 가도 같은 답이다.
 *
 * `staleTime`을 0으로 둔다. 앱 기본값 30초를 그대로 쓰면 폴링이 캐시만 다시 읽고
 * 서버에 가지 않아 진행률이 멈춘 것처럼 보인다.
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
      const status = query.state.data?.status
      if (status !== undefined && isFinished(status)) return false
      return POLL_INTERVAL_MS
    },
    staleTime: 0,
    retry: false,
  })
}

/**
 * 주소의 제출 번호. 1 이상의 정수가 아니면 null이다.
 *
 * `parseProblemId`와 같은 판단이다 — 정수가 아닌 주소에 서버는 400을, 없는 번호에는 404를
 * 주는데 사용자에게는 둘 다 "없는 제출"이라, 보낼 필요가 없는 요청은 보내지 않는다.
 * 위쪽도 막는다(`long id` 바인딩이 실패해 400이 된다).
 */
export function parseSubmissionId(value: string | undefined): number | null {
  if (value === undefined) return null
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > Number.MAX_SAFE_INTEGER) return null
  return parsed
}

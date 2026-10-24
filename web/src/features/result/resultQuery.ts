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
 * 멈추는 때가 둘이다.
 *
 * 1. **끝났을 때.** 계속 물으면 탭을 열어 둔 채 자리를 비운 사용자에게 밤새 요청이 나간다.
 * 2. **오류로 끝났는데 보여 줄 것이 없을 때.** `retry: false`는 한 번의 fetch 안에서
 *    재시도만 막고 interval 재조회는 막지 않는다. 그래서 없는 제출이나 남의 제출을 열면
 *    '찾을 수 없습니다' 화면 뒤에서 1초마다 404가 반복됐다.
 *
 * 받아 둔 데이터가 있는데 폴링 한 번이 실패한 경우는 멈추지 않는다. 네트워크가 잠깐 끊긴
 * 것일 수 있고 그때 멈추면 채점이 끝나도 영영 모른다 — 화면도 받아 둔 진행 상태를 계속
 * 보여 준다(SubmissionResultPage 주석).
 *
 * `retry: false`를 두는 이유는 이 엔드포인트의 404가 없는 제출과 **남의 제출**에 같이
 * 쓰이기 때문이다(계약: 번호를 바꿔 물어도 있는지 드러나지 않는다). 한 번 더 가도 같은
 * 답이다.
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
      const { status, data } = query.state
      if (data === undefined) return status === 'error' ? false : POLL_INTERVAL_MS
      return isFinished(data.status) ? false : POLL_INTERVAL_MS
    },
    retry: false,
  })
}

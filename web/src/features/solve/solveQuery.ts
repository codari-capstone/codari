import { queryOptions } from '@tanstack/react-query'

import { api } from '@/api/client'
import { fail } from '@/api/fail'
import type { ProblemDetailView } from '@/api/types'

/**
 * 문제 상세 (SOLVE-01~04·06).
 *
 * 로그인해야 받는다 (COM-05) — 라우터가 `RequireAuth` 안에 두므로 이 쿼리가 돌 때는
 * 이미 세션이 있다. 없는 문제와 공개된 버전이 없는 문제는 서버가 같은 404로 답한다
 * (계약: 공개 전 문제가 있는지 드러내지 않는다).
 */
export function problemDetailQuery(id: number) {
  return queryOptions({
    queryKey: ['problem', id] as const,
    queryFn: async (): Promise<ProblemDetailView> => {
      const result = await api.GET('/api/problems/{id}', { params: { path: { id } } })
      if (result.data === undefined) fail(result)
      return result.data
    },
  })
}

/**
 * 주소의 문제 번호. 1 이상의 정수가 아니면 null이다.
 *
 * 계약은 정수가 아닌 `id`에 400을, 없는 번호에 404를 준다. 사용자에게는 둘 다 "없는 문제"와
 * 같은 일이므로, 보낼 필요가 없는 요청은 보내지 않고 화면이 바로 404 문구로 끝낸다.
 * 목록 화면의 `parsePage`와 같은 판단이다.
 *
 * 위쪽도 막는다. `?id=1e300`은 정수 검사를 통과하지만 서버의 `long id`가 바인딩하지 못해
 * 400이 되고, 화면에는 오류만 남는다. JS가 정확히 셀 수 있는 정수까지만 받는다.
 */
export function parseProblemId(value: string | undefined): number | null {
  if (value === undefined) return null
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > Number.MAX_SAFE_INTEGER) return null
  return parsed
}

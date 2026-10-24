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

import { queryOptions } from '@tanstack/react-query'

import { api } from '@/api/client'
import { fail } from '@/api/fail'
import type { ConceptTag, ProblemPage } from '@/api/types'
import { toQuery, type ProblemListParams } from './problemListParams'

/**
 * 문제 목록. 필터가 queryKey에 들어가므로 필터마다 캐시가 따로 생긴다.
 *
 * openapi-fetch는 던지지 않고 { data, error }를 돌려주는데 TanStack Query는 던진 것만
 * 오류로 본다. 그래서 data가 없으면 fail이 던진다 — 그쪽이 본문의 code·detail을 싣고
 * status를 HTTP 상태로 덮으며, ErrorState가 그 모양을 읽는다.
 */
export function problemListQuery(params: ProblemListParams) {
  const query = toQuery(params)

  return queryOptions({
    queryKey: ['problems', query] as const,
    queryFn: async (): Promise<ProblemPage> => {
      const result = await api.GET('/api/problems', { params: { query } })
      if (result.data === undefined) fail(result)
      return result.data
    },
  })
}

/**
 * 필터에 쓸 개념 태그 목록.
 *
 * 문제 목록 응답에서 뽑으면 안 된다. 필터를 걸수록 결과에 남은 태그만 보여
 * 선택지가 사라진다. 태그는 거의 바뀌지 않으므로 staleTime을 길게 둔다.
 */
export function conceptTagsQuery() {
  return queryOptions({
    queryKey: ['concept-tags'] as const,
    queryFn: async (): Promise<ConceptTag[]> => {
      const result = await api.GET('/api/concept-tags')
      if (result.data === undefined) fail(result)
      return result.data
    },
    staleTime: 10 * 60 * 1000,
  })
}

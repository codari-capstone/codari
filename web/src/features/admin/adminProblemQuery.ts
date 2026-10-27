import { queryOptions } from '@tanstack/react-query'

import { api } from '@/api/client'
import { fail } from '@/api/fail'

/**
 * 한 페이지에 보여 주는 문제 수 (ADM-01).
 *
 * 계약이 `size`의 최대·기본값을 20으로 정했다. 사용자 목록의 `PAGE_SIZE`와 값이 같지만
 * 거기서 가져오지 않는다 — 다른 계약의 다른 상한이고, 한쪽이 바뀌는 날 조용히 따라가면
 * 400을 받는다.
 */
export const ADMIN_PAGE_SIZE = 20

export interface AdminProblemListParams {
  keyword: string
  /** 보고 있는 페이지. 1부터 센다(계약의 `page`는 0부터라 보낼 때 1을 뺀다). */
  page: number
}

/**
 * 관리자 문제 목록 (ADM-01). 공개 전·비공개 문제까지 모두 온다.
 *
 * 사용자 목록(`problemsQuery`)과 달리 주소에 조건을 싣지 않는다. 관리자 목록은 공유하거나
 * 북마크할 화면이 아니고, 조건도 검색어 하나뿐이다 — URL 동기화는 필터 다섯 개를 가진
 * LIST-01~05 때문에 생긴 기계다(problemListParams.ts). 새로고침하면 검색어가 풀린다.
 */
export function adminProblemListQuery({ keyword, page }: AdminProblemListParams) {
  const query = {
    page: page - 1,
    size: ADMIN_PAGE_SIZE,
    ...(keyword ? { keyword } : {}),
  }

  return queryOptions({
    queryKey: ['admin-problems', query] as const,
    queryFn: async () => {
      const result = await api.GET('/api/admin/problems', { params: { query } })
      if (result.data === undefined) fail(result)
      return result.data
    },
  })
}

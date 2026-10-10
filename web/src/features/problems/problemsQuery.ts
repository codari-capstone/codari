import { queryOptions } from '@tanstack/react-query'

import { provisionalApi, type ConceptTag, type Page, type ProblemSummary } from '@/api/provisional'
import { toQuery, type ProblemListParams } from './problemListParams'

/**
 * 오류를 ErrorState가 읽을 수 있는 형태로 올린다.
 *
 * openapi-fetch는 던지지 않고 { data, error }를 돌려준다. TanStack Query는
 * 던진 것만 오류로 보므로 여기서 던진다. error는 서버의 RFC 9457 본문이고,
 * constants/errors.ts의 toUserMessage가 그걸 한국어 문구로 바꾼다.
 */
function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.data !== undefined) return result.data
  throw result.error ?? { status: result.response.status }
}

/**
 * 문제 목록. 필터가 queryKey에 들어가므로 필터마다 캐시가 따로 생긴다.
 *
 * 명세(#2)가 확정되면 provisionalApi를 @/api/client의 api로 바꾼다. 이 파일이
 * provisionalApi를 쓰는 유일한 곳이다 — 도메인 타입은 다른 파일들도 쓰므로
 * @/api/provisional 자체는 남는다 (그 파일 머리 주석 참고). 호출 모양은 그대로다.
 */
export function problemListQuery(params: ProblemListParams) {
  const query = toQuery(params)

  return queryOptions({
    queryKey: ['problems', query] as const,
    queryFn: async (): Promise<Page<ProblemSummary>> =>
      unwrap(await provisionalApi.GET('/api/problems', { params: { query } })),
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
    queryFn: async (): Promise<ConceptTag[]> =>
      unwrap(await provisionalApi.GET('/api/concept-tags')),
    staleTime: 10 * 60 * 1000,
  })
}

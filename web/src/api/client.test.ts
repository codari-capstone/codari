import { http, HttpResponse } from 'msw'
import { describe, expect, expectTypeOf, it } from 'vitest'

import { type Page, type ProblemSummary, provisionalApi } from '@/api/provisional'
import { server } from '@/mocks/server'

/**
 * baseUrl이 '/' 같은 상대 경로면 openapi-fetch가 만드는 new Request()가
 * Node에서 "Failed to parse URL from /api/..."로 실패한다. 이 테스트가
 * 그 회귀를 막는다.
 */
describe('api 클라이언트', () => {
  it('jsdom 환경에서 MSW 핸들러까지 요청이 닿는다', async () => {
    server.use(
      http.get(`${window.location.origin}/api/problems`, () =>
        HttpResponse.json({ content: [], totalElements: 0 }),
      ),
    )

    const { data, error } = await provisionalApi.GET('/api/problems')

    expect(error).toBeUndefined()
    expect(data).toEqual({ content: [], totalElements: 0 })
  })

  // 임시 계약을 둔 이유가 타입이다. any로 새어 나가면 둘 이유가 없다.
  it('응답에 타입이 붙는다', async () => {
    server.use(
      http.get(`${window.location.origin}/api/problems`, () =>
        HttpResponse.json({ content: [], totalElements: 0 }),
      ),
    )

    const { data } = await provisionalApi.GET('/api/problems')

    expectTypeOf(data).toEqualTypeOf<Page<ProblemSummary> | undefined>()
  })
})

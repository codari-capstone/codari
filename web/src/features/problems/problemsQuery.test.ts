import { QueryClient } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { createQueryClient } from '@/app/queryClient'
import { toUserMessage } from '@/constants/errors'
import { server } from '@/mocks/server'
import { conceptTags } from '@/mocks/fixtures/problems'
import { DEFAULT_PARAMS } from './problemListParams'
import { conceptTagsQuery, problemListQuery } from './problemsQuery'

function client(): QueryClient {
  return createQueryClient()
}

describe('problemListQuery', () => {
  it('목록을 가져온다', async () => {
    const page = await client().fetchQuery(problemListQuery(DEFAULT_PARAMS))

    expect(page.totalElements).toBe(8)
  })

  it('필터를 쿼리 파라미터로 보낸다', async () => {
    let captured = ''
    server.use(
      http.get('*/api/problems', ({ request }) => {
        captured = new URL(request.url).search
        return HttpResponse.json({ content: [], totalElements: 0 })
      }),
    )

    await client().fetchQuery(
      problemListQuery({ ...DEFAULT_PARAMS, keyword: '합', difficulty: ['EASY'] }),
    )

    expect(captured).toContain('keyword=%ED%95%A9')
    expect(captured).toContain('difficulty=EASY')
  })

  // 필터가 다르면 다른 캐시여야 한다. 같은 키를 쓰면 필터를 바꿔도
  // 이전 결과가 그대로 보인다.
  it('필터가 다르면 queryKey가 다르다', () => {
    const a = problemListQuery(DEFAULT_PARAMS).queryKey
    const b = problemListQuery({ ...DEFAULT_PARAMS, keyword: '합' }).queryKey

    expect(a).not.toEqual(b)
  })

  it('서버가 오류를 주면 던진다', async () => {
    server.use(
      http.get('*/api/problems', () =>
        HttpResponse.json(
          { type: '/problems/unavailable', title: 'Unavailable', status: 503 },
          { status: 503 },
        ),
      ),
    )

    // status만 단언하면 unwrap이 본문을 버리고 { status }만 다시 만들어도 통과한다.
    // toUserMessage는 type으로 가장 구체적인 문구를 고르므로, type이 사라지면
    // 사용자는 구체적 안내 대신 일반 문구를 보게 된다.
    await expect(client().fetchQuery(problemListQuery(DEFAULT_PARAMS))).rejects.toMatchObject({
      type: '/problems/unavailable',
      title: 'Unavailable',
      status: 503,
    })
  })
})

describe('problemListQuery 비JSON 오류 본문', () => {
  // openapi-fetch는 JSON이 아닌 본문을 문자열 그대로 error에 둔다. 그걸 던지면 status를
  // 잃어 게이트웨이가 돌려준 HTML 401도 일반 오류 문구가 된다.
  it('본문이 JSON이 아닌 401도 status를 지닌 채 던진다', async () => {
    server.use(
      http.get('*/api/problems', () => HttpResponse.text('<html>login</html>', { status: 401 })),
    )

    const error = await client()
      .fetchQuery(problemListQuery(DEFAULT_PARAMS))
      .then(
        () => {
          throw new Error('거절되어야 한다')
        },
        (reason: unknown) => reason,
      )

    expect(error).toMatchObject({ status: 401 })
    expect(toUserMessage(error).title).toBe('로그인이 필요합니다')
  })

  // JSON.parse('')가 던져 error가 ''가 된다. 거짓이지만 nullish가 아니다.
  it('본문이 빈 503도 status를 지닌 채 던진다', async () => {
    server.use(http.get('*/api/problems', () => new HttpResponse(null, { status: 503 })))

    await expect(client().fetchQuery(problemListQuery(DEFAULT_PARAMS))).rejects.toMatchObject({
      status: 503,
    })
  })
})

describe('conceptTagsQuery', () => {
  it('태그 목록을 가져온다', async () => {
    const tags = await client().fetchQuery(conceptTagsQuery())

    expect(tags).toEqual(conceptTags)
  })
})

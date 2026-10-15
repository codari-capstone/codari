import { QueryClient } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '@/mocks/server'
import { loginRequest, logoutRequest, meQuery } from './authQuery'

/** queryFn만 떼어 직접 부른다. 훅 렌더 없이 분기를 확인한다. */
async function runMeQuery() {
  const client = new QueryClient()
  return client.fetchQuery(meQuery())
}

describe('meQuery', () => {
  it('로그인 상태면 사용자를 돌려준다', async () => {
    server.use(
      http.get('*/api/me', () => HttpResponse.json({ id: 7, nickname: '테스터', role: 'USER' })),
    )

    await expect(runMeQuery()).resolves.toEqual({ id: 7, nickname: '테스터', role: 'USER' })
  })

  it('401이면 null을 돌려준다. 던지지 않는다', async () => {
    server.use(
      http.get('*/api/me', () =>
        HttpResponse.json({ status: 401, title: 'Unauthorized' }, { status: 401 }),
      ),
    )

    await expect(runMeQuery()).resolves.toBeNull()
  })

  it('500이면 던진다', async () => {
    server.use(
      http.get('*/api/me', () =>
        HttpResponse.json({ status: 500, title: 'Server Error' }, { status: 500 }),
      ),
    )

    await expect(runMeQuery()).rejects.toMatchObject({ status: 500 })
  })

  it('본문이 JSON이 아니어도 상태 코드를 실어 던진다', async () => {
    // openapi-fetch는 JSON 파싱에 실패하면 error에 문자열을 그대로 둔다.
    // 그걸 그대로 던지면 toUserMessage가 status를 못 읽어 일반 문구로 떨어진다.
    server.use(http.get('*/api/me', () => new HttpResponse('<html>503</html>', { status: 503 })))

    await expect(runMeQuery()).rejects.toMatchObject({ status: 503 })
  })

  it('5xx를 다시 보내지 않는다', async () => {
    // 이 테스트의 클라이언트는 옵션 없는 new QueryClient()라 라이브러리 기본값(3회 재시도)을
    // 쓴다. meQuery가 retry를 끄지 않았다면 지연을 두고 네 번 나간다. 한 번이어야 한다.
    let hits = 0
    server.use(
      http.get('*/api/me', () => {
        hits += 1
        return HttpResponse.json({ status: 500, title: 'Server Error' }, { status: 500 })
      }),
    )

    await expect(runMeQuery()).rejects.toMatchObject({ status: 500 })
    expect(hits).toBe(1)
  })
})

describe('loginRequest', () => {
  it('성공하면 사용자를 돌려준다', async () => {
    const user = await loginRequest({ email: 'user@codari.test', password: 'Codari!test1' })

    expect(user).toEqual({ id: 1, nickname: '코다리', role: 'USER' })

    await logoutRequest()
  })

  it('401이면 상태 코드를 실어 던진다', async () => {
    await expect(
      loginRequest({ email: 'user@codari.test', password: '틀린비밀번호1!' }),
    ).rejects.toMatchObject({ status: 401 })
  })

  it('429면 상태 코드를 실어 던진다', async () => {
    server.use(
      http.post('*/api/auth/login', () =>
        HttpResponse.json({ status: 429, title: 'Too Many Requests' }, { status: 429 }),
      ),
    )

    await expect(
      loginRequest({ email: 'user@codari.test', password: 'Codari!test1' }),
    ).rejects.toMatchObject({ status: 429 })
  })
})

describe('logoutRequest', () => {
  it('204면 조용히 끝난다', async () => {
    await expect(logoutRequest()).resolves.toBeUndefined()
  })

  it('500이면 던진다', async () => {
    server.use(
      http.post('*/api/auth/logout', () =>
        HttpResponse.json({ status: 500, title: 'Server Error' }, { status: 500 }),
      ),
    )

    await expect(logoutRequest()).rejects.toMatchObject({ status: 500 })
  })
})

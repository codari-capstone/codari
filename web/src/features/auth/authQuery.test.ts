import { QueryClient } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import { getAccessToken, setAccessToken } from '@/api/session'
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
      http.get('*/api/users/me', () =>
        HttpResponse.json({ id: 7, nickname: '테스터', role: 'USER' }),
      ),
    )

    await expect(runMeQuery()).resolves.toEqual({ id: 7, nickname: '테스터', role: 'USER' })
  })

  it('401이면 null을 돌려준다. 던지지 않는다', async () => {
    server.use(
      http.get('*/api/users/me', () =>
        HttpResponse.json({ status: 401, title: 'Unauthorized' }, { status: 401 }),
      ),
    )

    await expect(runMeQuery()).resolves.toBeNull()
  })

  it('500이면 던진다', async () => {
    server.use(
      http.get('*/api/users/me', () =>
        HttpResponse.json({ status: 500, title: 'Server Error' }, { status: 500 }),
      ),
    )

    await expect(runMeQuery()).rejects.toMatchObject({ status: 500 })
  })

  it('본문이 JSON이 아니어도 상태 코드를 실어 던진다', async () => {
    // openapi-fetch는 JSON 파싱에 실패하면 error에 문자열을 그대로 둔다.
    // 그걸 그대로 던지면 toUserMessage가 status를 못 읽어 일반 문구로 떨어진다.
    server.use(
      http.get('*/api/users/me', () => new HttpResponse('<html>503</html>', { status: 503 })),
    )

    await expect(runMeQuery()).rejects.toMatchObject({ status: 503 })
  })

  it('5xx를 다시 보내지 않는다', async () => {
    // 이 테스트의 클라이언트는 옵션 없는 new QueryClient()라 라이브러리 기본값(3회 재시도)을
    // 쓴다. meQuery가 retry를 끄지 않았다면 지연을 두고 네 번 나간다. 한 번이어야 한다.
    let hits = 0
    server.use(
      http.get('*/api/users/me', () => {
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

/**
 * 로그인이 두 걸음인 것을 고정한다 (COM-04).
 *
 * 계약의 로그인 응답에는 access token만 있고 사용자가 없다 — 닉네임은 바뀔 수 있어
 * 토큰이 아니라 `/api/users/me`로 받으라고 계약이 적어 두었다.
 */
describe('loginRequest', () => {
  afterEach(() => setAccessToken(null))

  it('토큰을 심고 그 토큰으로 사용자를 받아 온다', async () => {
    let sent: string | null = null
    server.use(
      http.post('*/api/auth/login', () => HttpResponse.json({ accessToken: 'fresh' })),
      http.get('*/api/users/me', ({ request }) => {
        sent = request.headers.get('Authorization')
        return HttpResponse.json({ id: 1, nickname: '코다리', role: 'USER' })
      }),
    )

    const user = await loginRequest({ email: 'user@codari.test', password: 'Codari!test1' })

    expect(getAccessToken()).toBe('fresh')
    expect(sent).toBe('Bearer fresh')
    expect(user).toEqual({ id: 1, nickname: '코다리', role: 'USER' })
  })

  /** 반쪽 세션을 남기지 않는다 — 토큰은 있는데 누구인지 모르는 상태가 제일 나쁘다. */
  it('사용자를 못 받으면 심었던 토큰도 버린다', async () => {
    server.use(
      http.post('*/api/auth/login', () => HttpResponse.json({ accessToken: 'fresh' })),
      http.get('*/api/users/me', () => HttpResponse.json({ status: 500 }, { status: 500 })),
    )

    await expect(
      loginRequest({ email: 'user@codari.test', password: 'Codari!test1' }),
    ).rejects.toMatchObject({ status: 500 })
    expect(getAccessToken()).toBeNull()
  })
})

describe('logoutRequest', () => {
  /** 쿠키만 지우면 만료까지 이 탭이 계속 요청에 성공한다. */
  it('들고 있던 토큰을 버린다', async () => {
    setAccessToken('fresh')

    await logoutRequest()

    expect(getAccessToken()).toBeNull()
  })
})

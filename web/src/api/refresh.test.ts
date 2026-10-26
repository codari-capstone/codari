import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, pendingRequestCount } from './client'
import { refreshAccessToken } from './refresh'
import { endSession, getAccessToken, getGeneration, setAccessToken } from './session'
import { server } from '@/mocks/server'

/** 갱신 응답. 호출 수를 세고 매번 다른 토큰을 준다. */
function refreshReturns(token: string | null) {
  let calls = 0
  server.use(
    http.post('*/api/auth/refresh', () => {
      calls += 1
      if (token === null) return HttpResponse.json({ status: 401 }, { status: 401 })
      return HttpResponse.json({ accessToken: `${token}.${calls}` })
    }),
  )
  return () => calls
}

describe('refreshAccessToken (COM-04)', () => {
  afterEach(() => {
    setAccessToken(null)
    vi.restoreAllMocks()
  })

  it('새 토큰을 받아 보관한다', async () => {
    setAccessToken('old')
    refreshReturns('new')

    const token = await refreshAccessToken('old')

    expect(token).toBe('new.1')
    expect(getAccessToken()).toBe('new.1')
  })

  it('실패하면 null이고 들고 있던 토큰도 버린다', async () => {
    setAccessToken('old')
    refreshReturns(null)

    expect(await refreshAccessToken('old')).toBeNull()
    // 만료된 토큰을 쥐고 있으면 다음 요청이 또 401을 받는다.
    expect(getAccessToken()).toBeNull()
  })

  /**
   * 보낸 토큰과 지금 토큰이 다르면 누군가 이미 갱신했다는 뜻이다. 한 번 더 요청할 이유가
   * 없다 — 전에는 "부른 시점의 토큰"과 비교해서, 느리게 도착한 401이 중복 갱신을 냈다.
   */
  it('이미 다른 요청이 갱신했으면 그 토큰을 쓴다', async () => {
    setAccessToken('new')
    const calls = refreshReturns('another')

    expect(await refreshAccessToken('old')).toBe('new')
    expect(calls()).toBe(0)
  })

  /** 세션이 끝난 뒤 밀려 오는 401들이 각자 갱신을 또 요청하면 실패 요청만 401 개수만큼 난다. */
  it('이미 세션이 끝났으면 다시 요청하지 않는다', async () => {
    setAccessToken(null)
    const calls = refreshReturns('new')

    expect(await refreshAccessToken('old')).toBeNull()
    expect(calls()).toBe(0)
  })

  /**
   * 서버의 로그아웃은 refresh 계열만 폐기하고 이미 발급된 access token은 만료까지
   * 유효하다. 늦게 도착한 갱신 응답을 심으면 로그아웃한 탭이 다시 인증된다.
   */
  it('기다리는 동안 로그아웃했으면 받은 토큰을 버린다', async () => {
    setAccessToken('old')
    server.use(
      http.post('*/api/auth/refresh', async () => {
        // 응답이 돌아오기 전에 로그아웃이 끼어든다.
        endSession()
        return HttpResponse.json({ accessToken: 'new' })
      }),
    )

    expect(await refreshAccessToken('old')).toBeNull()
    expect(getAccessToken()).toBeNull()
  })

  /** 실패했다고 그사이 로그인이 심어 둔 유효한 토큰까지 지우면 안 된다. */
  it('실패해도 그사이 심긴 토큰은 지우지 않는다', async () => {
    setAccessToken('old')
    server.use(
      http.post('*/api/auth/refresh', async () => {
        setAccessToken('from-login')
        return HttpResponse.json({ status: 401 }, { status: 401 })
      }),
    )

    expect(await refreshAccessToken('old')).toBeNull()
    expect(getAccessToken()).toBe('from-login')
  })

  /**
   * 계약이 Web Locks를 쓰라고 적어 두었다. 두 탭이 같은 refresh token을 보내면 서버가
   * 탈취로 보고 **같은 로그인의 토큰을 모두 폐기**한다 — 둘 다 로그아웃된다.
   *
   * jsdom에는 `navigator.locks`가 없어서 직렬화하는 가짜를 심는다. 브라우저의 Web Locks를
   * 검증하는 것이 아니라 **우리가 그것을 쓰는지**를 본다 — 잠금 안에서 토큰을 다시 확인해
   * 뒤따라온 쪽이 앞에서 받아 둔 것을 쓰는지가 요점이다. 그게 없으면 잠금은 순서만 줄 뿐
   * 요청 수는 그대로다.
   */
  it('동시에 불러도 갱신 요청은 한 번만 나간다', async () => {
    setAccessToken('old')
    const calls = refreshReturns('new')
    const names: string[] = []
    let chain = Promise.resolve<unknown>(undefined)
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: (name: string, run: () => Promise<unknown>) => {
          names.push(name)
          chain = chain.then(run)
          return chain
        },
      },
    })

    try {
      const [first, second] = await Promise.all([
        refreshAccessToken('old'),
        refreshAccessToken('old'),
      ])

      expect(calls()).toBe(1)
      expect(first).toBe('new.1')
      expect(second).toBe('new.1')
      // 탭끼리 공유되려면 둘이 같은 이름을 써야 한다.
      expect(new Set(names).size).toBe(1)
    } finally {
      delete (navigator as { locks?: unknown }).locks
    }
  })

  /** 구형 브라우저에는 Web Locks가 없다. 갱신을 아예 못 하는 것보다는 낫다. */
  it('Web Locks가 없어도 갱신은 된다', async () => {
    // jsdom에 원래 없다 — 이 환경이 곧 그 경우다.
    expect(navigator.locks).toBeUndefined()
    setAccessToken('old')
    refreshReturns('new')

    expect(await refreshAccessToken('old')).toBe('new.1')
  })
})

describe('세션 미들웨어 (api/client.ts)', () => {
  afterEach(() => {
    setAccessToken(null)
  })

  it('토큰이 있으면 Authorization 헤더로 보낸다', async () => {
    setAccessToken('mock-access.1.1')
    let sent: string | null = null
    server.use(
      http.get('*/api/users/me', ({ request }) => {
        sent = request.headers.get('Authorization')
        return HttpResponse.json({ id: 1, nickname: '코다리', role: 'USER' })
      }),
    )

    await api.GET('/api/users/me')

    expect(sent).toBe('Bearer mock-access.1.1')
  })

  it('토큰이 없으면 헤더를 붙이지 않는다', async () => {
    let sent: string | null = 'not-called'
    server.use(
      http.get('*/api/problems', ({ request }) => {
        sent = request.headers.get('Authorization')
        return HttpResponse.json({ content: [], totalElements: 0 })
      }),
    )

    await api.GET('/api/problems')

    // 비로그인도 문제 목록을 본다(COM-05). 빈 Bearer를 보내면 서버가 무효 토큰으로 읽는다.
    expect(sent).toBeNull()
  })

  /** 401 한 번은 "토큰이 만료됐다"는 뜻이다. 사용자가 아무것도 하지 않아도 이어져야 한다. */
  it('401을 받으면 갱신하고 원래 요청을 다시 보낸다', async () => {
    setAccessToken('expired')
    let attempts = 0
    server.use(
      http.post('*/api/auth/refresh', () => HttpResponse.json({ accessToken: 'fresh' })),
      http.get('*/api/users/me', ({ request }) => {
        attempts += 1
        if (request.headers.get('Authorization') !== 'Bearer fresh') {
          return HttpResponse.json({ status: 401 }, { status: 401 })
        }
        return HttpResponse.json({ id: 1, nickname: '코다리', role: 'USER' })
      }),
    )

    const result = await api.GET('/api/users/me')

    expect(attempts).toBe(2)
    expect(result.data).toEqual({ id: 1, nickname: '코다리', role: 'USER' })
  })

  it('갱신도 실패하면 원래의 401을 그대로 내보낸다', async () => {
    setAccessToken('expired')
    server.use(
      http.post('*/api/auth/refresh', () => HttpResponse.json({ status: 401 }, { status: 401 })),
      http.get('*/api/users/me', () => HttpResponse.json({ status: 401 }, { status: 401 })),
    )

    const result = await api.GET('/api/users/me')

    // 이 401을 받은 쪽이 세션을 버려 로그인 화면으로 간다 (features/auth/session.ts).
    expect(result.response.status).toBe(401)
  })

  /**
   * 계약: "프런트는 이 401로 토큰 갱신을 시도하지 않는다". 비밀번호가 틀린 것을 세션
   * 만료로 보면 갱신 요청만 늘어난다.
   */
  it('로그인의 401로는 갱신하지 않는다', async () => {
    let refreshes = 0
    server.use(
      http.post('*/api/auth/refresh', () => {
        refreshes += 1
        return HttpResponse.json({ accessToken: 'fresh' })
      }),
      http.post('*/api/auth/login', () => HttpResponse.json({ status: 401 }, { status: 401 })),
    )

    const result = await api.POST('/api/auth/login', {
      body: { email: 'user@codari.test', password: '틀림' },
    })

    expect(result.response.status).toBe(401)
    expect(refreshes).toBe(0)
  })

  /**
   * 응답을 받은 뒤의 요청은 본문을 이미 흘려보낸 뒤라 그대로 다시 보낼 수 없다. 보내기
   * 전에 떠 둔 사본이 있어야 제출 같은 POST도 재시도된다.
   */
  it('본문이 있는 요청도 같은 본문으로 다시 보낸다', async () => {
    setAccessToken('expired')
    const bodies: unknown[] = []
    server.use(
      http.post('*/api/auth/refresh', () => HttpResponse.json({ accessToken: 'fresh' })),
      http.post('*/api/submissions', async ({ request }) => {
        bodies.push(await request.json())
        if (request.headers.get('Authorization') !== 'Bearer fresh') {
          return HttpResponse.json({ status: 401 }, { status: 401 })
        }
        return HttpResponse.json({ id: 7 }, { status: 202 })
      }),
    )

    const result = await api.POST('/api/submissions', {
      body: { problemId: 1, language: 'PYTHON', sourceCode: 'print(1)' },
    })

    expect(result.data?.id).toBe(7)
    expect(bodies).toHaveLength(2)
    expect(bodies[1]).toEqual(bodies[0])
  })
})

describe('세션 정리', () => {
  afterEach(() => setAccessToken(null))

  /**
   * 전에는 쿠키 세션이라 탭끼리 함께 끊겼다. access token이 탭마다의 메모리에 있어,
   * 한 탭에서 로그아웃해도 다른 탭은 만료될 때까지(최대 30분) 인증 요청이 계속 성공한다 —
   * 서버의 로그아웃은 refresh 계열만 폐기한다. 공용 컴퓨터에서 위험하다.
   */
  it('다른 탭이 로그아웃하면 이 탭의 토큰도 버린다', async () => {
    setAccessToken('still-valid')
    const channel = new BroadcastChannel('codingmon-session')

    try {
      channel.postMessage('ended')

      // BroadcastChannel은 다음 태스크에 전달된다. 한 틱만 기다리면 안 된다 — 머신이
      // 바쁠 때(실제 타이머를 쓰는 폴링 테스트와 같이 돌 때) 한 틱 안에 안 오고,
      // 전체 실행에서만 간헐적으로 실패했다.
      await vi.waitFor(() => expect(getAccessToken()).toBeNull())
    } finally {
      channel.close()
    }
  })

  /** 로그아웃마다 세대가 올라가야 떠 있던 갱신 응답을 버릴 수 있다. */
  it('로그아웃하면 세대가 올라간다', () => {
    const before = getGeneration()

    endSession()

    expect(getGeneration()).toBeGreaterThan(before)
    expect(getAccessToken()).toBeNull()
  })
})

/**
 * 사본을 지우는 곳이 둘이어야 한다 (api/client.ts의 pending).
 *
 * onResponse에서만 지웠더니 네트워크 오류나 abort로 fetch가 던질 때 사본이 남아, API에
 * 닿지 못하는 동안 제출 본문까지 든 Request가 쌓였다. 쌓이는 것을 직접 세는 대신 "던진
 * 뒤에도 다음 요청이 멀쩡하다"로 본다 — Map이 새면 같은 id가 재사용되며 어긋난다.
 */
describe('요청 사본 정리', () => {
  afterEach(() => setAccessToken(null))

  it('fetch가 던져도 사본을 남기지 않는다', async () => {
    setAccessToken('mock-access.1.1')
    server.use(
      // HttpResponse.error()는 **진짜 네트워크 실패**를 만든다. 핸들러에서 throw하면
      // MSW가 500 응답으로 바꿔 버려 onResponse가 돌고, 오류 경로를 지나지 않는다.
      http.get('*/api/users/me', () => HttpResponse.error()),
    )
    const before = pendingRequestCount()

    // 네트워크 실패는 그대로 던져진다 — onError가 Response를 돌려주지 않기 때문이다.
    await expect(api.GET('/api/users/me')).rejects.toThrow()

    expect(pendingRequestCount()).toBe(before)
  })

  it('응답이 와도 사본을 남기지 않는다', async () => {
    setAccessToken('mock-access.1.1')
    const before = pendingRequestCount()

    await api.GET('/api/users/me')

    expect(pendingRequestCount()).toBe(before)
  })
})

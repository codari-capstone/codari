import { onlineManager, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import { server } from '@/mocks/server'
import { ME_QUERY_KEY, meQuery } from './authQuery'
import { useAuth } from './useAuth'

// 오프라인 테스트가 플래그를 남기면 다른 테스트의 요청이 멈춘다.
afterEach(() => onlineManager.setOnline(true))

function renderUseAuth(seed?: (client: QueryClient) => void) {
  // retry를 끈 클라이언트를 테스트마다 새로 만든다. 공유하면 앞 테스트의
  // ['me'] 캐시가 남아 다음 테스트가 이미 답을 아는 상태로 시작한다.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // seed는 마운트 전에 넣어야 "이미 받아 둔 세션이 있는 상태"가 된다.
  seed?.(client)
  return {
    client,
    ...renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }),
  }
}

describe('useAuth', () => {
  // 오프라인에서는 isPending과 isLoading이 갈라진다. 이때 isLoading을 쓰면
  // 세션을 모르는데도 "비로그인 확정"으로 보여, 로그인한 사용자가 로그인 화면으로 밀려난다.
  it('오프라인으로 요청이 멈춰 있어도 isLoading이 켜져 있다', async () => {
    onlineManager.setOnline(false)

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(() => ({ auth: useAuth(), query: useQuery(meQuery()) }), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    })

    await waitFor(() => expect(result.current.query.fetchStatus).toBe('paused'))
    expect(result.current.auth.isLoading).toBe(true)
    expect(result.current.auth.isAuthenticated).toBe(false)
    expect(result.current.auth.user).toBeNull()
  })

  it('세션을 모르는 동안 isLoading이 켜진다', () => {
    const { result } = renderUseAuth()

    expect(result.current.isLoading).toBe(true)
    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('401이면 비로그인이다', async () => {
    server.use(
      http.get('*/api/me', () =>
        HttpResponse.json({ status: 401, title: 'Unauthorized' }, { status: 401 }),
      ),
    )

    const { result } = renderUseAuth()

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('200이면 사용자와 isAuthenticated를 돌려준다', async () => {
    server.use(
      http.get('*/api/me', () => HttpResponse.json({ id: 3, nickname: '수진', role: 'ADMIN' })),
    )

    const { result } = renderUseAuth()

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))
    expect(result.current.user).toEqual({ id: 3, nickname: '수진', role: 'ADMIN' })
    expect(result.current.isLoading).toBe(false)
  })

  it('이미 받아 둔 세션이 있으면 재조회가 500이어도 로그인 상태를 지킨다', async () => {
    // staleTime(60초)이 지난 뒤 다시 마운트되며 나간 /api/me가 500으로 끝나는 상황이다.
    // TanStack Query는 오류가 나도 이전 data를 지우지 않는다. 그걸 그대로 쓴다 — 서버가
    // 한 번 흔들릴 때마다 쓰던 사람을 로그아웃시키는 쪽이 더 나쁘다. 첫 조회가 실패하는
    // 아래 테스트와 판단이 갈리는 지점이라 둘을 나란히 둔다.
    server.use(
      http.get('*/api/me', () =>
        HttpResponse.json({ status: 500, title: 'Server Error' }, { status: 500 }),
      ),
    )
    const cached = { id: 1, nickname: '코다리', role: 'USER' as const }

    const { result, client } = renderUseAuth((c) => {
      c.setQueryData(ME_QUERY_KEY, cached, { updatedAt: Date.now() - 120_000 })
    })

    await waitFor(() => expect(client.getQueryState(ME_QUERY_KEY)?.status).toBe('error'))
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user).toEqual(cached)
  })

  it('/api/me가 500이면 비로그인으로 다룬다', async () => {
    // 기본 핸들러도 401로 답하므로, 덮어쓴 핸들러가 실제로 불렸는지 확인한다.
    let hit = false
    server.use(
      http.get('*/api/me', () => {
        hit = true
        return HttpResponse.json({ status: 500, title: 'Server Error' }, { status: 500 })
      }),
    )

    const { result } = renderUseAuth()

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(hit).toBe(true)
    expect(result.current.isAuthenticated).toBe(false)
  })
})

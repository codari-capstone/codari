import { onlineManager, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import { server } from '@/mocks/server'
import { meQuery } from './authQuery'
import { useAuth } from './useAuth'

// 오프라인 테스트가 플래그를 남기면 다른 테스트의 요청이 멈춘다.
afterEach(() => onlineManager.setOnline(true))

function renderUseAuth() {
  // retry를 끈 클라이언트를 테스트마다 새로 만든다. 공유하면 앞 테스트의
  // ['me'] 캐시가 남아 다음 테스트가 이미 답을 아는 상태로 시작한다.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderHook(() => useAuth(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
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

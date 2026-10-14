import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '@/mocks/server'
import { useAuth } from './useAuth'

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
    server.use(
      http.get('*/api/me', () =>
        HttpResponse.json({ status: 500, title: 'Server Error' }, { status: 500 }),
      ),
    )

    const { result } = renderUseAuth()

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isAuthenticated).toBe(false)
  })
})

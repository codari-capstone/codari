import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { server } from '@/mocks/server'
import * as useAuthModule from '@/features/auth/useAuth'
import { AppHeader } from './AppHeader'
import { ThemeProvider } from './ThemeProvider'

// vite.config.ts에 restoreMocks가 없다. 파일마다 직접 되돌린다.
afterEach(() => vi.restoreAllMocks())

function mockAuth(state: Partial<ReturnType<typeof useAuthModule.useAuth>>) {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    ...state,
  })
}

function renderHeader() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <MemoryRouter>
          <AppHeader />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

describe('AppHeader', () => {
  it('로고와 메뉴 3개를 보여 준다', () => {
    renderHeader()

    expect(screen.getByRole('link', { name: 'Codari' })).toHaveAttribute('href', '/problems')
    expect(screen.getByRole('link', { name: '문제' })).toHaveAttribute('href', '/problems')
    expect(screen.getByRole('link', { name: '제출 기록' })).toHaveAttribute('href', '/submissions')
    expect(screen.getByRole('link', { name: '내 학습' })).toHaveAttribute('href', '/me/report')
  })

  it('테마 전환 버튼이 있다', () => {
    renderHeader()
    expect(screen.getByRole('button', { name: '다크 모드로 전환' })).toBeInTheDocument()
  })

  it('비로그인이면 로그인 링크를 보여 준다', () => {
    mockAuth({})
    renderHeader()

    expect(screen.getByRole('link', { name: '로그인' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /사용자 메뉴/ })).not.toBeInTheDocument()
  })

  it('세션을 모르는 동안에는 로그인 버튼도 사용자 메뉴도 보이지 않는다', () => {
    mockAuth({ isLoading: true })
    renderHeader()

    expect(screen.queryByRole('link', { name: '로그인' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /사용자 메뉴/ })).not.toBeInTheDocument()
  })

  it('세션을 모르는 동안에는 로그인 버튼 자리만큼 빈 칸을 잡아 둔다', () => {
    mockAuth({ isLoading: true })
    const { container } = renderHeader()

    // jsdom에는 레이아웃이 없어 크기를 잴 수 없다. 자리 잡는 요소의 클래스로 확인한다.
    expect(container.querySelector('[aria-hidden="true"].min-h-11.w-14')).toBeInTheDocument()
  })

  it('USER에게는 관리자 링크를 보여 주지 않는다', () => {
    mockAuth({ user: { id: 1, nickname: '코다리', role: 'USER' }, isAuthenticated: true })
    renderHeader()

    expect(screen.getByRole('button', { name: /사용자 메뉴/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '관리자' })).not.toBeInTheDocument()
  })

  it('ADMIN에게만 관리자 링크를 보여 준다 (COM-05)', () => {
    mockAuth({ user: { id: 2, nickname: '관리자', role: 'ADMIN' }, isAuthenticated: true })
    renderHeader()

    expect(screen.getByRole('link', { name: '관리자' })).toHaveAttribute('href', '/admin')
  })

  it('비로그인에게도 제출 기록·내 학습 링크는 보인다', () => {
    // COM-05가 숨기라고 한 것은 관리자 메뉴뿐이다. 누르면 로그인으로 갔다가 돌아온다.
    mockAuth({})
    renderHeader()

    expect(screen.getByRole('link', { name: '제출 기록' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '내 학습' })).toBeInTheDocument()
  })

  it('사용자 메뉴의 로그아웃을 고르면 로그아웃을 요청한다 (COM-03)', async () => {
    let requested = false
    server.use(
      http.post('*/api/auth/logout', () => {
        requested = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    mockAuth({ user: { id: 1, nickname: '코다리', role: 'USER' }, isAuthenticated: true })
    const user = userEvent.setup()
    renderHeader()

    await user.click(screen.getByRole('button', { name: /사용자 메뉴/ }))
    await user.click(await screen.findByRole('menuitem', { name: '로그아웃' }))

    await vi.waitFor(() => expect(requested).toBe(true))
  })
})

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
})

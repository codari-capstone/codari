import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createQueryClient } from '@/app/queryClient'
import { Component as NotFoundPage } from '@/app/NotFoundPage'
import { Component as ProblemListPage } from '@/features/problems/ProblemListPage'

/**
 * 개발환경이 제대로 묶였는지 확인하는 스모크 테스트.
 * 기능 테스트는 각 features/ 폴더에 담당자가 추가한다.
 */
describe('개발환경', () => {
  // ProblemListPage는 #21(LIST-01~04)에서 useSearchParams·useQuery를 쓰는 실제
  // 화면이 됐다. Router·QueryClient 없이 그냥 렌더하면 더 이상 성립하지 않는다 —
  // 그건 이 화면이 맨몸으로 못 떠서가 아니라 모든 라우트 화면이 그렇다.
  it('@/ 경로 별칭으로 컴포넌트를 불러와 렌더링한다', () => {
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter>
          <ProblemListPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByRole('heading', { name: '문제 목록' })).toBeInTheDocument()
  })

  it('React Router 컨텍스트에서 링크를 렌더링한다', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: '문제 목록으로' })).toHaveAttribute('href', '/problems')
  })

  it('QueryClient에 프로젝트 기본값이 적용된다', () => {
    const { queries } = createQueryClient().getDefaultOptions()
    expect(queries?.staleTime).toBe(30_000)
    expect(queries?.refetchOnWindowFocus).toBe(false)
  })
})

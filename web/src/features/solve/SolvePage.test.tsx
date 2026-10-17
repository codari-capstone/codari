import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/app/queryClient'
import { server } from '@/mocks/server'
import { Component as SolvePage } from './SolvePage'

function renderSolve(url = '/problems/1') {
  const router = createMemoryRouter([{ path: '/problems/:id', Component: SolvePage }], {
    initialEntries: [url],
  })

  const { container } = render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return container
}

/**
 * 넓은 화면으로 바꾼다 (SOLVE-10).
 *
 * jsdom에는 CSS도 실제 폭도 없다. useWideLayout이 matchMedia만 보므로 그것만 바꾼다.
 * setup.ts의 기본 stub은 matches: false라서, 바꾸지 않은 테스트는 모두 좁은 화면이다.
 */
function asWide() {
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: true,
    media: '(min-width: 64rem)',
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as MediaQueryList)
}

describe('SolvePage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('제목·난이도·제한을 보여 준다', async () => {
    renderSolve()

    expect(await screen.findByRole('heading', { level: 1, name: '두 수의 합' })).toBeInTheDocument()
    expect(screen.getByText('쉬움')).toBeInTheDocument()
    // 제한은 첫 언어(계약이 보장하는 PYTHON)의 값이다. 언어 선택은 SOLVE-04(2차)다.
    expect(screen.getByText('Python · 2초 · 256MB')).toBeInTheDocument()
  })

  it('지문의 수식을 KaTeX로 그린다', async () => {
    const container = renderSolve()
    await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

    // $O(n)$이 글자 그대로 남으면 지문이 읽히지 않는다. KaTeX는 .katex를 만든다.
    expect(container.querySelector('.katex')).not.toBeNull()
    expect(screen.queryByText(/\$O\(n\)\$/)).not.toBeInTheDocument()
  })

  it('입출력 형식은 평문으로 보여 준다', async () => {
    renderSolve()
    await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

    // 계약에서 이 둘만 이름에 Markdown이 없다(Statement.tsx 주석). 줄바꿈은 살린다.
    expect(
      screen.getByText(/첫 줄에 원소 개수 N과 목표값 T가 공백으로 주어진다\./),
    ).toBeInTheDocument()
    expect(screen.getByText(/두 위치를 오름차순으로 한 줄에 출력한다/)).toBeInTheDocument()
  })

  it('예제를 클립보드로 복사한다', async () => {
    const user = userEvent.setup()
    renderSolve()
    await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

    await user.click(screen.getByRole('button', { name: '예제 1 입력 복사' }))

    expect(await navigator.clipboard.readText()).toBe('4 9\n2 7 11 15\n')
    // 눌렀는지 알 수 있어야 한다. 아이콘만 바꾸면 스크린 리더가 모른다.
    expect(screen.getByRole('button', { name: '예제 1 입력 복사됨' })).toBeInTheDocument()
  })

  it('출처·라이선스·버전을 보여 준다', async () => {
    renderSolve()
    await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

    const source = screen.getByRole('link', { name: 'LeetCode 1. Two Sum' })
    expect(source).toHaveAttribute('href', 'https://leetcode.com/problems/two-sum/')
    // 외부 사이트다. referrer를 보내지 않는다.
    expect(source).toHaveAttribute('rel', 'noreferrer')
    expect(screen.getByText('라이선스: CC BY-SA 4.0')).toBeInTheDocument()
    expect(screen.getByText('문제 버전: v1')).toBeInTheDocument()
  })

  it('출처와 라이선스가 없으면 그 줄을 빼고 버전만 남긴다', async () => {
    renderSolve('/problems/2')

    expect(
      await screen.findByRole('heading', { level: 1, name: '문자열 뒤집기' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/^출처:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^라이선스:/)).not.toBeInTheDocument()
    expect(screen.getByText('문제 버전: v1')).toBeInTheDocument()
  })

  it('출처에 링크가 없으면 이름만 글자로 보여 준다', async () => {
    renderSolve('/problems/3')
    await screen.findByRole('heading', { level: 1, name: '올바른 괄호' })

    expect(screen.getByText('출처: 직접 제작')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '직접 제작' })).not.toBeInTheDocument()
  })

  it('제약이 비어 있으면 제약 절을 그리지 않는다', async () => {
    renderSolve('/problems/2')
    await screen.findByRole('heading', { level: 1, name: '문자열 뒤집기' })

    expect(screen.queryByRole('heading', { name: '제약' })).not.toBeInTheDocument()
    // 1번은 제약이 있으므로 이 단언이 "늘 없다"로 통과하지 않는다 (아래 테스트가 짝이다)
  })

  it('제약이 있으면 제약 절을 그린다', async () => {
    renderSolve()
    await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

    expect(screen.getByRole('heading', { name: '제약' })).toBeInTheDocument()
  })

  it('없는 번호는 404 문구로 끝낸다', async () => {
    renderSolve('/problems/999')

    // 앱 기본값이 retry: 1이라 첫 404 뒤 재시도 지연(약 1초)을 거쳐야 error 상태가 된다.
    // findByRole 기본 타임아웃(1000ms)은 그 경계에 걸려 간헐적으로 떨어진다.
    expect(
      await screen.findByRole('heading', { level: 1, name: '찾을 수 없습니다' }, { timeout: 3000 }),
    ).toBeInTheDocument()
  })

  // 계약은 정수가 아닌 id에 400을 주지만, 사용자에게는 없는 문제와 같은 일이다.
  // 보낼 필요가 없는 요청을 보내지 않는다 — 기다림 없이 바로 그려지는 것이 그 증거다.
  it('정수가 아닌 주소는 요청하지 않고 404 문구를 보여 준다', async () => {
    let calls = 0
    server.use(
      http.get('*/api/problems/:id', () => {
        calls += 1
        return HttpResponse.json({ status: 400 }, { status: 400 })
      }),
    )

    renderSolve('/problems/abc')

    expect(screen.getByRole('heading', { level: 1, name: '찾을 수 없습니다' })).toBeInTheDocument()
    // 스켈레톤이 없다 = 기다리지 않았다
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    // 요청은 effect에서 나간다. 마이크로태스크 한 번으로는 MSW까지 닿지 않아,
    // 매크로태스크를 한 번 보낸 뒤에 센다 — 이게 없으면 이 단언이 공짜로 통과한다.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls).toBe(0)
  })

  describe('반응형 배치 (SOLVE-10)', () => {
    it('좁은 화면은 지문과 코드 작성을 탭으로 나눈다', async () => {
      const user = userEvent.setup()
      renderSolve()
      await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

      expect(screen.getByRole('tab', { name: '지문' })).toHaveAttribute('data-state', 'active')
      expect(screen.queryByText('코드 에디터는 준비 중입니다.')).not.toBeInTheDocument()

      await user.click(screen.getByRole('tab', { name: '코드 작성' }))

      expect(screen.getByText('코드 에디터는 준비 중입니다.')).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: '예제' })).not.toBeInTheDocument()
    })

    it('넓은 화면은 탭 없이 지문과 에디터를 함께 보여 준다', async () => {
      asWide()
      renderSolve()
      await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

      expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: '예제' })).toBeInTheDocument()
      expect(screen.getByText('코드 에디터는 준비 중입니다.')).toBeInTheDocument()
    })
  })
})

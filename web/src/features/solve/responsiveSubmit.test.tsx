import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/app/queryClient'
import { ThemeProvider } from '@/app/ThemeProvider'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { server } from '@/mocks/server'
import { Component as SolvePage } from './SolvePage'

// 폭 전환을 흉내 낸다. useWideLayout이 effect 안에서 받은 객체의 matches를 다시 읽으므로,
// 그 객체가 살아 있는 상태로 값이 바뀌어야 한다 — getter로 두고 변수만 바꾼다.
let wide = false
const changeListeners: ((event: MediaQueryListEvent) => void)[] = []

function mockMatchMedia() {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
    const isWide = query.includes('64rem')
    return {
      get matches() {
        return isWide ? wide : false
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, cb: (event: MediaQueryListEvent) => void) => {
        if (isWide) changeListeners.push(cb)
      },
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList
  })
}

/**
 * 폭이 바뀌는 동안의 제출 (SOLVE-09 + SOLVE-10).
 *
 * 에디터 칸은 넓은 화면의 grid와 좁은 화면의 Tabs라는 **서로 다른 트리**에 들어가므로,
 * 폭이 64rem을 넘나들면 그 안의 컴포넌트가 새로 마운트된다. 제출 상태를 그 안에 두면
 * 버튼이 idle로 되살아나 다시 열리고, 사용자가 실패한 줄 알고 한 번 더 누르면 시도 횟수가
 * 두 번 오른다 — 되돌릴 수 없다.
 *
 * 이 파일만 이 경우를 본다. SolvePage.test.tsx의 다른 테스트는 폭을 고정해 두고 보기
 * 때문에 전환 구간을 지나지 않는다.
 */
describe('폭 전환 중 제출', () => {
  afterEach(() => vi.restoreAllMocks())

  it('제출이 떠 있는 동안 폭이 바뀌어도 결과 화면으로 간다', async () => {
    const user = userEvent.setup()
    let calls = 0
    // 응답을 테스트가 열어 줄 때까지 붙잡는다. 시간으로 늦추면 전체 스위트가 느릴 때
    // 응답이 먼저 도착해 전환 구간을 지나쳐 버린다 — 실제로 그렇게 깨졌다.
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.post('*/api/submissions', async () => {
        calls += 1
        await gate
        return HttpResponse.json({ id: 9 }, { status: 202 })
      }),
    )
    wide = false
    changeListeners.length = 0
    mockMatchMedia()
    const client = createQueryClient()
    client.setQueryData(ME_QUERY_KEY, { id: 1, nickname: '코다리', role: 'USER' })
    const router = createMemoryRouter(
      [
        { path: '/problems/:id', Component: SolvePage },
        { path: '/submissions/:id', element: <h1>제출 결과 도착</h1> },
      ],
      { initialEntries: ['/problems/1'] },
    )
    render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ThemeProvider>,
    )
    await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

    await user.click(screen.getByRole('button', { name: '제출' }))
    // 응답이 오기 전에 넓은 화면으로 넘어간다 (창 크기 조절·기기 회전).
    await act(async () => {
      wide = true
      changeListeners.forEach((cb) => cb({ matches: true } as MediaQueryListEvent))
    })

    // 새로 마운트된 버튼이 idle로 시작하면 여기서 다시 열린다 — 사용자가 한 번 더
    // 누르면 시도 횟수가 두 번 오른다.
    expect(screen.getByRole('button', { name: /제출/ })).toBeDisabled()

    await act(async () => {
      release()
    })

    expect(await screen.findByRole('heading', { name: '제출 결과 도착' })).toBeInTheDocument()
    expect(calls).toBe(1)
    // 기본 5초로는 모자라다. 솔브 페이지를 두 번 마운트하는 테스트라 혼자 돌면 1.5초지만,
    // 전체 스위트와 함께 돌면 3배가 넘는다 — 파일이 하나 늘 때마다 깨질 자리였다.
    // SubmissionResultPage.test.tsx의 무거운 테스트들과 같은 여유를 준다.
  }, 15_000)
})

import { QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/app/queryClient'
import { ProblemsLayout } from '@/app/ProblemsLayout'
import { ThemeProvider } from '@/app/ThemeProvider'
import * as useAuthModule from '@/features/auth/useAuth'
import { problems } from '@/mocks/fixtures/problems'
import { server } from '@/mocks/server'
import { PAGE_SIZE } from './problemListParams'
import { Component as ProblemListPage } from './ProblemListPage'

// AppShell -> AppHeader -> ThemeToggle이 useTheme을 쓴다. ThemeProvider 없이
// 렌더하면 모든 테스트가 "ProblemListPage가 비었다"가 아니라 테마 컨텍스트
// 부재로 깨져, 실패 이유가 Step 3에서 기대한 것과 달라진다.
function renderPage(initialUrl = '/problems') {
  const router = createMemoryRouter(
    [
      {
        Component: ProblemsLayout,
        children: [{ path: '/problems', Component: ProblemListPage }],
      },
      // 안내 링크를 눌러 보는 테스트가 있다. 라우트가 없으면 이동이 404로 떨어진다.
      { path: '/login', element: <h1>로그인 화면</h1> },
    ],
    { initialEntries: [initialUrl] },
  )

  render(
    <ThemeProvider>
      <QueryClientProvider client={createQueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  )

  return router
}

describe('ProblemListPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    // 공백-보존 테스트가 실패해 먼저 끝나도(finally 못 타면) 이후 테스트가 fake
    // timer를 물려받지 않도록 매번 실제 타이머로 되돌린다. 이미 실제 타이머면 no-op.
    vi.useRealTimers()
  })

  it('제목이 h1이다', async () => {
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: '문제 목록' })).toBeInTheDocument()
  })

  // AppShell이 중첩되면 헤더가 두 개가 된다
  it('헤더가 하나다', async () => {
    renderPage()

    expect(screen.getAllByRole('banner')).toHaveLength(1)
  })

  it('목록을 표로 보여 준다', async () => {
    renderPage()

    expect(await screen.findByRole('link', { name: '두 수의 합' })).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(PAGE_SIZE + 1) // 머리 1 + 한 페이지 20
  })

  it('결과 개수를 보여 준다', async () => {
    renderPage()

    // 보고 있는 페이지(20)가 아니라 전체(25)다.
    expect(await screen.findByText(`문제 ${problems.length}개`)).toBeInTheDocument()
  })

  it('필터가 걸리면 개수 문구가 바뀐다', async () => {
    renderPage('/problems?difficulty=HARD')

    expect(await screen.findByText(/조건에 맞는 문제 2개/)).toBeInTheDocument()
  })

  describe('페이지 나누기 (LIST-05)', () => {
    it('한 페이지에 20개까지만 보여 준다', async () => {
      renderPage()

      expect(await screen.findByRole('link', { name: '두 수의 합' })).toBeInTheDocument()
      expect(screen.getAllByRole('row')).toHaveLength(PAGE_SIZE + 1)
      // 21번째 문제는 2페이지에 있다.
      expect(
        screen.queryByRole('link', { name: `연습 문제 ${PAGE_SIZE + 1}` }),
      ).not.toBeInTheDocument()
    })

    it('다음 페이지로 가면 나머지를 보여 주고 주소에 남는다', async () => {
      const user = userEvent.setup()
      const router = renderPage()
      await screen.findByRole('link', { name: '두 수의 합' })

      await user.click(screen.getByRole('button', { name: '다음' }))

      expect(
        await screen.findByRole('link', { name: `연습 문제 ${PAGE_SIZE + 1}` }),
      ).toBeInTheDocument()
      expect(router.state.location.search).toBe('?page=2')
      // 나머지 5개. 머리 1줄을 더한다.
      expect(screen.getAllByRole('row')).toHaveLength(problems.length - PAGE_SIZE + 1)
      // 개수는 보고 있는 페이지가 아니라 전체다.
      expect(screen.getByText(`문제 ${problems.length}개`)).toBeInTheDocument()
    })

    it('주소의 page를 그대로 읽는다', async () => {
      renderPage('/problems?page=2')

      expect(
        await screen.findByRole('link', { name: `연습 문제 ${PAGE_SIZE + 1}` }),
      ).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: '두 수의 합' })).not.toBeInTheDocument()
    })

    // 2페이지를 보다가 필터를 걸면 결과가 2개로 줄어 2페이지는 빈 표가 된다.
    it('필터를 바꾸면 1페이지로 돌아간다', async () => {
      const user = userEvent.setup()
      const router = renderPage('/problems?page=2')
      await screen.findByRole('link', { name: `연습 문제 ${PAGE_SIZE + 1}` })

      await user.click(screen.getByRole('checkbox', { name: '어려움' }))

      await waitFor(() => expect(router.state.location.search).not.toContain('page=2'))
      expect(router.state.location.search).toContain('difficulty=HARD')
      expect(await screen.findByText(/조건에 맞는 문제 2개/)).toBeInTheDocument()
    })

    // 아래 '필터를 바꾸면' 테스트는 결과가 1페이지인 필터('어려움', 2건)를 써서,
    // 페이지가 리셋되지 않아도 범위 밖 자가 치유가 1페이지로 끌어다 준다 — 즉 리셋이
    // 빠져도 통과한다. 결과가 2페이지인 필터를 써서 그 구멍을 막는다.
    it('결과가 여러 페이지인 필터를 걸어도 1페이지로 돌아간다', async () => {
      // 풀이 상태 필터는 로그인한 사람에게만 보인다 (COM-05).
      vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
        user: { id: 1, nickname: '코다리', role: 'USER' },
        isAuthenticated: true,
        isLoading: false,
      })
      const user = userEvent.setup()
      const router = renderPage('/problems?page=2')
      await screen.findByRole('link', { name: `연습 문제 ${PAGE_SIZE + 1}` })

      // 채움 문제가 모두 '안 품'이라 결과가 21건(2페이지)이다. 2페이지에 머물면
      // 자가 치유가 돌지 않아 한 줄만 보인다.
      await user.click(screen.getByRole('checkbox', { name: '안 품' }))

      await waitFor(() => expect(router.state.location.search).toContain('status=UNSOLVED'))
      expect(router.state.location.search).not.toContain('page=')
      expect(await screen.findByRole('link', { name: '문자열 뒤집기' })).toBeInTheDocument()
    })

    // 묵은 응답(keepPreviousData)으로 페이지 수를 판단하면, 결과가 2건이던 필터에서
    // 유효한 page=2로 옮겨올 때 범위 밖이라 보고 1페이지로 끌어가며 히스토리까지 지운다.
    it('결과가 적던 필터에서 유효한 페이지로 옮겨도 끌려가지 않는다', async () => {
      const router = renderPage('/problems?difficulty=HARD')
      await screen.findByText(/조건에 맞는 문제 2개/)

      await act(async () => {
        await router.navigate('/problems?page=2')
      })

      expect(
        await screen.findByRole('link', { name: `연습 문제 ${PAGE_SIZE + 1}` }),
      ).toBeInTheDocument()
      expect(router.state.location.search).toBe('?page=2')
    })

    // 응답을 기다리는 동안 페이지 수를 1로 떨어뜨리면 이동 nav가 언마운트된다.
    // 그러면 '다음'에 있던 키보드 포커스가 body로 떨어지고, 표는 그대로 남은 채
    // 그 아래 버튼 줄만 사라졌다 나타나 화면이 뛴다.
    it('다음 페이지를 기다리는 동안에도 페이지 이동이 사라지지 않는다', async () => {
      let release = () => {}
      server.use(
        http.get('*/api/problems', async ({ request }) => {
          const page = Number(new URL(request.url).searchParams.get('page') ?? 0)
          // 2페이지 응답만 붙잡아 placeholder 구간을 길게 만든다.
          if (page > 0) await new Promise<void>((resolve) => (release = resolve))
          return HttpResponse.json({
            content: problems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
            totalElements: problems.length,
          })
        }),
      )
      const user = userEvent.setup()
      renderPage()
      await screen.findByRole('link', { name: '두 수의 합' })

      await user.click(screen.getByRole('button', { name: '다음' }))

      expect(screen.getByRole('navigation', { name: '페이지' })).toBeInTheDocument()

      await act(async () => release())
      expect(
        await screen.findByRole('link', { name: `연습 문제 ${PAGE_SIZE + 1}` }),
      ).toBeInTheDocument()
    })

    it('지금 보고 있는 페이지 번호를 다시 눌러도 맨 위로 올리지 않는다', async () => {
      const scrollTo = vi.spyOn(window, 'scrollTo')
      const user = userEvent.setup()
      renderPage('/problems?page=2')
      await screen.findByRole('link', { name: `연습 문제 ${PAGE_SIZE + 1}` })

      await user.click(screen.getByRole('button', { name: '2페이지' }))

      expect(scrollTo).not.toHaveBeenCalled()

      // 다른 페이지로 갈 때는 올려야 한다 — 위 기대가 '늘 안 올린다'로 통과하지 않게 둔다.
      await user.click(screen.getByRole('button', { name: '1페이지' }))

      expect(scrollTo).toHaveBeenCalled()
    })

    it('정렬을 바꾸면 1페이지로 돌아간다', async () => {
      const user = userEvent.setup()
      const router = renderPage('/problems?page=2')
      await screen.findByRole('link', { name: `연습 문제 ${PAGE_SIZE + 1}` })

      await user.click(screen.getByRole('button', { name: /난이도/ }))

      await waitFor(() => expect(router.state.location.search).not.toContain('page=2'))
    })

    // 손으로 고친 주소나, 문제가 지워진 뒤의 옛 링크다. 서버는 오류가 아니라 빈 표를
    // 주므로(#109) 화면이 마지막 페이지로 되돌린다.
    it('없는 페이지면 마지막 페이지로 돌린다', async () => {
      const router = renderPage('/problems?page=99')

      expect(
        await screen.findByRole('link', { name: `연습 문제 ${PAGE_SIZE + 1}` }),
      ).toBeInTheDocument()
      expect(router.state.location.search).toBe('?page=2')
      // 되돌리는 동안 "문제가 없다"고 하지 않는다.
      expect(screen.queryByText('아직 등록된 문제가 없습니다')).not.toBeInTheDocument()
    })

    it('한 페이지로 끝나면 페이지 이동을 띄우지 않는다', async () => {
      renderPage('/problems?difficulty=HARD')

      await screen.findByText(/조건에 맞는 문제 2개/)
      expect(screen.queryByRole('navigation', { name: '페이지' })).not.toBeInTheDocument()
    })
  })

  // 개수는 응답의 totalElements에서 읽어야 한다. MSW 핸들러는 totalElements를
  // content.length와 같게 주므로 둘을 바꿔 써도 다른 테스트가 잡지 못한다. 서버가
  // 다른 값을 주는 경우를 만들어 계약 필드를 읽는지 본다 — 나중에 페이지 나누기가
  // 붙으면 content.length는 한 페이지 크기가 되어 표시가 틀린다.
  it('개수는 content 길이가 아니라 totalElements에서 읽는다', async () => {
    server.use(
      http.get('*/api/problems', () =>
        HttpResponse.json({ content: [problems[0]], totalElements: 99 }),
      ),
    )
    renderPage()

    expect(await screen.findByText(/문제 99개/)).toBeInTheDocument()
  })

  it('첫 로드에는 기다리는 중임을 알린다', () => {
    renderPage()

    expect(screen.getByRole('status')).toHaveTextContent('불러오는 중')
  })

  it('검색어를 입력하면 쿼리에 실려 나간다', async () => {
    let captured = ''
    server.use(
      http.get('*/api/problems', ({ request }) => {
        captured = new URL(request.url).search
        return HttpResponse.json({ content: [], totalElements: 0 })
      }),
    )
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByRole('searchbox', { name: '제목으로 검색' }), '괄호')

    await waitFor(() => {
      expect(captured).toContain('keyword=')
    })
    expect(decodeURIComponent(captured)).toContain('keyword=괄호')
  })

  // 글자마다 히스토리가 쌓이면 뒤로가기가 한 글자씩만 지운다
  it('검색어 입력은 히스토리를 쌓지 않는다', async () => {
    const user = userEvent.setup()
    const router = renderPage()

    await user.type(screen.getByRole('searchbox', { name: '제목으로 검색' }), '괄호')

    await waitFor(() => {
      expect(router.state.location.search).toContain('keyword')
    })

    expect(router.state.historyAction).toBe('REPLACE')
  })

  // parseParams가 keyword를 trim해서 돌려주므로, URL 동기화 effect가 trim 전 값과
  // 비교하면 "밖에서 바뀌었다"고 오판해 입력란의 끝 공백을 지워 버린다. 그러면
  // '두 ' 다음에 '수'를 이어 쳐도 '두수'가 되어 다단어 제목을 전혀 찾지 못한다.
  //
  // 실제 타이머 + waitFor로는 디바운스의 setSearchParams가 반영되는 순간 waitFor가
  // 바로 통과해 버려, 그 뒤에 이어지는 "URL이 밖에서 바뀌면 입력란을 맞춘다" 동기화
  // effect가 아직 안 돈 상태를 본다 — 입력란 쪽 단언이 버그가 있어도 절대 실패하지
  // 않는 장식용 단언이 된다. fake timer로 디바운스와 그 뒤에 이어지는 동기화 effect까지
  // 전부 흘려보낸 뒤에 두 단언을 확인해야, 입력란 쪽 단언도 실제로 버그를 잡는다.
  // user.type이 아니라 fireEvent.change를 쓰는 이유: userEvent는 키 입력 사이의 지연을
  // 내부적으로 Promise/타이머로 처리하는데(delay: null로도 마찬가지), 이게 fake timer
  // 아래서 act와 얽혀 영원히 멈춘다(실제로 재현해 8초 타임아웃으로 확인). 이 테스트는
  // "입력값이 최종적으로 무엇인가"만 보므로 한 번의 change 이벤트로도 충분하다.
  it('단어 뒤에 공백을 입력해도 입력란의 공백이 지워지지 않는다', async () => {
    vi.useFakeTimers()
    try {
      const router = renderPage()

      fireEvent.change(screen.getByRole('searchbox', { name: '제목으로 검색' }), {
        target: { value: '두 ' },
      })

      // 디바운스(300ms) 타이머를 돌리는 것만으로는 부족하다 — 그 콜백이 부르는
      // setSearchParams가 리렌더를 일으키고, 그 리렌더가 동기화 effect를 다시
      // 돈다. act로 감싸야 React가 그 체인을 전부 커밋·플러시한다.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400)
      })

      // URL은 trim된 값만 들고 있어야 한다 (parseParams 계약, COM-05와 무관하게 적용)
      expect(router.state.location.search).toBe(`?keyword=${encodeURIComponent('두')}`)
      // 입력란은 사용자가 친 그대로, 끝 공백이 남아 있어야 한다
      expect(screen.getByRole('searchbox', { name: '제목으로 검색' })).toHaveValue('두 ')
    } finally {
      vi.useRealTimers()
    }
  })

  // 필터만 걸린 주소(keyword가 처음부터 '')에서 초기화하면 params.keyword가 변하지 않아
  // URL 동기화 effect가 draft를 두고, 디바운스가 검색어를 되살린다. fake timer로 디바운스
  // 뒤까지 흘려보낸 다음 URL과 입력란을 각각 확인한다.
  it('필터 초기화는 아직 URL에 안 쓴 검색어도 되살리지 않는다', async () => {
    vi.useFakeTimers()
    try {
      const router = renderPage('/problems?difficulty=HARD')
      const box = screen.getByRole('searchbox', { name: '제목으로 검색' })

      fireEvent.change(box, { target: { value: '합' } })
      // 디바운스(300ms)가 끝나기 전에 초기화를 누른다
      fireEvent.click(screen.getAllByRole('link', { name: '필터 초기화' })[0])
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400)
      })

      expect(router.state.location.search).toBe('')
      expect(box).toHaveValue('')
    } finally {
      vi.useRealTimers()
    }
  })

  // 초기화 링크는 두 곳(사이드바, 0건 빈 상태)에 있다. 본문 쪽이 state를 잃어도 사이드바
  // 테스트는 통과하므로 따로 확인한다. 사이드바는 main 밖이라 main으로 좁히면 본문 링크다.
  it('0건 빈 상태의 필터 초기화도 입력 중인 검색어를 되살리지 않는다', async () => {
    const router = renderPage('/problems?difficulty=EASY&tag=dp')
    await screen.findByText('조건에 맞는 문제가 없습니다')
    vi.useFakeTimers()
    try {
      const box = screen.getByRole('searchbox', { name: '제목으로 검색' })

      fireEvent.change(box, { target: { value: '합' } })
      fireEvent.click(within(screen.getByRole('main')).getByRole('link', { name: '필터 초기화' }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400)
      })

      expect(router.state.location.search).toBe('')
      expect(box).toHaveValue('')
    } finally {
      vi.useRealTimers()
    }
  })

  // 초기화 감지를 "쿼리가 비었는가"로 하면 마지막 필터를 체크 해제하는 일반 클릭에서도
  // 입력 중인 검색어가 죽는다. 이 경우는 검색어가 살아 URL에 반영되어야 한다.
  it('마지막 필터를 풀어도 입력 중인 검색어는 남아 URL에 반영된다', async () => {
    vi.useFakeTimers()
    try {
      const router = renderPage('/problems?difficulty=HARD')
      const box = screen.getByRole('searchbox', { name: '제목으로 검색' })

      fireEvent.change(box, { target: { value: '합' } })
      fireEvent.click(screen.getByRole('checkbox', { name: '어려움' }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400)
      })

      expect(router.state.location.search).toBe(`?keyword=${encodeURIComponent('합')}`)
      expect(box).toHaveValue('합')
    } finally {
      vi.useRealTimers()
    }
  })

  it('열 머리를 누르면 정렬이 URL에 들어간다', async () => {
    const user = userEvent.setup()
    const router = renderPage()
    await screen.findByRole('link', { name: '두 수의 합' })

    await user.click(screen.getByRole('button', { name: /난이도/ }))

    await waitFor(() => {
      expect(router.state.location.search).toContain('sort=difficulty%2Casc')
    })
  })

  it('필터 결과가 0건이면 초기화 링크를 보여 준다', async () => {
    renderPage('/problems?keyword=없는제목')

    expect(await screen.findByText('조건에 맞는 문제가 없습니다')).toBeInTheDocument()
    // ProblemFilters 사이드바도 필터가 걸리면 같은 이름의 초기화 링크를 둔다.
    // 본문으로 좁히지 않으면 두 개가 걸려 getByRole이 바로 실패한다.
    const main = screen.getByRole('main')
    expect(within(main).getByRole('link', { name: '필터 초기화' })).toHaveAttribute(
      'href',
      '/problems',
    )
  })

  it('필터가 없는데 0건이면 다른 문구를 보여 준다', async () => {
    server.use(
      http.get('*/api/problems', () => HttpResponse.json({ content: [], totalElements: 0 })),
    )
    renderPage()

    expect(await screen.findByText('아직 등록된 문제가 없습니다')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '필터 초기화' })).not.toBeInTheDocument()
  })

  it('서버 오류는 한국어 문구로 보여 준다', async () => {
    server.use(
      http.get('*/api/problems', () =>
        HttpResponse.json({ status: 503, title: 'Service Unavailable' }, { status: 503 }),
      ),
    )
    renderPage()

    // retry:1이라 첫 시도 실패 뒤 재시도 지연(약 1초)을 거쳐야 error 상태가 된다.
    // findByRole 기본 타임아웃(1000ms)은 그 경계에 걸려 간헐적으로 떨어진다.
    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent(
      '문제가 발생했습니다',
    )
  })

  it('다시 시도를 누르면 재요청한다', async () => {
    let calls = 0
    server.use(
      http.get('*/api/problems', () => {
        calls += 1
        return HttpResponse.json({ status: 503 }, { status: 503 })
      }),
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: '다시 시도' }, { timeout: 3000 }))

    await waitFor(() => {
      expect(calls).toBeGreaterThan(2) // retry:1 포함 첫 시도 2회 + 재시도
    })
  })

  it('비로그인이면 로그인 안내를 보여 준다', async () => {
    renderPage()

    // 헤더에도 '로그인' 링크가 있다. 본문으로 좁혀야 이 화면의 안내문을 집는다.
    // 세션을 확인하기 전에는 안내를 그리지 않으므로(위 테스트) 나타날 때까지 기다린다.
    const main = screen.getByRole('main')
    expect(await within(main).findByRole('link', { name: /로그인/ })).toBeInTheDocument()
  })

  it('안내의 로그인 링크도 지금 주소를 실어 보낸다 (COM-07)', async () => {
    // 헤더의 로그인 버튼과 같은 이유다. 필터를 걸어 둔 채 이 링크를 누른 사람이
    // 로그인 뒤 조건 없는 목록으로 떨어지지 않게 한다.
    const user = userEvent.setup()
    const router = renderPage('/problems?difficulty=EASY')

    const main = screen.getByRole('main')
    await user.click(await within(main).findByRole('link', { name: /로그인/ }))

    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.state).toEqual({ from: '/problems?difficulty=EASY' })
  })

  /**
   * 세션을 알기 전에는 **요청 자체를 보내지 않는다** (ProblemListPage의 enabled 주석).
   *
   * 전에는 보냈다. 이 경로는 permitAll이라 토큰 없이도 200이고, 그러면 401이 없어 갱신도
   * 일어나지 않는다 — 새로고침하면 access token이 메모리에서 사라지므로, 세션을 알기 전에
   * 받아 둔 비로그인 목록이 staleTime 동안 남아 '풀이 상태' 열이 전부 '—'로 보였다.
   *
   * 그래서 "세션 확인 중에 목록이 실패하면", "세션을 모르는 동안 표를 그리지 않는다" 같은
   * 상태는 이제 일어나지 않는다. 그 상태를 보던 테스트 둘을 이 하나로 바꿨다 — 조건을
   * 지우면 요청이 나가므로 이 단언이 그 구조를 붙들고 있다.
   */
  it('세션을 모르는 동안에는 목록을 요청하지 않는다', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: true,
    })
    let listCalls = 0
    server.use(
      http.get('*/api/problems', () => {
        listCalls += 1
        return HttpResponse.json({ content: [problems[0]], totalElements: 1 })
      }),
    )
    renderPage()

    // 매크로태스크를 한 번 보낸 뒤에 센다 — 없으면 이 단언이 공짜로 통과한다.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(listCalls).toBe(0)
    // 기다리는 중임이 모양으로 보여야 한다. 빈 화면을 두면 고장으로 읽힌다.
    expect(within(screen.getByRole('main')).getByRole('status')).toBeInTheDocument()
  })

  it('로그인하면 안내가 사라지고 풀이 상태 열이 보인다', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: { id: 1, nickname: '찬우', role: 'USER' },
      isAuthenticated: true,
      isLoading: false,
    })
    renderPage()

    await screen.findByRole('link', { name: '두 수의 합' })
    expect(screen.getByRole('columnheader', { name: '풀이 상태' })).toBeInTheDocument()
    // 고정 픽스처에서 SOLVED가 2건이라 표 전체에 '맞음'이 두 번 나온다. 행으로
    // 좁혀야 '두 수의 합' 행의 풀이 상태 셀을 가리키는 단언이 된다.
    const row = screen.getByRole('row', { name: /두 수의 합/ })
    expect(within(row).getByText('맞음')).toBeInTheDocument()
    // AppHeader도 자기 자신의 '로그인' 링크를 두므로(이땐 로그인 상태라 없지만) main으로
    // 좁혀, 이 화면의 안내문이 로그인하면 사라지는지까지 확인한다.
    expect(
      within(screen.getByRole('main')).queryByRole('link', { name: '로그인' }),
    ).not.toBeInTheDocument()
  })
})

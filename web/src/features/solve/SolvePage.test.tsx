import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/app/queryClient'
import { ThemeProvider } from '@/app/ThemeProvider'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { problemDetails } from '@/mocks/fixtures/problemDetails'
import { server } from '@/mocks/server'
import { Component as SolvePage } from './SolvePage'

/**
 * 이 화면은 RequireAuth 뒤에 있다. 임시 저장 키에 사용자가 들어가므로(savedCode)
 * 세션을 심지 않으면 저장이 통째로 건너뛰어지고, SOLVE-11 테스트가 공짜로 통과한다.
 */
const USER = { id: 1, nickname: '코다리', role: 'USER' } as const

/** 마지막으로 렌더한 트리의 쿼리 클라이언트. 재조회를 일으키는 테스트가 쓴다. */
let lastClient: QueryClient
let lastRouter: ReturnType<typeof createMemoryRouter>

function renderSolve(url = '/problems/1') {
  // 제출이 도착할 자리. 실제 결과 화면은 #31이 채운다 (SOLVE-09는 '이동'까지다).
  const router = createMemoryRouter(
    [
      { path: '/problems/:id', Component: SolvePage },
      { path: '/submissions/:id', element: <h1>제출 결과 도착</h1> },
    ],
    { initialEntries: [url] },
  )
  const client = createQueryClient()
  client.setQueryData(ME_QUERY_KEY, USER)
  lastClient = client
  lastRouter = router

  const { container } = render(
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
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
    // SOLVE-11이 localStorage에 쓴다. 테스트 사이에 남으면 다음 테스트가 그 코드로 열린다.
    localStorage.clear()
  })

  it('제목·난이도·제한을 보여 준다', async () => {
    renderSolve()

    expect(await screen.findByRole('heading', { level: 1, name: '두 수의 합' })).toBeInTheDocument()
    expect(screen.getByText('쉬움')).toBeInTheDocument()
    // 고른 것이 없으면 첫 언어(계약이 보장하는 PYTHON)의 제한이다.
    expect(screen.getByText('Python · 2초 · 256MB')).toBeInTheDocument()
  })

  describe('제출 (SOLVE-09)', () => {
    const submitButton = () => screen.getByRole('button', { name: '제출' })

    it('제출하면 결과 화면으로 간다', async () => {
      const user = userEvent.setup()
      renderSolve()
      await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

      await user.click(submitButton())

      expect(await screen.findByRole('heading', { name: '제출 결과 도착' })).toBeInTheDocument()
    })

    it('코드가 비어 있으면 누를 수 없다', async () => {
      const user = userEvent.setup()
      renderSolve()
      await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

      // 시작 코드를 모두 지운 상태다. 서버도 SOURCE_EMPTY로 거절하지만 왕복을 아낀다.
      await user.click(screen.getByRole('textbox', { name: '코드 편집기' }))
      await user.keyboard('{Control>}a{/Control}{Delete}')
      await waitFor(() => expect(submitButton()).toBeDisabled())
    })

    /**
     * 같은 코드를 두 번 보내면 시도 횟수가 두 번 올라간다 (계약: 제출할 때마다 새 제출로
     * 저장해 시도 횟수를 센다). 되돌릴 수 없으므로 보내는 쪽에서도 막는다.
     */
    it('연타해도 한 번만 보낸다', async () => {
      const user = userEvent.setup()
      let calls = 0
      server.use(
        http.post('*/api/submissions', async () => {
          calls += 1
          // 응답을 늦춰 두 번째 클릭이 isPending 구간에 떨어지게 한다.
          await new Promise((resolve) => setTimeout(resolve, 50))
          return HttpResponse.json({ id: 7 }, { status: 202 })
        }),
      )
      renderSolve()
      await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

      const button = submitButton()
      await user.click(button)
      await user.click(button)
      await user.click(button)

      await screen.findByRole('heading', { name: '제출 결과 도착' })
      expect(calls).toBe(1)
    })

    /**
     * 세션이 끊긴 상태로 제출하면 문구만 띄우고 끝낼 수 없다. 로그인 화면으로 보내야
     * 돌아올 주소도 함께 담긴다(RequireAuth). 쓰던 코드는 localStorage에 남는다.
     */
    it('401이면 세션을 버려 로그인으로 보낼 수 있게 한다', async () => {
      const user = userEvent.setup()
      server.use(
        http.post('*/api/submissions', () =>
          HttpResponse.json({ status: 401, title: 'Unauthorized' }, { status: 401 }),
        ),
      )
      renderSolve()
      await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

      await user.click(submitButton())

      await waitFor(() => expect(lastClient.getQueryData(ME_QUERY_KEY)).toBeNull())
    })

    /**
     * C++로 제출해 LANGUAGE_NOT_SUPPORTED를 받은 뒤 Python으로 바꿔도 문구가 남으면,
     * 사용자는 Python도 안 되는 것으로 읽는다.
     */
    it('언어를 바꾸면 이전 언어의 오류 문구가 사라진다', async () => {
      const user = userEvent.setup()
      server.use(
        http.post('*/api/submissions', () =>
          HttpResponse.json(
            { status: 400, code: 'LANGUAGE_NOT_SUPPORTED', detail: '언어를 다시 골라 주세요' },
            { status: 400 },
          ),
        ),
      )
      renderSolve()
      await screen.findByRole('heading', { level: 1, name: '두 수의 합' })
      await user.click(screen.getByRole('radio', { name: 'C++' }))

      await user.click(submitButton())
      expect(await screen.findByRole('alert')).toHaveTextContent('언어를 다시 골라 주세요')

      await user.click(screen.getByRole('radio', { name: 'Python' }))

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('실패하면 서버 문구를 보여 주고 코드는 그대로 둔다', async () => {
      const user = userEvent.setup()
      server.use(
        http.post('*/api/submissions', () =>
          HttpResponse.json(
            {
              status: 400,
              code: 'LANGUAGE_NOT_SUPPORTED',
              detail: '이 문제는 그 언어를 지원하지 않아요',
            },
            { status: 400 },
          ),
        ),
      )
      renderSolve()
      await screen.findByRole('heading', { level: 1, name: '두 수의 합' })
      await user.click(screen.getByRole('textbox', { name: '코드 편집기' }))
      await user.keyboard('# 지우면 안 되는 코드')

      await user.click(submitButton())

      // 계약이 detail을 "화면에 그대로 보여 줄 문구"로 정했다. 화면에 또 적지 않는다.
      expect(await screen.findByRole('alert')).toHaveTextContent(
        '이 문제는 그 언어를 지원하지 않아요',
      )
      // 화면을 갈아엎으면 쓰던 코드가 사라진다.
      expect(screen.getByRole('textbox', { name: '코드 편집기' })).toHaveTextContent(
        '# 지우면 안 되는 코드',
      )
    })
  })

  describe('코드 임시 저장 (SOLVE-11)', () => {
    const editorHas = (text: string) =>
      waitFor(() =>
        expect(screen.getByRole('textbox', { name: '코드 편집기' })).toHaveTextContent(text),
      )

    it('새로고침해도 저장된 코드로 열린다', async () => {
      const user = userEvent.setup()
      renderSolve()
      await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

      await user.click(screen.getByRole('textbox', { name: '코드 편집기' }))
      await user.keyboard('# 쓰다 만 코드')
      await editorHas('# 쓰다 만 코드')

      // 새로고침은 재마운트와 같다. state는 사라지고 저장소만 남는다.
      cleanup()
      renderSolve()
      await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

      await editorHas('# 쓰다 만 코드')
    })

    it('언어별로 따로 저장한다', async () => {
      const user = userEvent.setup()
      renderSolve()
      await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

      await user.click(screen.getByRole('textbox', { name: '코드 편집기' }))
      await user.keyboard('# 파이썬으로 쓴 것')
      await editorHas('# 파이썬으로 쓴 것')

      cleanup()
      renderSolve()
      await screen.findByRole('heading', { level: 1, name: '두 수의 합' })
      await user.click(screen.getByRole('radio', { name: 'C++' }))

      // Python 저장이 C++ 자리에 열리면 컴파일조차 안 되는 코드를 받는다.
      await editorHas('ios::sync_with_stdio(false);')
      expect(screen.getByRole('textbox', { name: '코드 편집기' })).not.toHaveTextContent(
        '# 파이썬으로 쓴 것',
      )
    })

    it('시작 코드를 불러오면 저장도 함께 바뀐다', async () => {
      const user = userEvent.setup()
      renderSolve()
      await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

      await user.click(screen.getByRole('textbox', { name: '코드 편집기' }))
      await user.keyboard('# 버릴 코드')
      await editorHas('# 버릴 코드')

      await user.click(screen.getByRole('button', { name: '시작 코드 불러오기' }))
      await user.click(screen.getByRole('button', { name: '불러오기' }))
      await editorHas('sys.stdin.read()')

      cleanup()
      renderSolve()
      await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

      // 저장을 같이 갈지 않으면 새로고침에 방금 버린 코드가 돌아온다.
      expect(screen.getByRole('textbox', { name: '코드 편집기' })).not.toHaveTextContent(
        '# 버릴 코드',
      )
    })

    it('저장소가 막혀 있어도 시작 코드로 열린다', async () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('denied')
      })
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('denied')
      })
      renderSolve()

      await screen.findByRole('heading', { level: 1, name: '두 수의 합' })
      await editorHas('sys.stdin.read()')
    })
  })

  /**
   * 리뷰에서 나온 두 건이다. 둘 다 다시 받은 데이터·캐시에 달려 있어 화면 전체로만 보인다.
   */
  describe('데이터가 바뀌는 경우', () => {
    it('문제를 바꾸면 이전 문제의 코드가 남지 않는다', async () => {
      const user = userEvent.setup()
      renderSolve()
      await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

      await user.click(screen.getByRole('textbox', { name: '코드 편집기' }))
      await user.keyboard('# 1번 문제 코드')
      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: '코드 편집기' })).toHaveTextContent(
          '# 1번 문제 코드',
        ),
      )

      // 라우터 안에서 이동해야 고친 경로를 지난다. 캐시가 있어 isPending을 거치지
      // 않으면 같은 route Component가 재사용돼 Workspace가 다시 마운트되지 않는다.
      // cleanup 뒤 새로 렌더하면 어차피 새 인스턴스라 이 결함을 비켜 간다.
      lastClient.setQueryData(['problem', 2], problemDetails[1])
      await act(() => lastRouter.navigate('/problems/2'))
      await screen.findByRole('heading', { level: 1, name: '문자열 뒤집기' })

      // 남아 있으면 다음 입력에서 2번의 저장소를 1번 코드로 덮어쓴다.
      expect(screen.getByRole('textbox', { name: '코드 편집기' })).not.toHaveTextContent(
        '# 1번 문제 코드',
      )
    })

    it('고른 언어가 지원 목록에서 빠지면 첫 언어로 돌아간다', async () => {
      const user = userEvent.setup()
      renderSolve()
      await screen.findByRole('heading', { level: 1, name: '두 수의 합' })
      await user.click(screen.getByRole('radio', { name: 'C++' }))
      expect(screen.getByText('C++ · 1초 · 256MB')).toBeInTheDocument()

      // 같은 Workspace가 붙어 있는 채로 데이터만 바뀌어야 고친 경로를 지난다.
      // 다시 렌더하면 chosen도 초기화돼 이 결함을 비켜 간다.
      server.use(
        http.get('*/api/problems/1', () =>
          HttpResponse.json({
            ...problemDetails[0],
            languages: [problemDetails[0].languages[0]],
          }),
        ),
      )
      await act(() => lastClient.invalidateQueries({ queryKey: ['problem', 1] }))

      // 에디터와 언어 선택이 함께 사라지면 사용자는 새로고침 없이 지원되는 언어로
      // 돌아갈 길이 없다.
      await waitFor(() => expect(screen.getByText('Python · 2초 · 256MB')).toBeInTheDocument())
      expect(screen.getByRole('radio', { name: 'Python' })).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: '코드 편집기' })).toBeInTheDocument()
      expect(screen.queryByRole('radio', { name: 'C++' })).not.toBeInTheDocument()
    })
  })

  describe('입문자 안내 (SOLVE-07)', () => {
    const summary = (label: string) =>
      screen.getByText(`처음이신가요? ${label}로 표준 입력 읽는 법`)

    it('처음에는 접혀 있고 펼치면 그 언어의 예시가 보인다', async () => {
      const user = userEvent.setup()
      renderSolve()
      await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

      // 아는 사람에게는 화면을 가리는 덩어리다. 제목만 두고 접어 둔다.
      expect(screen.getByText(/sys\.stdin\.readline/)).not.toBeVisible()

      await user.click(summary('Python'))

      expect(screen.getByText(/sys\.stdin\.readline/)).toBeVisible()
      expect(screen.getByText(/채점은 여기 찍힌 글자만 봅니다/)).toBeVisible()
    })

    it('언어를 바꾸면 안내도 그 언어의 것으로 바뀐다', async () => {
      const user = userEvent.setup()
      renderSolve()
      await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

      await user.click(screen.getByRole('radio', { name: 'C++' }))

      // Python 예시가 남아 있으면 C++로 푸는 사람에게 틀린 안내를 준다.
      expect(summary('C++')).toBeInTheDocument()
      // 에디터에 열린 C++ 시작 코드에도 sync_with_stdio가 있다. 안내 쪽 문구로 가른다.
      expect(screen.getByText(/C 입출력과의 동기화를 끊어/)).toBeInTheDocument()
      expect(screen.queryByText(/sys\.stdin\.readline/)).not.toBeInTheDocument()
    })
  })

  describe('시작 코드 불러오기 (SOLVE-06)', () => {
    /** @uiw는 타이핑 직후 들어온 외부 value를 200ms 미뤄 둔다(CodeEditor 쪽 주석). */
    const hasCode = (text: string) =>
      waitFor(() =>
        expect(screen.getByRole('textbox', { name: '코드 편집기' })).toHaveTextContent(text),
      )

    it('작성 중인 코드가 없으면 묻지 않고 바로 넣는다', async () => {
      const user = userEvent.setup()
      renderSolve()
      await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

      // 시작 코드로 열려 있으니 잃을 것이 없다. 아무것도 안 지우는 확인창을 띄우면
      // 사용자가 확인을 읽지 않게 길들인다.
      await user.click(screen.getByRole('button', { name: '시작 코드 불러오기' }))

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      await hasCode('sys.stdin.read()')
    })

    it('작성 중인 코드가 있으면 확인을 받고 덮어쓴다', async () => {
      const user = userEvent.setup()
      renderSolve()
      await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

      await user.click(screen.getByRole('textbox', { name: '코드 편집기' }))
      await user.keyboard('# 내가 쓴 코드')
      await hasCode('# 내가 쓴 코드')

      await user.click(screen.getByRole('button', { name: '시작 코드 불러오기' }))
      expect(await screen.findByRole('alertdialog')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: '불러오기' }))

      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: '코드 편집기' })).not.toHaveTextContent(
          '# 내가 쓴 코드',
        ),
      )
      await hasCode('sys.stdin.read()')
    })

    /**
     * 확인을 확정하면 `drafted`가 false로 바뀐다. 버튼을 경우마다 따로 그리면 Radix가
     * 초점을 돌려줄 트리거가 DOM에서 사라져 초점이 body로 떨어지고, 키보드 사용자는
     * 처음부터 다시 Tab해야 한다.
     */
    it('덮어쓰기를 확정한 뒤에도 초점이 버튼으로 돌아온다', async () => {
      const user = userEvent.setup()
      renderSolve()
      await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

      await user.click(screen.getByRole('textbox', { name: '코드 편집기' }))
      await user.keyboard('# 버릴 코드')
      await hasCode('# 버릴 코드')

      const trigger = screen.getByRole('button', { name: '시작 코드 불러오기' })
      await user.click(trigger)
      await user.click(screen.getByRole('button', { name: '불러오기' }))

      await waitFor(() =>
        expect(screen.getByRole('button', { name: '시작 코드 불러오기' })).toHaveFocus(),
      )
    })

    it('확인창에서 취소하면 코드가 그대로다', async () => {
      const user = userEvent.setup()
      renderSolve()
      await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

      await user.click(screen.getByRole('textbox', { name: '코드 편집기' }))
      await user.keyboard('# 지우면 안 되는 코드')
      await hasCode('# 지우면 안 되는 코드')

      await user.click(screen.getByRole('button', { name: '시작 코드 불러오기' }))
      await user.click(screen.getByRole('button', { name: '취소' }))

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      await hasCode('# 지우면 안 되는 코드')
    })
  })

  describe('언어 선택 (SOLVE-04)', () => {
    it('언어를 바꾸면 제한 표시도 함께 바뀐다', async () => {
      const user = userEvent.setup()
      renderSolve()
      await screen.findByRole('heading', { level: 1, name: '두 수의 합' })
      expect(screen.getByText('Python · 2초 · 256MB')).toBeInTheDocument()

      await user.click(screen.getByRole('radio', { name: 'C++' }))

      // Python이 느려서 제한이 두 배다. 바뀌지 않으면 제출 전에 잘못된 제한을 보고 푼다.
      expect(screen.getByText('C++ · 1초 · 256MB')).toBeInTheDocument()
      expect(screen.queryByText('Python · 2초 · 256MB')).not.toBeInTheDocument()
    })

    it('문제가 주는 언어만 띄운다', async () => {
      server.use(
        http.get('*/api/problems/1', () =>
          HttpResponse.json({
            ...problemDetails[0],
            languages: [problemDetails[0].languages[0]],
          }),
        ),
      )
      renderSolve()
      await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

      expect(screen.getByRole('radio', { name: 'Python' })).toBeInTheDocument()
      // 계약의 `languages`는 그 버전이 지원하는 목록이다. 없는 언어로 제출하면 서버가
      // LANGUAGE_NOT_SUPPORTED로 거절한다 — 고를 수 있게 두면 안 된다.
      expect(screen.queryByRole('radio', { name: 'C++' })).not.toBeInTheDocument()
    })

    it('언어를 바꿨다 돌아오면 그 언어에 쓴 코드가 남아 있다', async () => {
      const user = userEvent.setup()
      renderSolve()
      await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

      const editor = screen.getByRole('textbox', { name: '코드 편집기' })
      await user.click(editor)
      await user.keyboard('# 내가 쓴 Python')
      expect(editor).toHaveTextContent('# 내가 쓴 Python')

      await user.click(screen.getByRole('radio', { name: 'C++' }))
      // 손대지 않은 언어는 그 언어의 시작 코드로 연다 (SOLVE-06).
      expect(screen.getByRole('textbox', { name: '코드 편집기' })).toHaveTextContent(
        'ios::sync_with_stdio(false);',
      )

      await user.click(screen.getByRole('radio', { name: 'Python' }))
      expect(screen.getByRole('textbox', { name: '코드 편집기' })).toHaveTextContent(
        '# 내가 쓴 Python',
      )
    })
  })

  it('지문의 수식을 KaTeX로 그린다', async () => {
    const container = renderSolve()
    await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

    // $O(n)$이 글자 그대로 남으면 지문이 읽히지 않는다. KaTeX는 .katex를 만든다.
    expect(container.querySelector('.katex')).not.toBeNull()
    expect(screen.queryByText(/\$O\(n\)\$/)).not.toBeInTheDocument()
  })

  // 입출력 형식도 Markdown과 수식이다 (#121). 입력 범위를 `$2 \\le N \\le 10^5$`처럼
  // 쓸 수 있어야 한다. 절 안에서 보는 이유는 지문에도 수식이 있어서다 — 화면 전체로 보면
  // 입력 형식을 평문으로 되돌려도 지문의 수식 때문에 통과한다.
  it('입출력 형식도 수식으로 그린다', async () => {
    renderSolve()
    await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

    const input = screen.getByRole('heading', { level: 2, name: '입력' }).closest('section')
    expect(input).not.toBeNull()
    expect(input?.querySelector('.katex')).not.toBeNull()
    // KaTeX는 MathML annotation에 원본 TeX를 함께 넣어 textContent에 \le가 남는다.
    // 평문으로 되돌아갔는지는 $ 구분자로 가른다 — 수식으로 그려지면 $가 사라진다.
    expect(input?.textContent).not.toContain('$')
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

  it('복사됨 표시는 잠시 뒤 돌아온다', async () => {
    // shouldAdvanceTime이 없으면 react-query의 알림(setTimeout 0)과 findBy의 폴링이 멈춘다
    // (EmailCodeStep.test.tsx의 쿨다운 테스트와 같은 이유).
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      renderSolve()
      await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

      await user.click(screen.getByRole('button', { name: '예제 1 입력 복사' }))
      expect(screen.getByRole('button', { name: '예제 1 입력 복사됨' })).toBeInTheDocument()

      // 안 돌아오면 두 번째 예제를 복사할 때 눌렸는지 알 수 없다.
      await act(async () => {
        vi.advanceTimersByTime(1500)
      })

      expect(screen.getByRole('button', { name: '예제 1 입력 복사' })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
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
    // 3번은 versionNo가 2다. v1만 단언하면 버전을 하드코딩해도 통과한다.
    expect(screen.getByText('문제 버전: v2')).toBeInTheDocument()
  })

  /**
   * 계약은 `sourceName`과 `sourceUrl`을 따로 null 허용한다.
   *
   * 조건이 이름만 보고 있어서 이 조합에서 출처 줄이 통째로 사라졌다. 출처를 숨기면
   * 라이선스 표기 의무를 지킬 수 없다 — 주소라도 보여야 한다.
   */
  it('출처 이름이 없고 주소만 있으면 주소를 링크로 보여 준다', async () => {
    renderSolve('/problems/4')
    await screen.findByRole('heading', { level: 1, name: '애너그램 묶기' })

    const source = screen.getByRole('link', {
      name: 'https://leetcode.com/problems/group-anagrams/',
    })
    expect(source).toHaveAttribute('href', 'https://leetcode.com/problems/group-anagrams/')
  })

  /**
   * 출처 주소는 관리자가 넣는 값이고, 이 링크만은 우리가 직접 만든다
   * (지문 안 링크는 react-markdown이 scheme을 걸러 준다).
   */
  it('http가 아닌 출처 주소는 링크로 만들지 않는다', async () => {
    server.use(
      http.get('*/api/problems/1', () =>
        HttpResponse.json({
          ...problemDetails[0],
          sourceName: '수상한 출처',
          sourceUrl: 'javascript:alert(1)',
        }),
      ),
    )
    renderSolve()
    await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

    expect(screen.getByText('출처: 수상한 출처')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '수상한 출처' })).not.toBeInTheDocument()
  })

  /** 계약의 `sourceName`은 길이 제한이 없다. 빈 문자열이면 없는 것으로 봐야 한다. */
  it('출처 이름이 빈 문자열이면 주소를 글자로 쓴다', async () => {
    server.use(
      http.get('*/api/problems/1', () =>
        HttpResponse.json({
          ...problemDetails[0],
          sourceName: '   ',
          sourceUrl: 'https://example.com/p/1',
        }),
      ),
    )
    renderSolve()
    await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

    // 이름을 그대로 쓰면 '출처: ' 뒤에 글자 없는 링크만 남아 가리킬 것이 없다.
    expect(screen.getByRole('link', { name: 'https://example.com/p/1' })).toBeInTheDocument()
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
      // 에디터는 지문 탭에서도 DOM에 남아 있다 (forceMount). 그게 undo 이력을 살리는
      // 방법이다 — SolvePage.tsx의 주석. jsdom에는 CSS가 없어 "안 보인다"까지는 못 보니,
      // 실제로 가려지는지는 e2e가 잰다.
      const editor = screen.getByRole('textbox', { name: '코드 편집기' })
      expect(editor).toBeInTheDocument()
      // 가리는 클래스가 물 자리. 이 속성이 없으면 지문 탭에서 에디터가 함께 보인다.
      expect(editor.closest('[role="tabpanel"]')).toHaveAttribute('data-state', 'inactive')

      await user.click(screen.getByRole('tab', { name: '코드 작성' }))

      expect(screen.queryByRole('heading', { name: '예제' })).not.toBeInTheDocument()
    })

    it('넓은 화면은 탭 없이 지문과 에디터를 함께 보여 준다', async () => {
      asWide()
      renderSolve()
      await screen.findByRole('heading', { level: 1, name: '두 수의 합' })

      expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: '예제' })).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: '코드 편집기' })).toBeInTheDocument()
    })
  })
})

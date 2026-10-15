import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { parseParams } from '@/features/problems/problemListParams'
import { problemListQuery } from '@/features/problems/problemsQuery'
import { problems } from '@/mocks/fixtures/problems'
import { server } from '@/mocks/server'
import { logoutRequest, ME_QUERY_KEY } from './authQuery'
import { Component as LoginPage } from './LoginPage'
import { safeRedirect } from './safeRedirect'

// MSW의 쿠키 저장소는 테스트 사이에 비워지지 않는다. 앞 테스트의 로그인이 남으면
// 다음 테스트가 이미 로그인한 상태로 시작해 폼 대신 이동 화면을 만난다.
afterEach(async () => {
  await logoutRequest()
})

// COM-07이 정한 고정 문구. 일부만 비교하면 꼬리가 바뀌어도 통과하므로 전체를 비교한다.
const CREDENTIAL_MESSAGE =
  '이메일 또는 비밀번호가 맞지 않아요. GitHub로 가입했다면 GitHub 로그인을 이용해 주세요'
const RATE_LIMIT_MESSAGE = '로그인 시도가 너무 많아요. 5분 후 다시 시도해 주세요'

/**
 * 로그인 후 도착지를 확인할 수 있게 /submissions에 표식을 둔 메모리 라우터.
 *
 * seed는 마운트 전에 캐시를 채운다. 렌더 뒤에 채우면 "이미 받아 둔 데이터가 있는 상태로
 * 이 화면을 열었다"를 재현할 수 없다 — 첫 렌더가 이미 지나가 버린다.
 */
function renderLogin(state?: unknown, seed?: (client: QueryClient) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  seed?.(client)
  const router = createMemoryRouter(
    [
      { path: '/login', Component: LoginPage },
      { path: '/problems', element: <h1>문제 목록 도착</h1> },
      { path: '/submissions', element: <h1>제출 기록 도착</h1> },
    ],
    { initialEntries: [{ pathname: '/login', state }] },
  )

  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return { router, client }
}

/**
 * 폼이 나타날 때까지 기다린다.
 *
 * 세션을 아직 모르는 동안 LoginPage는 폼 대신 스켈레톤을 그린다. 렌더 직후에 칸을 집으면
 * 그 스켈레톤을 만나 "이메일 라벨이 없다"로 깨진다.
 */
function waitForLoginForm() {
  return screen.findByRole('form', { name: '로그인' })
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await waitForLoginForm()
  await user.type(screen.getByLabelText('이메일'), 'user@codari.test')
  await user.type(screen.getByLabelText('비밀번호'), 'Codari!test1')
  await user.click(screen.getByRole('button', { name: '로그인' }))
}

describe('safeRedirect', () => {
  it('사이트 안 경로는 그대로 쓴다', () => {
    expect(safeRedirect('/submissions?page=2')).toBe('/submissions?page=2')
  })

  it('프로토콜 상대 주소를 거부한다', () => {
    // '//evil.com'은 사이트 밖을 가리킨다.
    expect(safeRedirect('//evil.com')).toBe('/problems')
  })

  it('역슬래시로 시작하는 주소를 거부한다', () => {
    // 브라우저는 주소 앞부분의 '\'를 '/'처럼 읽는다.
    expect(safeRedirect(String.raw`/\evil.com`)).toBe('/problems')
  })

  it('절대 URL을 거부한다', () => {
    expect(safeRedirect('https://evil.com/x')).toBe('/problems')
  })

  it('탭·개행이 섞여 URL 파서가 지우면 외부가 되는 주소를 거부한다', () => {
    // 접두사 검사는 '/\t/'를 통과시키지만 파서는 탭을 지워 'http://evil.com/'으로 읽는다.
    expect(safeRedirect('/\t/evil.com')).toBe('/problems')
    expect(safeRedirect('/\n/evil.com')).toBe('/problems')
    expect(safeRedirect('/\r/evil.com')).toBe('/problems')
  })

  it("'/login'을 거부한다", () => {
    // 헤더의 로그인 버튼이 지금 주소를 from에 실으므로, 로그인 화면에서 그 버튼을 누르면
    // '/login'이 들어온다. 그대로 쓰면 로그인 화면이 자기 자신으로 이동한다.
    expect(safeRedirect('/login')).toBe('/problems')
    expect(safeRedirect('/login?from=%2Fsubmissions')).toBe('/problems')
  })

  it('경로가 아니거나 없으면 문제 목록으로 보낸다', () => {
    expect(safeRedirect(undefined)).toBe('/problems')
    expect(safeRedirect(42)).toBe('/problems')
    expect(safeRedirect('submissions')).toBe('/problems')
  })
})

describe('로그인 화면', () => {
  it('성공하면 from으로 돌아간다', async () => {
    const user = userEvent.setup()
    renderLogin({ from: '/submissions' })

    await fillAndSubmit(user)

    expect(await screen.findByRole('heading', { name: '제출 기록 도착' })).toBeInTheDocument()
  })

  it('성공하면 로그인 화면을 기록에서 교체한다', async () => {
    // 최종 historyAction만으로는 부족하다. onSuccess의 navigate와 <Navigate replace> 분기가
    // 모두 REPLACE로 끝나기 때문이다. 다른 것은 기록 스택이다. replace 없이 PUSH가 한 번이라도
    // 일어나면 /login이 기록에 남는다. 로그인한 채 거기로 뒤로 가면 <Navigate> 분기가 곧바로
    // 앞으로 되돌려 보내므로, 방문자는 뒤로 가기가 막혀 화면을 벗어나지 못한다.
    // 그래서 이동 중 PUSH가 없었는지 본다.
    const user = userEvent.setup()
    const { router } = renderLogin({ from: '/submissions' })
    const seen: string[] = []
    router.subscribe((s) => seen.push(`${s.historyAction}:${s.location.pathname}`))

    await fillAndSubmit(user)

    await screen.findByRole('heading', { name: '제출 기록 도착' })
    expect(router.state.historyAction).toBe('REPLACE')
    expect(seen).not.toContain('PUSH:/submissions')
  })

  it('from이 //로 시작하면 무시하고 문제 목록으로 간다', async () => {
    const user = userEvent.setup()
    renderLogin({ from: '//evil.com' })

    await fillAndSubmit(user)

    expect(await screen.findByRole('heading', { name: '문제 목록 도착' })).toBeInTheDocument()
  })

  it('from이 역슬래시로 시작해도 무시하고 문제 목록으로 간다', async () => {
    const user = userEvent.setup()
    renderLogin({ from: String.raw`/\evil.com` })

    await fillAndSubmit(user)

    expect(await screen.findByRole('heading', { name: '문제 목록 도착' })).toBeInTheDocument()
  })

  it('from이 없으면 문제 목록으로 간다', async () => {
    const user = userEvent.setup()
    renderLogin()

    await fillAndSubmit(user)

    expect(await screen.findByRole('heading', { name: '문제 목록 도착' })).toBeInTheDocument()
  })

  it('401이면 COM-07 공통 문구를 보여 준다', async () => {
    server.use(
      http.post('*/api/auth/login', () =>
        HttpResponse.json({ status: 401, title: 'Unauthorized' }, { status: 401 }),
      ),
    )
    const user = userEvent.setup()
    renderLogin()

    await fillAndSubmit(user)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(CREDENTIAL_MESSAGE)
  })

  it('본문에 status가 없는 401도 COM-07 공통 문구를 보여 준다', async () => {
    // 오류 본문의 모든 member는 선택이라 status 없는 401도 적법한 응답이다.
    // 판단 근거는 본문이 아니라 HTTP 상태여야 한다.
    server.use(
      http.post('*/api/auth/login', () =>
        HttpResponse.json(
          { type: '/auth/invalid-credentials', title: 'Unauthorized' },
          { status: 401 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderLogin()

    await fillAndSubmit(user)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(CREDENTIAL_MESSAGE)
  })

  it('본문의 status와 HTTP 상태가 다르면 HTTP 상태를 따른다', async () => {
    server.use(
      http.post('*/api/auth/login', () =>
        HttpResponse.json({ status: 500, title: 'Unauthorized' }, { status: 401 }),
      ),
    )
    const user = userEvent.setup()
    renderLogin()

    await fillAndSubmit(user)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(CREDENTIAL_MESSAGE)
  })

  it('429면 제한 문구를 보여 준다', async () => {
    server.use(
      http.post('*/api/auth/login', () =>
        HttpResponse.json({ status: 429, title: 'Too Many' }, { status: 429 }),
      ),
    )
    const user = userEvent.setup()
    renderLogin()

    await fillAndSubmit(user)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(RATE_LIMIT_MESSAGE)
  })

  it('비밀번호 칸에서 Enter로 제출된다', async () => {
    const user = userEvent.setup()
    renderLogin({ from: '/submissions' })
    await waitForLoginForm()

    await user.type(screen.getByLabelText('이메일'), 'user@codari.test')
    await user.type(screen.getByLabelText('비밀번호'), 'Codari!test1{Enter}')

    expect(await screen.findByRole('heading', { name: '제출 기록 도착' })).toBeInTheDocument()
  })

  it('폼의 submit 이벤트만으로도 로그인 요청이 나간다', async () => {
    // 버튼 클릭을 거치지 않는 제출 경로다. onSubmit이 폼에 있어야 잡힌다.
    const user = userEvent.setup()
    renderLogin({ from: '/submissions' })
    await waitForLoginForm()

    await user.type(screen.getByLabelText('이메일'), 'user@codari.test')
    await user.type(screen.getByLabelText('비밀번호'), 'Codari!test1')
    fireEvent.submit(screen.getByRole('form', { name: '로그인' }))

    expect(await screen.findByRole('heading', { name: '제출 기록 도착' })).toBeInTheDocument()
  })

  it('제출 중에는 버튼이 눌리지 않아 요청이 한 번만 나간다', async () => {
    let calls = 0
    server.use(
      http.post('*/api/auth/login', async () => {
        calls += 1
        // 응답을 늦춰 요청이 진행 중인 구간을 만든다. 그래야 버튼이 비활성화된 상태를
        // 관찰할 수 있고, 그 사이에 두 번째 클릭을 넣을 수 있다.
        await new Promise((resolve) => setTimeout(resolve, 50))
        return HttpResponse.json({ id: 1, nickname: '코다리', role: 'USER' })
      }),
    )
    const user = userEvent.setup()
    renderLogin()
    await waitForLoginForm()

    await user.type(screen.getByLabelText('이메일'), 'user@codari.test')
    await user.type(screen.getByLabelText('비밀번호'), 'Codari!test1')

    const button = screen.getByRole('button', { name: /로그인/ })
    await user.click(button)
    await waitFor(() => expect(button).toBeDisabled())
    await user.click(button)

    await screen.findByRole('heading', { name: '문제 목록 도착' })
    expect(calls).toBe(1)
  })

  it('빈 칸으로 제출하면 요청을 보내지 않고 안내한다', async () => {
    let calls = 0
    server.use(
      http.post('*/api/auth/login', () => {
        calls += 1
        return HttpResponse.json({ id: 1, nickname: '코다리', role: 'USER' })
      }),
    )
    const user = userEvent.setup()
    renderLogin()
    await waitForLoginForm()

    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByText('이메일을 입력해 주세요')).toBeInTheDocument()
    expect(calls).toBe(0)
  })

  it('이미 로그인한 사람은 폼을 보지 않고 바로 이동한다', async () => {
    server.use(
      http.get('*/api/me', () => HttpResponse.json({ id: 1, nickname: '코다리', role: 'USER' })),
    )
    renderLogin({ from: '/submissions' })

    expect(await screen.findByRole('heading', { name: '제출 기록 도착' })).toBeInTheDocument()
    expect(screen.queryByLabelText('비밀번호')).not.toBeInTheDocument()
  })

  it('세션을 모르는 동안에는 폼을 그리지 않는다', async () => {
    // 폼을 먼저 보여 주면, 이미 로그인한 사람이 입력을 시작한 뒤 /api/me가 도착하면서
    // <Navigate>가 실행돼 입력하던 내용이 사라진 채 이동한다.
    let release = () => {}
    const inFlight = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get('*/api/me', async () => {
        await inFlight
        return HttpResponse.json({ status: 401, title: 'Unauthorized' }, { status: 401 })
      }),
    )

    try {
      renderLogin()

      expect(await screen.findByRole('status')).toBeInTheDocument()
      expect(screen.queryByLabelText('비밀번호')).not.toBeInTheDocument()
      expect(screen.queryByRole('form', { name: '로그인' })).not.toBeInTheDocument()
    } finally {
      release()
    }
  })

  it('로그인 전에 나간 /api/me가 늦게 끝나도 로그인 상태를 덮지 않는다', async () => {
    // 비로그인으로 한 번 받아 둔 뒤(data = null) staleTime(60초)이 지난 상태로 이 화면을 열면,
    // 배경 재조회가 나가면서도 데이터가 있으므로 폼이 바로 보인다. 그 사이에 로그인이
    // 성공하면, 로그인 전 쿠키로 나간 그 요청이 401로 끝나며 null로 사용자를 덮는다.
    let release = () => {}
    const inFlight = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get('*/api/me', async () => {
        await inFlight
        return HttpResponse.json({ status: 401, title: 'Unauthorized' }, { status: 401 })
      }),
    )
    const user = userEvent.setup()
    const { client } = renderLogin({ from: '/submissions' }, (c) => {
      c.setQueryData(ME_QUERY_KEY, null, { updatedAt: Date.now() - 120_000 })
    })

    await fillAndSubmit(user)
    expect(await screen.findByRole('heading', { name: '제출 기록 도착' })).toBeInTheDocument()

    release()
    // 요청이 끝날 때까지 기다린 뒤 캐시를 본다. 취소했다면 이미 idle이고 아무것도 쓰이지 않는다.
    await waitFor(() => expect(client.getQueryState(ME_QUERY_KEY)?.fetchStatus).toBe('idle'))
    expect(client.getQueryData(ME_QUERY_KEY)).toEqual({ id: 1, nickname: '코다리', role: 'USER' })
  })

  it('로그인하면 비로그인으로 받아 둔 문제 목록 캐시를 버린다', async () => {
    // 비로그인 응답에는 풀이 상태가 없다. 남겨 두면 staleTime(30초) 안에 다시 쓰여,
    // 열은 생겼는데 값이 전부 '—'인 표가 보인다. 키는 problemsQuery의 것을 그대로 쓴다 —
    // 그쪽이 키를 바꾸면 LoginPage의 제거 대상도 함께 바뀌어야 하고, 이 단언이 알려 준다.
    const listKey = problemListQuery(parseParams(new URLSearchParams())).queryKey
    const user = userEvent.setup()
    const { client } = renderLogin(undefined, (c) => {
      // 비로그인 응답이라 풀이 상태가 없는 행이다. 픽스처를 쓰면 타입이 실제 응답과 같다.
      c.setQueryData(listKey, { content: [problems[0]!], totalElements: 1 })
    })

    await fillAndSubmit(user)
    await screen.findByRole('heading', { name: '문제 목록 도착' })

    expect(client.getQueryData(listKey)).toBeUndefined()
  })

  it('목 계정을 화면에 노출하지 않는다', async () => {
    renderLogin()

    await waitForLoginForm()
    // textContent는 속성과 입력값을 보지 못한다. placeholder·value 같은 속성까지 보려고
    // 직렬화한 HTML 전체를 본다. 입력칸은 비어 있어야 하므로 값도 따로 확인한다.
    const html = document.body.innerHTML
    expect(html).not.toContain('codari.test')
    expect(html).not.toContain('Codari!test1')
    expect(screen.getByLabelText('이메일')).toHaveValue('')
    expect(screen.getByLabelText('비밀번호')).toHaveValue('')
  })

  it('아직 없는 화면으로 가는 링크를 두지 않는다', async () => {
    // 회원가입(COM-06)·비밀번호 찾기(COM-08) 화면은 아직 구현되지 않았다. 링크를 미리 두면
    // 404로 떨어진다. 이 테스트는 헤더 없이 화면만 그리므로 링크가 있다면 모두 이 화면의 것이다.
    renderLogin()

    await waitForLoginForm()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
})

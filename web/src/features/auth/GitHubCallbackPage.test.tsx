import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { setAccessToken } from '@/api/session'
import { mockAccounts } from '@/mocks/fixtures/users'
import { resetGitHub, resetSessions } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { loginRequest, logoutRequest } from './authQuery'
import { Component as GitHubCallbackPage } from './GitHubCallbackPage'
import { gitHubSignUp } from './githubQuery'

const FROM_KEY = 'github-login:from'

/**
 * GitHub를 다녀온 것처럼 한 번 들른다. 목이 콜백의 쿠키를 심어 준다 (mocks/handlers.ts).
 *
 * redirect: 'manual'이어야 한다 — 따라가면 /login/github로 요청이 나가고,
 * onUnhandledRequest: 'error'가 그걸 실패로 만든다.
 */
async function visitGitHub(): Promise<void> {
  await fetch('/api/auth/github', { redirect: 'manual' })
}

/** 이메일로 로그인해 둔다. '이미 로그인한 사람'을 만드는 가장 짧은 길이다. */
async function logIn(): Promise<void> {
  await loginRequest({ email: mockAccounts[0]!.email, password: 'Codari!test1' })
}

beforeEach(() => {
  resetGitHub()
  resetSessions()
  sessionStorage.clear()
  setAccessToken(null)
})

afterEach(async () => {
  // MSW의 쿠키 저장소는 테스트 사이에 비워지지 않는다 (LoginPage.test.tsx와 같은 이유).
  await logoutRequest()
  document.cookie = 'github_signup=; Max-Age=0; path=/api/auth/github'
})

function renderCallback(result: string | null, from?: string) {
  if (from !== undefined) sessionStorage.setItem(FROM_KEY, from)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const path = result === null ? '/login/github' : `/login/github?result=${result}`
  const router = createMemoryRouter(
    [
      { path: '/login/github', Component: GitHubCallbackPage },
      { path: '/login', element: <h1>로그인 도착</h1> },
      { path: '/problems', element: <h1>문제 목록 도착</h1> },
      { path: '/submissions', element: <h1>제출 기록 도착</h1> },
    ],
    { initialEntries: [path] },
  )

  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return { router, client }
}

/** 실패해서 로그인 화면으로 되돌아왔는지. state에 실린 문구까지 본다. */
async function expectFailure(router: ReturnType<typeof renderCallback>['router'], message: string) {
  expect(await screen.findByRole('heading', { name: '로그인 도착' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/login')
  expect((router.state.location.state as { error?: unknown }).error).toBe(message)
}

const GITHUB_FAILED = 'GitHub 로그인에 실패했어요. 다시 시도해 주세요'

describe('GitHubCallbackPage (COM-02)', () => {
  it('result=error면 로그인 화면에 실패를 알린다', async () => {
    const { router } = renderCallback('error')
    await expectFailure(router, GITHUB_FAILED)
  })

  it('result가 없으면(주소를 직접 친 경우) 실패로 본다', async () => {
    // 계약은 세 값만 보낸다. 그 밖은 전부 실패다 — 모르는 값을 가입 화면으로 보내면
    // 증명서 없이 가입을 누르게 된다.
    const { router } = renderCallback(null)
    await expectFailure(router, GITHUB_FAILED)
  })

  it('모르는 result도 실패로 본다', async () => {
    const { router } = renderCallback('zzz')
    await expectFailure(router, GITHUB_FAILED)
  })

  it('실패해도 원래 가려던 화면을 로그인 화면에 넘긴다', async () => {
    const { router } = renderCallback('error', '/submissions')
    await expectFailure(router, GITHUB_FAILED)
    expect((router.state.location.state as { from?: unknown }).from).toBe('/submissions')
  })

  it('사이트 밖 주소를 기억해 뒀으면 버린다', async () => {
    // sessionStorage는 사용자가 고칠 수 있다. safeRedirect를 거치지 않으면 open redirect다.
    const { router } = renderCallback('error', 'https://evil.test/')
    await expectFailure(router, GITHUB_FAILED)
    expect((router.state.location.state as { from?: unknown }).from).toBe('/problems')
  })

  it('기억해 둔 주소는 한 번 쓰면 지운다', async () => {
    renderCallback('error', '/submissions')
    await screen.findByRole('heading', { name: '로그인 도착' })
    // 남겨 두면 다음에 다른 화면에서 시작한 GitHub 로그인이 옛 주소로 끌려간다.
    expect(sessionStorage.getItem(FROM_KEY)).toBeNull()
  })

  describe('result=signup', () => {
    it('닉네임 칸을 보여 준다', async () => {
      renderCallback('signup')
      expect(await screen.findByLabelText('닉네임')).toBeInTheDocument()
      // 비밀번호는 만들지 않는다(명세 COM-02).
      expect(screen.queryByLabelText('비밀번호')).not.toBeInTheDocument()
    })

    it('닉네임 칸에서 Enter를 누르면 가입된다', async () => {
      // 칸이 하나뿐인 화면이다. form으로 감싸지 않으면 Enter가 아무 일도 하지 않아
      // 키보드만 쓰는 사람은 [중복 확인]을 지나 Tab으로 버튼까지 가야 한다.
      const user = userEvent.setup()
      await visitGitHub()
      const { router } = renderCallback('signup')

      await user.type(await screen.findByLabelText('닉네임'), '깃허브사람')
      await user.click(screen.getByRole('button', { name: '중복 확인' }))
      expect(await screen.findByText('쓸 수 있어요')).toBeInTheDocument()

      await user.type(screen.getByLabelText('닉네임'), '{Enter}')

      expect(await screen.findByRole('heading', { name: '로그인 도착' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
    })

    it('중복 확인 전에 Enter를 눌러도 가입 요청이 나가지 않는다', async () => {
      // 브라우저마다 비활성 버튼과 암묵적 제출의 조합이 달라, 버튼이 꺼져 있다는 것만으로는
      // Enter를 막았다고 할 수 없다.
      const user = userEvent.setup()
      await visitGitHub()
      const { router } = renderCallback('signup')

      await user.type(await screen.findByLabelText('닉네임'), '깃허브사람{Enter}')

      expect(router.state.location.pathname).toBe('/login/github')
      expect(screen.getByLabelText('닉네임')).toBeInTheDocument()
    })

    it('이미 로그인한 사람에게는 닉네임 폼을 보여 주지 않는다', async () => {
      // 보여 주면 [가입 완료]가 VERIFICATION_EXPIRED를 받고, 로그인 화면은 로그인 상태라
      // 그 문구를 넘겨 버려 설명 없이 떠내려간다.
      await logIn()
      const { router } = renderCallback('signup')

      expect(await screen.findByRole('heading', { name: '문제 목록 도착' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/problems')
    })

    it('중복 확인을 하지 않았으면 [가입 완료]가 꺼져 있다', async () => {
      const user = userEvent.setup()
      renderCallback('signup')
      await user.type(await screen.findByLabelText('닉네임'), '깃허브사람')
      expect(screen.getByRole('button', { name: '가입 완료' })).toBeDisabled()
    })

    it('닉네임만 정하면 가입되고, 로그인 화면으로 보내며 안내를 싣는다', async () => {
      const user = userEvent.setup()
      await visitGitHub()
      const { router } = renderCallback('signup', '/submissions')

      await user.type(await screen.findByLabelText('닉네임'), '깃허브사람')
      await user.click(screen.getByRole('button', { name: '중복 확인' }))
      expect(await screen.findByText('쓸 수 있어요')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: '가입 완료' }))

      expect(await screen.findByRole('heading', { name: '로그인 도착' })).toBeInTheDocument()
      const state = router.state.location.state as { notice?: unknown; from?: unknown }
      // 이메일 가입과 다른 문구다 — 이 계정에는 비밀번호가 없다(명세 COM-02).
      expect(state.notice).toBe('가입이 완료됐어요. GitHub로 다시 로그인해 주세요')
      // 가입은 로그인시키지 않는다(계약 204). 로그인한 뒤 가려던 화면으로 가야 한다.
      expect(state.from).toBe('/submissions')
    })

    it('증명서가 없으면 GitHub 로그인부터 다시 하게 한다', async () => {
      const user = userEvent.setup()
      // visitGitHub를 하지 않았다 — 30분이 지나 쿠키가 사라진 상태와 같다.
      const { router } = renderCallback('signup')

      await user.type(await screen.findByLabelText('닉네임'), '깃허브사람')
      await user.click(screen.getByRole('button', { name: '중복 확인' }))
      await user.click(await screen.findByRole('button', { name: '가입 완료' }))

      // 닉네임을 고쳐도 풀리지 않는다. 서버 문구를 그대로 싣는다.
      await expectFailure(router, '인증 시간이 지났어요. GitHub 로그인을 다시 해 주세요')
    })

    it('이미 쓰는 닉네임이면 확인 단계에서 걸러진다', async () => {
      const user = userEvent.setup()
      await visitGitHub()
      renderCallback('signup')

      await user.type(await screen.findByLabelText('닉네임'), mockAccounts[0]!.user.nickname)
      await user.click(screen.getByRole('button', { name: '중복 확인' }))

      expect(await screen.findByText('이미 사용 중인 닉네임이에요')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '가입 완료' })).toBeDisabled()
    })

    it('가입 때 닉네임이 선점되면 그 화면에 머물고 닉네임 칸으로 돌아간다', async () => {
      const user = userEvent.setup()
      await visitGitHub()
      // 확인 시점에는 비어 있었다가 가입 시점에 선점된 경쟁을 만든다.
      server.use(
        http.get('*/api/auth/nickname-availability', () => HttpResponse.json({ available: true }), {
          once: true,
        }),
      )
      const { router } = renderCallback('signup')

      await user.type(await screen.findByLabelText('닉네임'), mockAccounts[0]!.user.nickname)
      await user.click(screen.getByRole('button', { name: '중복 확인' }))
      await user.click(await screen.findByRole('button', { name: '가입 완료' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('이미 사용 중인 닉네임이에요')
      // 명세가 "닉네임만 다시 입력"으로 정했다. 화면을 떠나지 않는다.
      expect(router.state.location.pathname).toBe('/login/github')
      expect(screen.getByLabelText('닉네임')).toHaveFocus()
      expect(screen.getByRole('button', { name: '가입 완료' })).toBeDisabled()
    })

    it('같은 GitHub 계정으로 이미 가입했으면 GitHub 로그인부터 다시 하게 한다', async () => {
      const user = userEvent.setup()
      await visitGitHub()
      // 다른 브라우저에서 같은 GitHub 계정으로 먼저 가입을 마친 상태다. 목으로는 만들 수
      // 없다 — 가입에 성공하면 서버도 목도 증명서 쿠키를 지워(GitHubLoginController) 같은
      // 브라우저에서는 이 경우에 닿지 못한다. 서버 응답만 흉내 낸다.
      server.use(
        http.post('*/api/auth/github/signup', () =>
          HttpResponse.json(
            {
              status: 409,
              code: 'ALREADY_REGISTERED',
              detail: '이미 가입한 GitHub 계정이에요. GitHub 로그인을 다시 해 주세요',
            },
            { status: 409 },
          ),
        ),
      )
      const { router } = renderCallback('signup')

      await user.type(await screen.findByLabelText('닉네임'), '깃허브사람')
      await user.click(screen.getByRole('button', { name: '중복 확인' }))
      await user.click(await screen.findByRole('button', { name: '가입 완료' }))

      await expectFailure(router, '이미 가입한 GitHub 계정이에요. GitHub 로그인을 다시 해 주세요')
    })
  })

  describe('result=success', () => {
    it('세션을 들이고 기억해 둔 화면으로 간다', async () => {
      // 가입을 마치면 다음 GitHub 로그인은 success로 돌아오고 refresh 쿠키가 심긴다.
      await visitGitHub()
      await gitHubSignUp('깃허브사람')
      await visitGitHub()

      const { router, client } = renderCallback('success', '/submissions')

      expect(await screen.findByRole('heading', { name: '제출 기록 도착' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/submissions')
      // 헤더가 바로 사용자 메뉴로 바뀌어야 한다 — /api/users/me 왕복을 한 번 더 기다리지 않는다.
      await waitFor(() => expect(client.getQueryData(['me'])).toEqual(mockAccounts[0]!.user))
    })

    it('진행 중에는 확인 중임을 알린다', async () => {
      await visitGitHub()
      await gitHubSignUp('깃허브사람')
      await visitGitHub()
      renderCallback('success')
      // ListSkeleton도 role="status"다. 역할로 집으면 둘이 걸려 애매해진다.
      expect(screen.getByText(/GitHub 계정을 확인하고 있어요/)).toHaveAttribute('role', 'status')
    })

    it('갱신이 401이면(세션이 없으면) 로그인 화면에 실패를 알린다', async () => {
      // success라고 돌아왔지만 갱신이 401이다. 성공으로 보이는 화면을 남기지 않는다.
      //
      // 쿠키가 없는 상태에 기대지 않고 응답을 직접 꾸민다. MSW의 쿠키 항아리는 테스트
      // 사이에 비워지지 않고, 앞 테스트가 남긴 갱신 요청이 afterEach의 로그아웃 **뒤에**
      // 도착해 쿠키를 다시 심는다 — 그러면 이 테스트가 이유 없이 통과한다.
      server.use(
        http.post('*/api/auth/refresh', () =>
          HttpResponse.json({ status: 401, title: 'Unauthorized' }, { status: 401 }),
        ),
      )

      const { router } = renderCallback('success')
      await expectFailure(router, GITHUB_FAILED)
    })

    it('토큰은 받았는데 사용자를 못 받으면 반쪽 세션을 남기지 않는다', async () => {
      await visitGitHub()
      await gitHubSignUp('깃허브사람')
      await visitGitHub()
      server.use(
        http.get('*/api/users/me', () =>
          HttpResponse.json({ status: 500, title: 'Internal Server Error' }, { status: 500 }),
        ),
      )

      const { router, client } = renderCallback('success')
      await expectFailure(router, GITHUB_FAILED)
      expect(client.getQueryData(['me'])).toBeUndefined()
    })
  })
})

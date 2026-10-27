import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import type { ProblemInput } from '@/api/types'
import { createQueryClient } from '@/app/queryClient'
import { resetAdminProblems } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { Component as AdminProblemFormPage } from './AdminProblemFormPage'

/**
 * 세 주소를 모두 등록해 그린다. 저장 뒤 `/admin/problems/:id`로 넘어가는 것까지 보려면
 * 수정 주소가 라우터에 있어야 한다. RequireAdmin은 끼우지 않는다 — 권한으로 막는 것은
 * 그쪽 테스트가 보고, 목 핸들러는 세션을 보지 않는다.
 */
function renderPage(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/admin/problems/new', Component: AdminProblemFormPage },
      { path: '/admin/problems/:id', Component: AdminProblemFormPage },
      { path: '/admin/problems/:id/versions/:versionNo', Component: AdminProblemFormPage },
      { path: '/admin', element: <h1>문제 관리</h1> },
    ],
    { initialEntries: [path] },
  )

  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return router
}

function field(label: string) {
  return screen.getByLabelText(label)
}

/** 언어별 칸은 이름이 같다('시간 제한 (ms)'). 묶음으로 좁혀 집는다. */
function limits(language: string) {
  return within(screen.getByRole('group', { name: language }))
}

/** 제목 칸에 값이 들어오면 상세를 받아 폼이 채워진 것이다. */
async function waitForLoaded(title: string) {
  await waitFor(() => expect(field('제목')).toHaveValue(title))
}

/** 저장을 누르고 결과 안내를 돌려준다. 안내는 어느 버전에 저장됐는지 말한다(ADM-07). */
async function save(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '저장' }))
  return screen.findByRole('status')
}

// 등록·수정이 목 상태를 고친다. 되돌리지 않으면 뒤 테스트가 다른 문제를 본다.
afterEach(() => resetAdminProblems())

describe('AdminProblemFormPage', () => {
  it('없는 문제 주소는 안내를 보여 준다', () => {
    renderPage('/admin/problems/abc')

    expect(screen.getByRole('heading', { level: 1, name: '없는 문제입니다' })).toBeInTheDocument()
  })

  it('기존 문제를 열면 저장된 값이 채워진다', async () => {
    renderPage('/admin/problems/1')

    await waitForLoaded('두 수의 합')
    expect(field('출처')).toHaveValue('LeetCode 1. Two Sum')
  })

  /**
   * 탭으로 가린 칸의 오류는 보이지 않는다. 그대로 두면 저장을 눌러도 아무 일이 없는
   * 것처럼 보이고 어디가 틀렸는지 알 길이 없다.
   */
  it('제목을 비우고 저장하면 기본 정보 탭으로 돌아가 오류를 보여 준다', async () => {
    const user = userEvent.setup()
    renderPage('/admin/problems/1')
    await waitForLoaded('두 수의 합')

    // 숨은 탭에서 지운다. TabsContent가 숨은 탭을 떼어 내므로 순서가 이렇게 된다 —
    // 떼어 내도 react-hook-form은 값을 들고 있어(shouldUnregister 기본값) 그대로 제출된다.
    await user.clear(field('제목'))
    await user.click(screen.getByRole('tab', { name: '지문' }))
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(await screen.findByText('제목을 입력해 주세요')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '기본 정보' })).toHaveAttribute('aria-selected', 'true')
  })

  /**
   * **#33에서 바뀐 정책이다.** 글만 고치면 새 버전이 생기지 않고 최신 버전을 그 자리에서
   * 고친다. 그 버전이 공개 중이면 사용자 화면에 바로 나가므로 그 말을 해 줘야 한다.
   */
  it('글만 고치면 공개 중인 버전에 바로 반영한다', async () => {
    const user = userEvent.setup()
    renderPage('/admin/problems/1')
    await waitForLoaded('두 수의 합')

    await user.type(field('제목'), ' (수정)')
    const notice = await save(user)

    expect(notice).toHaveTextContent('공개 중인 v1')
    expect(notice).toHaveTextContent('바로')
  })

  /** 채점 기준이 바뀌면 새 초안이 생긴다. 공개 중인 버전은 그대로 사용자에게 간다. */
  it('제한값을 고치면 새 초안을 만든다', async () => {
    const user = userEvent.setup()
    renderPage('/admin/problems/1')
    await waitForLoaded('두 수의 합')

    await user.click(screen.getByRole('tab', { name: '지문' }))
    const cppTime = limits('C++').getByLabelText('시간 제한 (ms)')
    await user.clear(cppTime)
    await user.type(cppTime, '3000')
    const notice = await save(user)

    expect(notice).toHaveTextContent('새 초안 v2')
    expect(notice).toHaveTextContent('사용자는 v1')
  })

  /**
   * Python 제한을 C++과 같은 값으로 저장하면 **그 문제의 Python 제출이 전부 시간 초과**가
   * 된다 — 채점기는 저장된 값을 그대로 쓴다(`docs/judge-verdict-mapping.md` 1절).
   * 보여 주기만 해서는 안 되므로, 저장한 뒤 다시 받아 온 값으로 확인한다.
   */
  it('Python 제한을 C++ 값에서 계산해 보낸다', async () => {
    const user = userEvent.setup()
    // 보낸 본문을 직접 본다. 화면에 뜬 값만 보면, 저장될 때 옛 값이 가더라도 통과한다.
    const sent: ProblemInput[] = []
    server.use(
      http.post('*/api/admin/problems', async ({ request }) => {
        sent.push((await request.json()) as ProblemInput)
        return HttpResponse.json({ id: 99 }, { status: 201 })
      }),
    )
    renderPage('/admin/problems/new')

    await user.type(field('제목'), '보정값 문제')
    await user.click(screen.getByRole('tab', { name: '지문' }))

    const cppTime = limits('C++').getByLabelText('시간 제한 (ms)')
    await user.clear(cppTime)
    await user.type(cppTime, '2000')
    expect(limits('Python').getByLabelText('시간 제한 (ms)')).toHaveValue(8000)

    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]?.languages.find((entry) => entry.language === 'PYTHON')).toMatchObject({
      timeLimitMs: 8000,
      memoryLimitMb: 512,
    })
  })

  it('검증 중인 문제는 저장할 수 없다', async () => {
    renderPage('/admin/problems/11')

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('검증하는 중'))
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()
  })

  it('지난 버전은 읽기 전용이다', async () => {
    renderPage('/admin/problems/9/versions/1')

    await waitForLoaded('연습 문제 9')
    expect(field('제목')).toBeDisabled()
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()
  })

  it('새 문제를 저장하면 수정 주소로 넘어간다', async () => {
    const user = userEvent.setup()
    const router = renderPage('/admin/problems/new')

    await user.type(field('제목'), '새로 만든 문제')
    const notice = await save(user)

    expect(notice).toHaveTextContent('만들었어요')
    expect(router.state.location.pathname).toMatch(/^\/admin\/problems\/\d+$/)
  })

  it('버전 탭은 버전을 최신부터 보여 준다', async () => {
    const user = userEvent.setup()
    renderPage('/admin/problems/9')
    await waitForLoaded('연습 문제 9')

    await user.click(screen.getByRole('tab', { name: '버전' }))

    const links = await screen.findAllByRole('link', { name: /^v\d+$/ })
    expect(links.map((link) => link.textContent)).toEqual(['v2', 'v1'])
  })
})

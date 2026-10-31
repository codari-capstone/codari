import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import type { ProblemInput } from '@/api/types'
import { createQueryClient } from '@/app/queryClient'
import { ThemeProvider } from '@/app/ThemeProvider'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { resetAdminProblems } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { Component as AdminProblemFormPage } from './AdminProblemFormPage'

/**
 * 세 주소를 모두 등록해 그린다. 저장 뒤 `/admin/problems/:id`로 넘어가는 것까지 보려면
 * 수정 주소가 라우터에 있어야 한다. RequireAdmin은 끼우지 않는다 — 권한으로 막는 것은
 * 그쪽 테스트가 보고, 목 핸들러는 세션을 보지 않는다.
 */
function renderPage(path: string, seed?: (client: QueryClient) => void) {
  const client = createQueryClient()
  // 그리기 전에 심는다. 쿼리는 첫 렌더에 바로 떠나므로, 뒤에 심으면 401 처리가 먼저 돈다.
  seed?.(client)

  const router = createMemoryRouter(
    [
      { path: '/admin/problems/new', Component: AdminProblemFormPage },
      { path: '/admin/problems/:id', Component: AdminProblemFormPage },
      { path: '/admin/problems/:id/versions/:versionNo', Component: AdminProblemFormPage },
      { path: '/admin', element: <h1>문제 관리</h1> },
    ],
    { initialEntries: [path] },
  )

  // 정답 코드 탭의 CodeEditor가 앱 테마를 읽는다. 실제 앱은 루트에 두고 있다.
  render(
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  )

  return { router, client }
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
    const { router } = renderPage('/admin/problems/new')

    await user.type(field('제목'), '새로 만든 문제')
    const notice = await save(user)

    expect(notice).toHaveTextContent('만들었어요')
    expect(router.state.location.pathname).toMatch(/^\/admin\/problems\/\d+$/)
  })

  /**
   * `fieldset disabled`는 안에 있는 **버튼까지** 잠근다. 탭 버튼이 그 안에 있으면 읽기
   * 전용 화면이 '기본 정보'에 갇혀, 지난 버전의 지문도 버전 목록도 볼 수 없다.
   */
  it('읽기 전용 화면에서도 탭을 바꿀 수 있다', async () => {
    const user = userEvent.setup()
    renderPage('/admin/problems/9/versions/1')
    await waitForLoaded('연습 문제 9')

    await user.click(screen.getByRole('tab', { name: '지문' }))

    // 탭은 열리지만 칸은 그대로 잠겨 있어야 한다.
    const cppTime = limits('C++').getByLabelText('시간 제한 (ms)')
    expect(cppTime).toBeVisible()
    expect(cppTime).toBeDisabled()

    await user.click(screen.getByRole('tab', { name: '버전' }))
    expect(await screen.findByRole('link', { name: 'v2' })).toBeInTheDocument()
  })

  /**
   * 버전 탭은 `<form>` 안에 있다. `type` 없는 버튼은 기본값이 submit이라, 버전 목록이
   * 실패해 뜬 '다시 시도'를 누르면 **작성 중인 수정이 공개 중인 버전에 저장된다.**
   */
  it("버전 목록의 '다시 시도'는 저장을 일으키지 않는다", async () => {
    const user = userEvent.setup()
    const sent: unknown[] = []
    server.use(
      http.get('*/api/admin/problems/:id/versions', () =>
        HttpResponse.json({ status: 503, title: 'Service Unavailable' }, { status: 503 }),
      ),
      http.put('*/api/admin/problems/:id', async ({ request }) => {
        sent.push(await request.json())
        return HttpResponse.json({ versionNo: 1, status: 'PUBLISHED' })
      }),
    )
    renderPage('/admin/problems/1')
    await waitForLoaded('두 수의 합')

    await user.type(field('제목'), ' (고치던 중)')
    await user.click(screen.getByRole('tab', { name: '버전' }))

    // retry:1이라 첫 시도 실패 뒤 재시도 지연을 거쳐야 '다시 시도'가 뜬다.
    await user.click(await screen.findByRole('button', { name: '다시 시도' }, { timeout: 3000 }))

    expect(sent).toHaveLength(0)
    // role=status는 다시 불러오는 스켈레톤도 쓴다. 저장 안내인지 글로 가린다.
    expect(screen.queryByText(/저장했어요|반영했어요/)).not.toBeInTheDocument()
  })

  /**
   * 수정 화면과 버전 보기는 형제 라우트라, key가 없으면 같은 인스턴스가 이어진다. 그러면
   * 'v1 보기'에 방금 저장 문구가 남아, 지난 버전을 저장한 것처럼 읽힌다.
   */
  it('저장한 뒤 버전 보기로 가면 저장 안내가 남지 않는다', async () => {
    const user = userEvent.setup()
    renderPage('/admin/problems/9')
    await waitForLoaded('연습 문제 9')

    await user.type(field('제목'), ' (수정)')
    expect(await save(user)).toHaveTextContent('저장했어요')

    await user.click(screen.getByRole('tab', { name: '버전' }))
    await user.click(await screen.findByRole('link', { name: 'v1' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'v1 보기' })).toBeInTheDocument()
    expect(screen.queryByText(/저장했어요/)).not.toBeInTheDocument()
  })

  it('저장이 실패하면 지난 성공 안내를 지운다', async () => {
    const user = userEvent.setup()
    renderPage('/admin/problems/1')
    await waitForLoaded('두 수의 합')

    await user.type(field('제목'), ' (수정)')
    await save(user)

    server.use(
      http.put('*/api/admin/problems/:id', () =>
        HttpResponse.json({ status: 409, title: 'Conflict' }, { status: 409 }),
      ),
    )
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  /** 공개 중인 버전을 고치면 사용자 화면에 바로 나간다. 그 캐시를 두면 옛 글이 보인다. */
  it('저장하면 사용자 화면 캐시도 버린다', async () => {
    const user = userEvent.setup()
    const { client } = renderPage('/admin/problems/1', (seeded) => {
      seeded.setQueryData(['problem', 1], { id: 1, title: '옛 제목' })
    })
    await waitForLoaded('두 수의 합')

    await user.type(field('제목'), ' (수정)')
    await save(user)

    await waitFor(() => expect(client.getQueryState(['problem', 1])?.isInvalidated).toBe(true))
  })

  /** 읽기도 401로 끝날 수 있다. 저장만 세션을 정리하면 로그인 화면으로 가지 않는다. */
  it('상세 조회가 401이면 세션을 버린다', async () => {
    server.use(
      http.get('*/api/admin/problems/:id', () =>
        HttpResponse.json({ status: 401, title: 'Unauthorized' }, { status: 401 }),
      ),
    )
    const { client } = renderPage('/admin/problems/1', (seeded) => {
      seeded.setQueryData(ME_QUERY_KEY, { id: 1, nickname: '코다리', role: 'ADMIN' })
    })

    await waitFor(() => expect(client.getQueryData(ME_QUERY_KEY)).toBeNull(), { timeout: 3000 })
  })

  it('태그를 못 불러오면 이유와 다시 시도를 보여 준다', async () => {
    server.use(
      http.get('*/api/concept-tags', () =>
        HttpResponse.json({ status: 503, title: 'Service Unavailable' }, { status: 503 }),
      ),
    )
    renderPage('/admin/problems/new')

    // retry:1이라 첫 시도 실패 뒤 재시도 지연을 거쳐야 error 상태가 된다.
    expect(
      await screen.findByRole('button', { name: '다시 시도' }, { timeout: 3000 }),
    ).toBeInTheDocument()
    expect(screen.queryByText('태그를 불러오는 중…')).not.toBeInTheDocument()
  })

  /**
   * C++ 값은 범위 안인데 보정된 Python 값이 상한을 넘어 거절되는 경우다. 서버 문구는
   * 범위만 알려 주므로, 잠긴 칸이 원인이라는 말을 화면이 해야 한다.
   *
   * 새 문제로 본다 — 기존 fixture의 Python 값은 보정식과 달라 '직접 입력'으로 열리고,
   * 그때는 관리자가 넣은 값이라 이 안내가 틀린 말이 된다.
   */
  it('상한을 넘겼다는 응답이면 잠긴 Python 칸을 짚어 준다', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('*/api/admin/problems', () =>
        HttpResponse.json(
          { status: 400, title: 'Bad Request', code: 'LIMIT_OUT_OF_RANGE' },
          { status: 400 },
        ),
      ),
    )
    renderPage('/admin/problems/new')

    await user.type(field('제목'), '제한이 큰 문제')
    await user.click(screen.getByRole('tab', { name: '지문' }))
    const cppTime = limits('C++').getByLabelText('시간 제한 (ms)')
    await user.clear(cppTime)
    await user.type(cppTime, '7000')
    // 잠긴 칸이 상한(20초)을 넘겼다. 화면은 상한을 모르고, 서버가 거절해야 안다.
    expect(limits('Python').getByLabelText('시간 제한 (ms)')).toHaveValue(23000)

    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('직접 입력')
  })

  /**
   * 케이스 저장은 다른 API다(`PUT .../test-cases`). `<form>` 안에 `<form>`은 쓸 수 없어
   * 폼을 탭별로 나눠 뒀다 — 한 폼으로 두면 케이스 저장이 문제 수정까지 보내거나,
   * 두 저장 버튼이 한 화면에 뜬다.
   */
  it('케이스 탭에서는 문제 저장 버튼이 보이지 않는다', async () => {
    const user = userEvent.setup()
    renderPage('/admin/problems/1')
    await waitForLoaded('두 수의 합')
    expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '테스트케이스' }))

    expect(await screen.findByRole('button', { name: '케이스 저장' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()
  })

  it('케이스를 저장해도 문제 수정은 보내지 않는다', async () => {
    const user = userEvent.setup()
    const sent: string[] = []
    server.use(
      http.put('*/api/admin/problems/:id', () => {
        sent.push('problem')
        return HttpResponse.json({ versionNo: 1, status: 'PUBLISHED' })
      }),
      http.put('*/api/admin/problems/:id/test-cases', () => {
        sent.push('test-cases')
        return HttpResponse.json({ versionNo: 2, status: 'DRAFT' })
      }),
    )
    renderPage('/admin/problems/1')
    await waitForLoaded('두 수의 합')

    await user.click(screen.getByRole('tab', { name: '테스트케이스' }))
    await user.click(await screen.findByRole('button', { name: '케이스 저장' }))

    await waitFor(() => expect(sent).toEqual(['test-cases']))
  })

  it('새 문제에는 케이스 탭이 없다', async () => {
    renderPage('/admin/problems/new')

    // 문제 번호가 없으면 부를 API가 없다. 버전 탭과 같은 처리다.
    expect(screen.queryByRole('tab', { name: '테스트케이스' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '버전' })).not.toBeInTheDocument()
  })

  // 리뷰 지적(major): Radix는 보이지 않는 패널을 언마운트한다. 케이스 폼이 그 안에 있어
  // 탭을 옮기면 ZIP으로 읽은 내용과 고친 행이 안내도 없이 사라졌다.
  it('탭을 옮겨도 ZIP으로 읽은 케이스가 남는다', async () => {
    const user = userEvent.setup()
    renderPage('/admin/problems/1')
    await waitForLoaded('두 수의 합')

    await user.click(screen.getByRole('tab', { name: '테스트케이스' }))
    await screen.findByRole('button', { name: '케이스 저장' })
    // 숨은 파일 칸이라 change를 직접 쏜다 (userEvent.upload는 display:none을 못 누른다).
    fireEvent.change(screen.getByLabelText('ZIP 파일'), {
      target: { files: [new File([new Uint8Array(10)], 'cases.zip', { type: 'application/zip' })] },
    })
    await screen.findByText(/3개를 읽었어요/)

    await user.click(screen.getByRole('tab', { name: '지문' }))
    await user.click(screen.getByRole('tab', { name: '테스트케이스' }))

    expect(screen.getByText(/공개 예제 2개 · 비공개 1개/)).toBeInTheDocument()
    expect(screen.getByText(/저장을 눌러야/)).toBeInTheDocument()
  })

  it('정답 코드 탭에서는 문제 저장 버튼이 보이지 않는다', async () => {
    const user = userEvent.setup()
    renderPage('/admin/problems/1')
    await waitForLoaded('두 수의 합')
    expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '정답 코드' }))

    expect(await screen.findByRole('button', { name: '정답 코드 저장' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()
  })

  /**
   * Radix는 보이지 않는 패널을 언마운트한다. 케이스 탭과 같은 이유로 한 번 열면
   * `forceMount`로 붙잡아 둔다 — 그러지 않으면 쓰던 정답 코드가 안내도 없이 사라진다.
   */
  it('탭을 옮겨도 고치던 정답 코드가 남는다', async () => {
    const user = userEvent.setup()
    renderPage('/admin/problems/1')
    await waitForLoaded('두 수의 합')

    await user.click(screen.getByRole('tab', { name: '정답 코드' }))
    const editor = await screen.findByRole('textbox', { name: 'Python 코드 편집기' })
    await user.click(editor)
    await user.keyboard('{Control>}a{/Control}{Delete}')
    await user.paste('print(살려주세요)')

    await user.click(screen.getByRole('tab', { name: '지문' }))
    await user.click(screen.getByRole('tab', { name: '정답 코드' }))

    expect(screen.getByRole('textbox', { name: 'Python 코드 편집기' })).toHaveTextContent(
      'print(살려주세요)',
    )
  })

  // 케이스 탭과 같은 이유다. GET .../solutions도 버전을 받지 않아 최신 버전만 준다 —
  // v1 화면에 v2 초안의 코드가 v1 것처럼 보인다.
  it('지난 버전 보기에는 정답 코드 탭이 없다', async () => {
    renderPage('/admin/problems/1/versions/1')
    await waitForLoaded('두 수의 합')

    expect(screen.queryByRole('tab', { name: '정답 코드' })).not.toBeInTheDocument()
  })

  // 리뷰 지적(major): GET .../test-cases는 버전을 받지 않아 최신 버전만 준다. 지난 버전
  // 화면에 탭을 두면 v2 초안의 케이스가 v1 것처럼 보인다.
  it('지난 버전 보기에는 케이스 탭이 없다', async () => {
    renderPage('/admin/problems/1/versions/1')
    await waitForLoaded('두 수의 합')

    expect(screen.queryByRole('tab', { name: '테스트케이스' })).not.toBeInTheDocument()
    // 버전 탭은 남는다 — 버전 사이를 옮기는 길이다.
    expect(screen.getByRole('tab', { name: '버전' })).toBeInTheDocument()
  })

  // 리뷰 지적(major): 케이스를 저장하면 공개 조건이 바뀌어 상세가 재조회된다. 그때 폼을
  // 통째로 reset하면 기본 정보 탭에서 고치던 제목이 저장 전 값으로 돌아간다.
  it('케이스를 저장해도 고치던 제목은 그대로다', async () => {
    const user = userEvent.setup()
    const { client } = renderPage('/admin/problems/1')
    await waitForLoaded('두 수의 합')
    const beforeSave = client.getQueryState(['admin-problem', 1])?.dataUpdatedAt ?? 0

    await user.clear(field('제목'))
    await user.type(field('제목'), '세 수의 합')

    await user.click(screen.getByRole('tab', { name: '테스트케이스' }))
    // 케이스를 바꿔야 서버가 새 초안을 만들어 상세가 실제로 달라진다. 그대로 저장하면
    // 목이 같은 버전에 저장해, 상세가 같아 폼을 되돌릴 일도 없다 — 버그를 비껴간다.
    await user.click(await screen.findByRole('button', { name: '케이스 더하기' }))
    await user.click(screen.getByRole('button', { name: '케이스 저장' }))
    await screen.findByText(/정답 코드를 다시 검증해야 해요/)
    // 상세 재조회가 **끝난 뒤**에 봐야 한다. 폼을 되돌리는 것은 저장이 아니라 그 재조회다
    // — 기다리지 않고 단정하면 버그가 있어도 테스트가 통과한다.
    await waitFor(() =>
      expect(client.getQueryState(['admin-problem', 1])?.dataUpdatedAt ?? 0).toBeGreaterThan(
        beforeSave,
      ),
    )

    await user.click(screen.getByRole('tab', { name: '기본 정보' }))
    expect(field('제목')).toHaveValue('세 수의 합')
  })

  // 2차 리뷰(major): 케이스 탭을 forceMount로 붙잡아 두자, 반대 방향이 열렸다 — 문제
  // 저장이 ['admin-problem', id]를 무효화하면 접두사가 같아 케이스 목록까지 다시 불린다.
  it('문제를 저장해도 저장 전 케이스 편집은 남는다', async () => {
    const user = userEvent.setup()
    renderPage('/admin/problems/1')
    await waitForLoaded('두 수의 합')

    await user.click(screen.getByRole('tab', { name: '테스트케이스' }))
    fireEvent.change(await screen.findByLabelText('ZIP 파일'), {
      target: { files: [new File([new Uint8Array(10)], 'cases.zip', { type: 'application/zip' })] },
    })
    await screen.findByText(/3개를 읽었어요/)

    // 문제를 고쳐 저장한다 — 상세가 달라져야 케이스 목록까지 다시 불린다.
    await user.click(screen.getByRole('tab', { name: '기본 정보' }))
    await user.clear(field('제목'))
    await user.type(field('제목'), '세 수의 합')
    await user.click(screen.getByRole('button', { name: '저장' }))
    await screen.findByText(/반영했어요|저장했어요/)

    await user.click(screen.getByRole('tab', { name: '테스트케이스' }))
    // ZIP으로 읽은 3개가 그대로여야 한다. 서버 목록으로 돌아가면 7개(비공개 5개)다.
    expect(screen.getByText(/공개 예제 2개 · 비공개 1개/)).toBeInTheDocument()
  })

  // 2차 리뷰(major): keepDirtyValues는 '고친 칸'만 남긴다. 파생된 Python 제한은
  // shouldDirty 없이 써넣고 있어 혼자 서버 값으로 되돌아갔다 — C++과 짝이 깨진다.
  it('케이스를 저장해도 보정된 Python 제한이 C++와 어긋나지 않는다', async () => {
    const user = userEvent.setup()
    const sent: ProblemInput[] = []
    server.use(
      http.put('*/api/admin/problems/:id', async ({ request }) => {
        sent.push((await request.json()) as ProblemInput)
        return HttpResponse.json({ versionNo: 3, status: 'DRAFT' })
      }),
    )
    renderPage('/admin/problems/1')
    await waitForLoaded('두 수의 합')

    await user.click(screen.getByRole('tab', { name: '지문' }))
    // 이 fixture의 Python 값(2000)은 보정식과 달라 '직접 입력'으로 열린다. 보정을 켠다.
    await user.click(screen.getByLabelText('Python 제한을 직접 입력'))
    const cppTime = limits('C++').getByLabelText('시간 제한 (ms)')
    await user.clear(cppTime)
    await user.type(cppTime, '2000')
    expect(limits('Python').getByLabelText('시간 제한 (ms)')).toHaveValue(8000)

    // 케이스를 저장해 상세를 다시 받게 한다.
    await user.click(screen.getByRole('tab', { name: '테스트케이스' }))
    await user.click(await screen.findByRole('button', { name: '케이스 더하기' }))
    await user.click(screen.getByRole('button', { name: '케이스 저장' }))
    await screen.findByText(/정답 코드를 다시 검증해야 해요/)

    // **기본 정보 탭에서** 저장한다. 지문 탭으로 돌아가면 StatementTab이 새로 마운트돼
    // 값이 다시 계산되므로 화면만 봐서는 드러나지 않는다 — 보낸 본문을 봐야 한다.
    await user.click(screen.getByRole('tab', { name: '기본 정보' }))
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(sent).toHaveLength(1))
    // Python이 서버 값(2000)으로 되돌아간 채 C++ 2000과 함께 저장되면, 그 문제의 Python
    // 제출은 전부 시간 초과가 된다. 다음에 열 때는 공식과 달라 '직접 입력'으로 굳는다.
    expect(sent[0]?.languages.find((entry) => entry.language === 'PYTHON')).toMatchObject({
      timeLimitMs: 8000,
      memoryLimitMb: 512,
    })
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

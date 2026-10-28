import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createQueryClient } from '@/app/queryClient'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { adminSummary, buildAdminProblems } from '@/mocks/fixtures/adminProblems'
import { server } from '@/mocks/server'
import { ADMIN_PAGE_SIZE } from './adminProblemQuery'
import { Component as AdminProblemListPage } from './AdminProblemListPage'

/**
 * RequireAdmin 없이 화면만 그린다. 권한으로 막는 것은 RequireAdmin의 테스트가 보고,
 * 목 핸들러는 세션을 보지 않으므로(handlers.ts) 여기서 403을 재현할 수도 없다.
 */
function renderPage() {
  const client = createQueryClient()
  client.setQueryData(ME_QUERY_KEY, { id: 1, nickname: '코다리', role: 'ADMIN' })
  const router = createMemoryRouter([{ path: '/admin', Component: AdminProblemListPage }], {
    initialEntries: ['/admin'],
  })

  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return client
}

/** 제목으로 줄을 집는다. 줄의 접근성 이름에는 칸의 글자가 모두 들어간다. */
function row(title: string) {
  return screen.getByRole('row', { name: new RegExp(title) })
}

describe('AdminProblemListPage', () => {
  it('제목이 h1이다', () => {
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: '문제 관리' })).toBeInTheDocument()
  })

  it('한 페이지에 20줄을 표로 보여 준다', async () => {
    renderPage()

    expect(await screen.findByRole('row', { name: /두 수의 합/ })).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(ADMIN_PAGE_SIZE + 1) // 머리 1 + 20
  })

  it('전체 개수를 알려 준다', async () => {
    renderPage()

    expect(await screen.findByText(`문제 ${buildAdminProblems().length}개`)).toBeInTheDocument()
  })

  /**
   * ADM-01의 핵심이다. 상태는 응답에 문구로 오지 않고 화면이 두 값으로 만든다 —
   * 그 합성이 실제 응답에 걸려 있는지를 본다(labels.test.ts는 함수만 본다).
   */
  describe('상태 (ADM-01)', () => {
    it('공개 중인 버전이 최신이면 "공개"다', async () => {
      renderPage()
      await screen.findByRole('row', { name: /두 수의 합/ })

      expect(within(row('두 수의 합')).getByText('공개')).toBeInTheDocument()
    })

    it('공개 버전 위에 초안이 있으면 둘을 함께 보여 준다', async () => {
      renderPage()
      await screen.findByRole('row', { name: /두 수의 합/ })

      expect(within(row('연습 문제 9')).getByText('공개 v1 · 수정 중')).toBeInTheDocument()
    })

    it('공개한 적이 없는 문제의 상태를 보여 준다', async () => {
      renderPage()
      await screen.findByRole('row', { name: /두 수의 합/ })

      expect(within(row('연습 문제 10')).getByText('작성 중')).toBeInTheDocument()
      expect(within(row('연습 문제 11')).getByText('검증 중')).toBeInTheDocument()
      expect(within(row('연습 문제 12')).getByText('비공개')).toBeInTheDocument()
    })

    // 초안이 있으면 최신 버전은 그 초안이다(계약). v1이 공개 중이어도 v2를 보여 준다.
    it('최신 버전 번호를 보여 준다', async () => {
      renderPage()
      await screen.findByRole('row', { name: /두 수의 합/ })

      expect(within(row('연습 문제 9')).getByText('v2')).toBeInTheDocument()
      expect(within(row('연습 문제 10')).getByText('v1')).toBeInTheDocument()
    })
  })

  describe('검색', () => {
    it('제목으로 걸러 낸다', async () => {
      const user = userEvent.setup()
      renderPage()
      await screen.findByRole('row', { name: /두 수의 합/ })

      await user.type(screen.getByLabelText('제목으로 검색'), '두')

      // 입력이 멈춘 뒤 300ms를 기다려 조회가 바뀐다.
      await waitFor(() => expect(screen.getByText('조건에 맞는 문제 1개')).toBeInTheDocument())
      expect(screen.getAllByRole('row')).toHaveLength(2) // 머리 1 + 1
    })

    it('결과가 없으면 검색어를 바꾸라고 알려 준다', async () => {
      const user = userEvent.setup()
      renderPage()
      await screen.findByRole('row', { name: /두 수의 합/ })

      await user.type(screen.getByLabelText('제목으로 검색'), '없는제목')

      expect(
        await screen.findByRole('heading', { name: '조건에 맞는 문제가 없습니다' }),
      ).toBeInTheDocument()
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })

    /**
     * 뒤 페이지를 보다가 검색하면 결과가 줄어 그 페이지는 빈 표가 된다. 검색어와 페이지를
     * 한 번에 바꾸므로 "결과보다 뒤인 페이지"가 되지 않는다.
     *
     * 1페이지로 돌아온 것만 보면 안 된다 — 되돌린 직후에는 캐시된 전체 목록 1페이지가
     * 그려지고 그 안에 이미 '두 수의 합'이 있어서, 디바운스된 검색어가 조회에 반영되지
     * 않는 회귀가 생겨도 통과한다. 검색 결과 수와 걸러진 줄까지 본다.
     */
    it('검색하면 1페이지의 검색 결과로 돌아온다', async () => {
      const user = userEvent.setup()
      renderPage()
      await screen.findByRole('row', { name: /두 수의 합/ })

      await user.click(screen.getByRole('button', { name: '다음' }))
      expect(await screen.findByRole('button', { name: '2페이지' })).toHaveAttribute(
        'aria-current',
        'page',
      )

      await user.type(screen.getByLabelText('제목으로 검색'), '두')

      await waitFor(() => expect(screen.getByText('조건에 맞는 문제 1개')).toBeInTheDocument())
      expect(screen.getByRole('row', { name: /두 수의 합/ })).toBeVisible()
      expect(screen.queryByRole('row', { name: /연습 문제 9/ })).not.toBeInTheDocument()
      // 한 페이지로 끝나면 이동할 곳이 없다.
      expect(screen.queryByRole('navigation', { name: '페이지' })).not.toBeInTheDocument()
    })

    /**
     * 공백만 있는 검색어는 검색이 아니다. 서버는 `isBlank`로 보아 전체를 돌려주므로,
     * 보내면 전체 목록을 '조건에 맞는 문제 25개'라고 말하게 된다.
     */
    it('공백만 있는 검색어는 검색으로 보지 않는다', async () => {
      const user = userEvent.setup()
      renderPage()
      await screen.findByRole('row', { name: /두 수의 합/ })

      await user.type(screen.getByLabelText('제목으로 검색'), '  ')

      await waitFor(() =>
        expect(screen.getByText(`문제 ${buildAdminProblems().length}개`)).toBeInTheDocument(),
      )
    })
  })

  /**
   * 결과보다 뒤인 페이지에 갇히지 않는다.
   *
   * 2페이지를 보는 중에 다른 관리자가 문제를 지우면 그 페이지는 빈 표가 된다. page는
   * 주소에 없어 새로고침으로도 못 나가므로, 빈 표에서도 페이지 이동을 띄워야 한다.
   */
  it('결과 범위 밖 페이지에서 앞 페이지로 돌아갈 수 있다', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('row', { name: /두 수의 합/ })

    // 다른 관리자가 1페이지 분량만 남기고 지운 상황이다. 2페이지는 빈 응답이 된다.
    server.use(
      http.get('*/api/admin/problems', ({ request }) => {
        const page = new URL(request.url).searchParams.get('page')
        return HttpResponse.json({
          content:
            page === '0' ? buildAdminProblems().slice(0, ADMIN_PAGE_SIZE).map(adminSummary) : [],
          totalElements: ADMIN_PAGE_SIZE,
        })
      }),
    )
    await user.click(screen.getByRole('button', { name: '다음' }))

    expect(
      await screen.findByRole('heading', { name: '이 페이지에는 문제가 없습니다' }),
    ).toBeInTheDocument()

    // 빈 표에서도 이동이 남아 있어야 나갈 수 있다.
    await user.click(screen.getByRole('button', { name: '이전' }))

    expect(await screen.findByRole('row', { name: /두 수의 합/ })).toBeInTheDocument()
  })

  it('다음 페이지로 넘어간다', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('row', { name: /두 수의 합/ })

    await user.click(screen.getByRole('button', { name: '다음' }))

    // 25개 중 1페이지 20개를 뺀 나머지다.
    await waitFor(() =>
      expect(screen.getAllByRole('row')).toHaveLength(
        buildAdminProblems().length - ADMIN_PAGE_SIZE + 1,
      ),
    )
    expect(screen.queryByRole('row', { name: /두 수의 합/ })).not.toBeInTheDocument()
  })

  it('실패하면 오류와 다시 시도를 보여 준다', async () => {
    server.use(
      http.get('*/api/admin/problems', () =>
        HttpResponse.json({ status: 500, detail: '서버 오류예요' }, { status: 500 }),
      ),
    )
    renderPage()

    // createQueryClient의 retry:1 때문에 첫 실패 뒤 재시도 지연을 거쳐야 오류가 된다.
    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })

  /**
   * 화면을 띄워 둔 채 세션이 끊기는 일이 생긴다 — 다른 탭에서 로그아웃하거나 만료된
   * 경우다. 문구만 띄우면 헤더와 RequireAuth는 계속 로그인 상태로 보아 길이 막힌다.
   */
  it('401이면 세션을 버린다', async () => {
    server.use(
      http.get('*/api/admin/problems', () =>
        HttpResponse.json({ status: 401, title: 'Unauthorized' }, { status: 401 }),
      ),
    )
    const client = renderPage()

    await waitFor(() => expect(client.getQueryData(ME_QUERY_KEY)).toBeNull(), { timeout: 3000 })
  })
})

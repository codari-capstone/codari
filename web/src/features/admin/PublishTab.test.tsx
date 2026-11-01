import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PublishCondition } from '@/api/types'
import { api } from '@/api/client'
import { createQueryClient } from '@/app/queryClient'
import { adminDetail, buildAdminProblems } from '@/mocks/fixtures/adminProblems'
import { resetAdminProblems } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { PublishTab } from './PublishTab'

/** 탭만 그린다. 탭 이동은 콜백으로 확인한다 — 탭 상태는 폼 페이지의 몫이다. */
function renderTab(options: { problemId?: number; locked?: boolean } = {}) {
  const { problemId = 10, locked = false } = options
  const onGoToTab = vi.fn()

  render(
    <QueryClientProvider client={createQueryClient()}>
      <PublishTab problemId={problemId} locked={locked} onGoToTab={onGoToTab} />
    </QueryClientProvider>,
  )
  return { onGoToTab }
}

/**
 * 상세를 원하는 모양으로 준다.
 *
 * 목의 기본 fixture에는 공개할 수 있는 초안이 없다(출처가 비어 있다). 조건을 다 채운
 * 화면을 보려면 이 핸들러가 필요하다.
 */
function serveDetail(partial: {
  status?: string
  versionNo?: number
  publishedVersionNo?: number | null
  unmetConditions?: PublishCondition[]
}) {
  server.use(
    http.get('*/api/admin/problems/:id', ({ params }) => {
      // fixture 상세를 그대로 쓰고 필요한 칸만 덮는다. 계약의 모양을 손으로 다시 적으면
      // 계약이 바뀌는 날 이 테스트만 통과한다. 핸들러 안에서 같은 주소를 fetch하면
      // 자기 자신을 다시 타므로 fixture에서 바로 만든다.
      const id = Number(params.id)
      const found = buildAdminProblems().find((item) => item.id === id)
      if (found === undefined) throw new Error(`fixture에 ${String(id)}번이 없다`)
      return HttpResponse.json({ ...adminDetail(found), ...partial })
    }),
  )
}

const publishButton = () => screen.getByRole('button', { name: '공개하기' })

/** 9번은 공개된 v1 위에 초안 v2가 있고, 못 채운 조건이 출처 하나뿐인 fixture다. */
const WITH_DRAFT = 9

/** 출처를 저장해 마지막 조건을 없앤다. 조건은 저장으로만 바뀐다(계약). */
async function fillSource(id: number): Promise<void> {
  const detail = await api.GET('/api/admin/problems/{id}', { params: { path: { id } } })
  if (detail.data === undefined) throw new Error('상세를 못 받았다')
  const saved = await api.PUT('/api/admin/problems/{id}', {
    params: { path: { id } },
    body: { ...detail.data, sourceName: '백준 1000번' },
  })
  if (saved.data === undefined) throw new Error('출처 저장 실패')
}

afterEach(() => {
  resetAdminProblems()
})

describe('PublishTab (ADM-06)', () => {
  it('못 채운 조건을 보여 주고 공개를 막는다', async () => {
    // 10번은 조건을 넷 못 채운 초안이다.
    renderTab()

    expect(await screen.findByText('공개 예제가 모자라요')).toBeInTheDocument()
    expect(screen.getByText('출처를 입력해 주세요')).toBeInTheDocument()
    expect(publishButton()).toBeDisabled()
  })

  it('조건마다 고칠 탭으로 보낸다', async () => {
    const user = userEvent.setup()
    const { onGoToTab } = renderTab()
    await screen.findByText('공개 예제가 모자라요')

    await user.click(screen.getAllByRole('button', { name: '테스트케이스 탭으로' })[0]!)

    expect(onGoToTab).toHaveBeenCalledWith('cases')
  })

  /**
   * 상세만 '다 채웠다'로 꾸미지 않는다. 공개 핸들러는 목의 실제 상태로 조건을 다시 세므로,
   * 꾸민 상세는 버튼만 켜 두고 누르면 409가 오는 — 서버에 있을 수 없는 — 화면이 된다.
   * 그래서 출처를 실제로 저장해 9번 초안의 마지막 조건을 없앤다.
   */
  it('조건을 다 채우면 공개할 수 있다', async () => {
    const user = userEvent.setup()
    await fillSource(WITH_DRAFT)
    renderTab({ problemId: WITH_DRAFT })

    expect(await screen.findByText('공개 조건을 모두 채웠어요.')).toBeInTheDocument()
    await user.click(publishButton())

    expect(await screen.findByRole('status')).toHaveTextContent('v2을 공개했어요')
    // 공개한 뒤에는 공개하기가 사라지고 비공개만 남는다 — 상세를 다시 받았다는 뜻이다.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '공개하기' })).not.toBeInTheDocument()
    })
  })

  /**
   * 조건은 내 화면 밖에서 바뀐다. 받아 둔 상세가 '다 채웠다'고 해도 거절이 올 수 있고,
   * 그때 서버가 준 조건을 그려야 한다 — 아니면 '다 채웠어요' 밑에 오류만 뜬다.
   */
  it('거절당하면 서버가 준 조건으로 다시 그린다', async () => {
    const user = userEvent.setup()
    serveDetail({ unmetConditions: [] })
    server.use(
      http.post('*/api/admin/problems/:id/publish', () =>
        HttpResponse.json(
          {
            status: 409,
            code: 'PUBLISH_CONDITIONS_NOT_MET',
            detail: '공개 조건을 채우지 못했어요',
            unmetConditions: ['SOLUTIONS_VERIFIED'],
          },
          { status: 409 },
        ),
      ),
    )
    renderTab()
    await screen.findByText('공개 조건을 모두 채웠어요.')

    await user.click(publishButton())

    expect(
      await screen.findByText('Python·C++ 정답 코드가 둘 다 검증을 통과해야 해요'),
    ).toBeInTheDocument()
    expect(screen.queryByText('공개 조건을 모두 채웠어요.')).not.toBeInTheDocument()
    expect(publishButton()).toBeDisabled()
  })

  it('검증 중이면 공개도 비공개도 못 누른다', async () => {
    serveDetail({ unmetConditions: [], publishedVersionNo: 1 })
    renderTab({ locked: true })

    await screen.findByText('공개 조건을 모두 채웠어요.')
    expect(publishButton()).toBeDisabled()
    expect(screen.getByRole('button', { name: '비공개로 내리기' })).toBeDisabled()
  })

  it('이미 공개 중인 버전에는 공개하기를 두지 않는다', async () => {
    // 1번은 조건을 다 채운 채 공개 중이다. 계약이 그 경우를 '아무것도 바꾸지 않는 204'로
    // 정했으니, 버튼을 두면 아무 일도 없는 응답에 '공개했어요'라고 알리게 된다.
    renderTab({ problemId: 1 })

    expect(await screen.findByText(/공개 중이에요/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '공개하기' })).not.toBeInTheDocument()
  })

  it('공개한 적이 없으면 비공개 버튼을 두지 않는다', async () => {
    renderTab()

    await screen.findByText('아직 공개한 적이 없어요')
    expect(screen.queryByRole('button', { name: '비공개로 내리기' })).not.toBeInTheDocument()
  })

  describe('비공개', () => {
    /** 사용자 화면에서 문제가 사라진다. 한 번 눌러 끝나면 안 된다. */
    it('확인창을 거쳐야 내려간다', async () => {
      const user = userEvent.setup()
      const calls: string[] = []
      server.use(
        http.post('*/api/admin/problems/:id/unpublish', () => {
          calls.push('unpublish')
          return new HttpResponse(null, { status: 204 })
        }),
      )
      renderTab({ problemId: 1 })
      await screen.findByText(/공개 중이에요/)

      await user.click(screen.getByRole('button', { name: '비공개로 내리기' }))
      // 확인창이 뜨기만 하고 아직 아무것도 보내지 않았다.
      expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
      expect(calls).toEqual([])

      await user.click(screen.getByRole('button', { name: '그대로 두기' }))
      expect(calls).toEqual([])
    })

    it('확인하면 내려가고 알린다', async () => {
      const user = userEvent.setup()
      renderTab({ problemId: 1 })
      await screen.findByText(/공개 중이에요/)

      await user.click(screen.getByRole('button', { name: '비공개로 내리기' }))
      const dialog = await screen.findByRole('alertdialog')
      await user.click(
        screen
          .getAllByRole('button', { name: '비공개로 내리기' })
          .find((button) => dialog.contains(button))!,
      )

      expect(await screen.findByRole('status')).toHaveTextContent('비공개로 내렸어요')
      // 내린 뒤에는 공개할 수 있는 상태가 된다 — 상세를 다시 받았다는 뜻이다.
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: '공개하기' })).toBeInTheDocument()
      })
    })
  })

  it('상세를 못 받으면 다시 시도할 길을 준다', async () => {
    let calls = 0
    server.use(
      http.get('*/api/admin/problems/:id', () => {
        calls += 1
        return HttpResponse.json(
          { status: 500, code: 'OOPS', detail: '잠시 뒤에' },
          { status: 500 },
        )
      }),
    )
    const user = userEvent.setup()
    renderTab()

    const retry = await screen.findByRole('button', { name: '다시 시도' })
    const before = calls
    await user.click(retry)
    await waitFor(() => expect(calls).toBeGreaterThan(before))
  })
})

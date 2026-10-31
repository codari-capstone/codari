import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import type { TestCaseInput } from '@/api/types'
import { createQueryClient } from '@/app/queryClient'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { resetAdminProblems } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { TestCasesTab } from './TestCasesTab'

/**
 * 탭만 그린다. 라우터를 끼우지 않는 까닭은 이 탭에 링크가 없어서다 — 탭이 부모 폼과
 * 섞이는 문제는 AdminProblemFormPage 쪽 테스트가 본다.
 */
function renderTab(
  options: {
    problemId?: number
    locked?: boolean
    publishedVersionNo?: number | null
    client?: QueryClient
  } = {},
) {
  const {
    problemId = 1,
    locked = false,
    publishedVersionNo = 1,
    client = createQueryClient(),
  } = options

  render(
    <QueryClientProvider client={client}>
      <TestCasesTab
        problemId={problemId}
        locked={locked}
        before={{ latestVersionNo: 1, publishedVersionNo }}
      />
    </QueryClientProvider>,
  )
}

/**
 * 케이스 N번 줄을 펼친다. 요약을 눌러야 칸을 쓸 수 있다.
 *
 * 글자가 든 span이 아니라 summary를 누른다 — details를 여는 것은 summary의 동작이다.
 */
async function expand(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByText(label).closest('summary')!)
}

/** 숨은 파일 칸. userEvent.upload는 display:none을 클릭할 수 없어 change를 직접 쏜다. */
function uploadZip(file: File) {
  const input = screen.getByLabelText('ZIP 파일')
  fireEvent.change(input, { target: { files: [file] } })
}

function zipFile(sizeBytes: number) {
  return new File([new Uint8Array(sizeBytes)], 'cases.zip', { type: 'application/zip' })
}

/** 검증 기록과 크기가 서로 다른 케이스 둘. 행이 밀리는지 보려면 값이 달라야 한다. */
const TAGGED_CASES = [
  {
    caseType: 'SAMPLE' as const,
    input: 'first',
    output: 'a',
    inputBytes: 5,
    outputBytes: 1,
    validation: { PYTHON: null, CPP: null },
  },
  {
    caseType: 'HIDDEN' as const,
    input: 'second',
    output: 'bb',
    inputBytes: 6,
    outputBytes: 2,
    validation: {
      PYTHON: { verdict: 'ACCEPTED' as const, timeMs: 10, memoryKb: 100, message: null },
      CPP: null,
    },
  },
]

function serveTagged() {
  server.use(http.get('*/api/admin/problems/:id/test-cases', () => HttpResponse.json(TAGGED_CASES)))
}

afterEach(() => resetAdminProblems())

describe('TestCasesTab', () => {
  it('불러온 케이스의 종류와 크기를 보여 준다', async () => {
    renderTab()

    expect(await screen.findByText(/공개 예제 2개/)).toBeInTheDocument()
    // 바이트는 서버가 준 값이다. 화면이 세지 않는다 — 1번 예제의 입력은 두 줄 14바이트다.
    expect(screen.getByText('입력 14B · 출력 4B')).toBeInTheDocument()
    expect(screen.getAllByText('검증 전')).toHaveLength(7)
  })

  it('케이스가 없으면 안내를 보여 준다', async () => {
    renderTab({ problemId: 10, publishedVersionNo: null })

    expect(await screen.findByText(/케이스가 없어요/)).toBeInTheDocument()
  })

  it('행을 더해 저장하면 보낸 본문이 맞다', async () => {
    const user = userEvent.setup()
    const sent: TestCaseInput[][] = []
    server.use(
      http.put('*/api/admin/problems/:id/test-cases', async ({ request }) => {
        sent.push((await request.json()) as TestCaseInput[])
        return HttpResponse.json({ versionNo: 2, status: 'DRAFT' })
      }),
    )
    renderTab()
    await screen.findByText(/공개 예제 2개/)

    await user.click(screen.getByRole('button', { name: '케이스 더하기' }))
    await expand(user, '8. 공개 예제')
    // 라벨에 행 번호가 있어 열 줄이 모두 DOM에 있어도 집을 수 있다.
    await user.type(screen.getByLabelText('8번 입력'), '9 9')
    await user.type(screen.getByLabelText('8번 기대 출력'), '18')
    await user.click(screen.getByRole('button', { name: '케이스 저장' }))

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toHaveLength(8)
    expect(sent[0]?.[7]).toEqual({ caseType: 'SAMPLE', input: '9 9', output: '18' })
  })

  it('공개 중인 버전에 저장하면 새 초안과 재검증을 알린다', async () => {
    const user = userEvent.setup()
    renderTab()
    await screen.findByText(/공개 예제 2개/)

    await user.click(screen.getByRole('button', { name: '케이스 더하기' }))
    await user.click(screen.getByRole('button', { name: '케이스 저장' }))

    const notice = await screen.findByRole('status')
    expect(notice).toHaveTextContent('새 초안 v2')
    // 저장이 검증 기록을 지운다(계약). 말해 주지 않으면 공개 조건이 왜 뒤로 갔는지 모른다.
    expect(notice).toHaveTextContent('다시 검증')
  })

  it('10개가 되면 더 더할 수 없다', async () => {
    const user = userEvent.setup()
    renderTab()
    await screen.findByText(/공개 예제 2개/)

    const add = screen.getByRole('button', { name: '케이스 더하기' })
    for (let i = 0; i < 3; i++) await user.click(add)

    expect(screen.getByText(/공개 예제 5개/)).toBeInTheDocument()
    expect(add).toBeDisabled()
  })

  it('행을 지우면 개수가 줄어든다', async () => {
    const user = userEvent.setup()
    renderTab()
    await screen.findByText(/공개 예제 2개/)

    await expand(user, '1. 공개 예제')
    await user.click(screen.getByRole('button', { name: '1번 케이스 지우기' }))

    expect(screen.getByText(/공개 예제 1개/)).toBeInTheDocument()
  })

  it('ZIP을 읽으면 표를 채우고 저장을 눌러야 한다고 알린다', async () => {
    const sent: unknown[] = []
    server.use(
      http.put('*/api/admin/problems/:id/test-cases', async ({ request }) => {
        sent.push(await request.json())
        return HttpResponse.json({ versionNo: 2, status: 'DRAFT' })
      }),
    )
    renderTab()
    await screen.findByText(/공개 예제 2개/)

    uploadZip(zipFile(100))

    const notice = await screen.findByRole('status')
    expect(notice).toHaveTextContent('3개를 읽었어요')
    expect(notice).toHaveTextContent('저장을 눌러야')
    // 계약: ZIP 읽기는 저장하지 않는다.
    expect(sent).toHaveLength(0)
    expect(screen.getByText(/공개 예제 2개 · 비공개 1개/)).toBeInTheDocument()
  })

  /** 계약: "ZIP 파일 자체도 10MiB까지고 … 화면은 올리기 전에 파일 크기를 확인해 막는다." */
  it('10MiB를 넘는 ZIP은 보내지 않는다', async () => {
    let requested = false
    server.use(
      http.post('*/api/admin/problems/:id/test-cases/zip', () => {
        requested = true
        return HttpResponse.json([])
      }),
    )
    renderTab()
    await screen.findByText(/공개 예제 2개/)

    uploadZip(zipFile(10 * 1024 * 1024 + 1))

    expect(await screen.findByRole('alert')).toHaveTextContent('10MiB까지예요')
    expect(requested).toBe(false)
  })

  it('ZIP이 규칙에 맞지 않으면 서버 문구를 보여 준다', async () => {
    server.use(
      http.post('*/api/admin/problems/:id/test-cases/zip', () =>
        HttpResponse.json(
          { status: 400, code: 'ZIP_INVALID', detail: 'sample/2.out이 없어요' },
          { status: 400 },
        ),
      ),
    )
    renderTab()
    await screen.findByText(/공개 예제 2개/)

    uploadZip(zipFile(100))

    expect(await screen.findByRole('alert')).toHaveTextContent('sample/2.out이 없어요')
  })

  it('한도를 넘기면 서버 문구를 보여 준다', async () => {
    const user = userEvent.setup()
    server.use(
      http.put('*/api/admin/problems/:id/test-cases', () =>
        HttpResponse.json(
          { status: 400, code: 'TEST_CASE_LIMIT_EXCEEDED', detail: '3번 입력이 2MiB를 넘어요' },
          { status: 400 },
        ),
      ),
    )
    renderTab()
    await screen.findByText(/공개 예제 2개/)

    await user.click(screen.getByRole('button', { name: '케이스 더하기' }))
    await user.click(screen.getByRole('button', { name: '케이스 저장' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('3번 입력이 2MiB를 넘어요')
  })

  it('검증 중이면 저장도 ZIP도 할 수 없다', async () => {
    renderTab({ locked: true })
    await screen.findByText(/공개 예제 2개/)

    expect(screen.queryByRole('button', { name: '케이스 저장' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ZIP 올리기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '케이스 더하기' })).not.toBeInTheDocument()
  })

  it('불러오지 못하면 오류와 다시 시도를 보여 준다', async () => {
    server.use(
      http.get('*/api/admin/problems/:id/test-cases', () =>
        HttpResponse.json({ status: 503, title: 'Service Unavailable' }, { status: 503 }),
      ),
    )
    renderTab()

    // retry:1이라 첫 시도 실패 뒤 재시도 지연을 거쳐야 error 상태가 된다.
    expect(
      await screen.findByRole('button', { name: '다시 시도' }, { timeout: 3000 }),
    ).toBeInTheDocument()
  })

  // 리뷰 지적(major·minor): 서버 메타데이터를 행 위치로 맞추면 행을 지우거나 ZIP으로
  // 바꿀 때 밀려서, 다른 케이스의 크기와 검증 상태가 그 행 것처럼 보인다.
  describe('서버 메타데이터가 행을 따라간다', () => {
    it('행을 지우면 남은 행이 자기 검증 상태를 그대로 보여 준다', async () => {
      const user = userEvent.setup()
      serveTagged()
      renderTab()
      await screen.findByText(/공개 예제 1개/)
      expect(screen.getByText('입력 5B · 출력 1B')).toBeInTheDocument()

      await expand(user, '1. 공개 예제')
      await user.click(screen.getByRole('button', { name: '1번 케이스 지우기' }))

      // 남은 것은 2번 케이스다. 1번의 '검증 전'과 5B를 물려받으면 안 된다.
      expect(screen.getByText('검증 1/1 통과')).toBeInTheDocument()
      expect(screen.getByText('입력 6B · 출력 2B')).toBeInTheDocument()
      expect(screen.queryByText('입력 5B · 출력 1B')).not.toBeInTheDocument()
    })

    it('행을 더해도 손대지 않은 행의 크기는 그대로다', async () => {
      const user = userEvent.setup()
      serveTagged()
      renderTab()
      await screen.findByText('입력 5B · 출력 1B')

      await user.click(screen.getByRole('button', { name: '케이스 더하기' }))

      // useFieldArray의 append가 dirtyFields를 전체 다시 계산해도 영향이 없어야 한다.
      expect(screen.getByText('입력 5B · 출력 1B')).toBeInTheDocument()
      expect(screen.getByText('입력 6B · 출력 2B')).toBeInTheDocument()
    })

    it('글을 고친 행만 크기를 저장 뒤로 미룬다', async () => {
      const user = userEvent.setup()
      serveTagged()
      renderTab()
      await screen.findByText('입력 5B · 출력 1B')

      await expand(user, '1. 공개 예제')
      await user.type(screen.getByLabelText('1번 입력'), 'x')

      expect(screen.getByText('저장하면 크기를 계산해요')).toBeInTheDocument()
      expect(screen.queryByText('입력 5B · 출력 1B')).not.toBeInTheDocument()
      // 2번 행은 손대지 않았다.
      expect(screen.getByText('입력 6B · 출력 2B')).toBeInTheDocument()
    })

    it('ZIP으로 읽은 행에는 옛 크기와 검증 상태가 붙지 않는다', async () => {
      serveTagged()
      renderTab()
      await screen.findByText('입력 5B · 출력 1B')

      uploadZip(zipFile(100))

      await screen.findByText(/3개를 읽었어요/)
      expect(screen.queryByText('입력 5B · 출력 1B')).not.toBeInTheDocument()
      expect(screen.queryByText('검증 1/1 통과')).not.toBeInTheDocument()
      expect(screen.getAllByText('저장하면 크기를 계산해요')).toHaveLength(3)
      expect(screen.getAllByText('저장 전')).toHaveLength(3)
    })
  })

  // 리뷰 지적(minor): readZip에 onError가 없어 401이어도 세션을 정리하지 않고, 직전
  // 성공 안내가 오류 옆에 남는다.
  it('ZIP 읽기가 실패하면 직전 성공 안내를 지운다', async () => {
    let fail = false
    server.use(
      http.post('*/api/admin/problems/:id/test-cases/zip', () =>
        fail
          ? HttpResponse.json(
              { status: 400, code: 'ZIP_INVALID', detail: '폴더 이름이 달라요' },
              { status: 400 },
            )
          : HttpResponse.json([{ caseType: 'SAMPLE', input: '1', output: '2' }]),
      ),
    )
    renderTab()
    await screen.findByText(/공개 예제 2개/)

    uploadZip(zipFile(100))
    await screen.findByText(/1개를 읽었어요/)

    fail = true
    uploadZip(zipFile(100))

    expect(await screen.findByRole('alert')).toHaveTextContent('폴더 이름이 달라요')
    expect(screen.queryByText(/읽었어요/)).not.toBeInTheDocument()
  })

  it('ZIP 읽기가 401이면 세션을 비운다', async () => {
    const client = createQueryClient()
    client.setQueryData(ME_QUERY_KEY, { id: 1, nickname: '관리자', role: 'ADMIN' })
    server.use(
      http.post('*/api/admin/problems/:id/test-cases/zip', () =>
        HttpResponse.json({ status: 401, title: 'Unauthorized' }, { status: 401 }),
      ),
    )
    renderTab({ client })
    await screen.findByText(/공개 예제 2개/)

    uploadZip(zipFile(100))

    // 문구만 띄우면 만료된 채로 화면에 남는다. 로그인 화면으로 보내려면 캐시를 비워야 한다.
    await waitFor(() => expect(client.getQueryData(ME_QUERY_KEY)).toBeNull())
  })

  // 리뷰 지적(minor): 둘이 같이 돌면 저장의 재조회가 방금 읽어 온 표를 덮는다.
  it('ZIP을 읽는 동안에는 저장할 수 없다', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.post('*/api/admin/problems/:id/test-cases/zip', async () => {
        await gate
        return HttpResponse.json([{ caseType: 'SAMPLE', input: '1', output: '2' }])
      }),
    )
    renderTab()
    await screen.findByText(/공개 예제 2개/)

    uploadZip(zipFile(100))

    expect(await screen.findByRole('button', { name: 'ZIP 읽는 중…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '케이스 저장' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '케이스 더하기' })).toBeDisabled()

    await act(async () => {
      release()
    })
    await screen.findByText(/1개를 읽었어요/)
  })
})

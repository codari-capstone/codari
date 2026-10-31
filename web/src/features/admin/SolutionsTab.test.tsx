import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import type { AdminSolution, Language, SolutionInput } from '@/api/types'
import { createQueryClient } from '@/app/queryClient'
import { ThemeProvider } from '@/app/ThemeProvider'
import { resetAdminProblems } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { SolutionsTab } from './SolutionsTab'

/**
 * 탭만 그린다. 링크가 없어 라우터를 끼우지 않는다 — 부모 폼과 섞이는 문제는
 * AdminProblemFormPage 쪽 테스트가 본다.
 */
function renderTab(options: { problemId?: number; locked?: boolean; client?: QueryClient } = {}) {
  const { problemId = 1, locked = false, client = createQueryClient() } = options

  // CodeEditor가 앱 테마를 읽는다 — ThemeProvider 없이는 그려지지 않는다.
  render(
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <SolutionsTab
          problemId={problemId}
          locked={locked}
          before={{ latestVersionNo: 1, publishedVersionNo: 1 }}
        />
      </QueryClientProvider>
    </ThemeProvider>,
  )
}

const EDITOR = { PYTHON: 'Python 코드 편집기', CPP: 'C++ 코드 편집기' } as const

function editor(language: Language) {
  return screen.getByRole('textbox', { name: EDITOR[language] })
}

/** 칸을 비우고 새로 넣는다. 붙여넣기로 한 번에 넣어야 64KB도 돌아간다. */
async function retype(user: ReturnType<typeof userEvent.setup>, language: Language, code: string) {
  await user.click(editor(language))
  await user.keyboard('{Control>}a{/Control}{Delete}')
  if (code !== '') await user.paste(code)
}

function solution(partial: Partial<AdminSolution> & { language: Language }): AdminSolution {
  return {
    sourceCode: 'print(1)',
    verifiedAt: null,
    status: 'NOT_VALIDATED',
    progress: 0,
    verdict: null,
    compilerMessage: null,
    ...partial,
  }
}

function serveSolutions(solutions: AdminSolution[]) {
  server.use(http.get('*/api/admin/problems/:id/solutions', () => HttpResponse.json(solutions)))
}

/** 저장 본문을 받아 두는 핸들러. 보낸 것이 계약대로인지 보려면 본문을 봐야 한다. */
function captureSave(status: 'DRAFT' | 'PUBLISHED' = 'DRAFT') {
  const sent: SolutionInput[][] = []
  server.use(
    http.put('*/api/admin/problems/:id/solutions', async ({ request }) => {
      sent.push((await request.json()) as SolutionInput[])
      return HttpResponse.json({ versionNo: 2, status })
    }),
  )
  return sent
}

const saveButton = () => screen.getByRole('button', { name: '정답 코드 저장' })
const validateButton = () => screen.getByRole('button', { name: '저장하고 검증' })

afterEach(() => {
  resetAdminProblems()
})

describe('SolutionsTab (ADM-05)', () => {
  it('두 언어의 코드와 검증 상태를 보여 준다', async () => {
    serveSolutions([
      solution({
        language: 'PYTHON',
        sourceCode: 'print(42)',
        status: 'PASSED',
        verdict: 'ACCEPTED',
      }),
      solution({
        language: 'CPP',
        sourceCode: 'int main(){}',
        status: 'FAILED',
        verdict: 'WRONG_ANSWER',
      }),
    ])
    renderTab()

    expect(await screen.findByText('검증 통과')).toBeInTheDocument()
    expect(editor('PYTHON')).toHaveTextContent('print(42)')
    expect(editor('CPP')).toHaveTextContent('int main(){}')
    // 계약: FAILED면 verdict가 처음 틀린 케이스의 판정이다. 왜 실패했는지를 말해 준다.
    expect(screen.getByText(/검증 실패 · 틀렸습니다/)).toBeInTheDocument()
  })

  it('정답 코드가 없는 언어는 빈 칸으로 둔다', async () => {
    // 계약: "정답 코드가 없는 언어는 목록에 없다." 화면은 늘 두 칸을 보여 준다.
    serveSolutions([solution({ language: 'PYTHON', sourceCode: 'print(1)' })])
    renderTab()

    await screen.findByText('검증 전')
    expect(editor('CPP')).toHaveTextContent('')
    expect(screen.getByText('정답 코드가 없어요')).toBeInTheDocument()
  })

  /**
   * 계약: "컴파일러 메시지는 정답 코드가 그대로 들어간 문자열이라 글자 그대로 보여 준다
   * (HTML로 렌더링하지 않는다)." 코드에 든 꺾쇠가 태그로 해석되면 메시지가 사라진다.
   */
  it('컴파일 메시지를 글자 그대로 보여 준다', async () => {
    serveSolutions([
      solution({
        language: 'CPP',
        status: 'FAILED',
        compilerMessage: "error: 'vector<int>' was not declared",
      }),
    ])
    renderTab()

    expect(await screen.findByText(/vector<int>/)).toBeInTheDocument()
  })

  it('고친 코드를 저장하면 두 언어를 함께 보낸다', async () => {
    const user = userEvent.setup()
    serveSolutions([solution({ language: 'PYTHON', sourceCode: 'old' })])
    const sent = captureSave()
    renderTab()
    await screen.findByText('검증 전')

    await retype(user, 'PYTHON', 'print(99)')
    await user.click(saveButton())

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toEqual([
      { language: 'PYTHON', sourceCode: 'print(99)' },
      { language: 'CPP', sourceCode: '' },
    ])
    // 저장만 했을 때 검증 기록이 없다는 말을 해야 공개가 왜 막히는지 알 수 있다.
    expect(await screen.findByRole('status')).toHaveTextContent('검증을 눌러야 공개할 수 있어요')
  })

  /** 계약: "코드가 비어 있으면 그 언어의 정답 코드를 지운다." 목록에서 빼면 지워지지 않는다. */
  it('칸을 비우고 저장하면 그 언어를 빈 코드로 보낸다', async () => {
    const user = userEvent.setup()
    serveSolutions([
      solution({ language: 'PYTHON', sourceCode: 'print(1)' }),
      solution({ language: 'CPP', sourceCode: 'int main(){}' }),
    ])
    const sent = captureSave()
    renderTab()
    await screen.findAllByText('검증 전')

    await retype(user, 'CPP', '')
    await user.click(saveButton())

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toEqual([
      { language: 'PYTHON', sourceCode: 'print(1)' },
      { language: 'CPP', sourceCode: '' },
    ])
  })

  it('64KB를 넘으면 보내지 않는다', async () => {
    const user = userEvent.setup()
    serveSolutions([solution({ language: 'PYTHON', sourceCode: 'print(1)' })])
    const sent = captureSave()
    renderTab()
    await screen.findByText('검증 전')

    await retype(user, 'PYTHON', 'x'.repeat(64 * 1024 + 1))
    await user.click(saveButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('Python 코드가 64KB를 넘어요')
    expect(sent).toHaveLength(0)
  })

  it('저장하고 검증은 저장 다음 검증을 부른다', async () => {
    const user = userEvent.setup()
    const calls: string[] = []
    server.use(
      http.put('*/api/admin/problems/:id/solutions', () => {
        calls.push('save')
        return HttpResponse.json({ versionNo: 2, status: 'DRAFT' })
      }),
      http.post('*/api/admin/problems/:id/validate', () => {
        calls.push('validate')
        return new HttpResponse(null, { status: 202 })
      }),
    )
    renderTab()
    await screen.findAllByText(/검증 통과/)

    await retype(user, 'PYTHON', 'print(1)')
    await user.click(validateButton())

    expect(await screen.findByRole('status')).toHaveTextContent('검증을 시작했어요')
    expect(calls).toEqual(['save', 'validate'])
  })

  /**
   * 계약: "`PUT` 응답의 `status`가 `DRAFT`일 때만 부른다. 바뀐 게 없어 공개·비공개 버전이
   * 그대로면 이미 검증을 통과한 버전이라 부를 필요가 없다(부르면 409 `NOT_DRAFT`)."
   */
  it('바뀐 게 없으면 검증을 부르지 않는다', async () => {
    const user = userEvent.setup()
    let validated = 0
    server.use(
      http.post('*/api/admin/problems/:id/validate', () => {
        validated += 1
        return new HttpResponse(null, { status: 202 })
      }),
    )
    renderTab()
    await screen.findAllByText(/검증 통과/)

    await user.click(validateButton())

    expect(await screen.findByRole('status')).toHaveTextContent(
      '이미 검증을 통과한 버전이라 다시 검증할 필요가 없어요',
    )
    expect(validated).toBe(0)
  })

  it('검증 중에는 저장·검증 버튼을 두지 않는다', async () => {
    // 11번은 검증 중인 문제다(fixture). 계약이 그때의 저장을 409로 정했다.
    renderTab({ problemId: 11 })

    await screen.findAllByText(/검증 중/)
    expect(screen.queryByRole('button', { name: '정답 코드 저장' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '저장하고 검증' })).not.toBeInTheDocument()
  })

  /**
   * 계약: "검증 중에는 `GET .../solutions`로 진행을 보고, 끝나면 `GET .../test-cases`를
   * 한 번 받아 케이스별 결과를 그린다."
   */
  it('검증이 끝나면 케이스별 결과가 뜬다', async () => {
    renderTab({ problemId: 11 })

    await screen.findAllByText(/검증 중/)
    // 목은 조회마다 진행률을 올려 두 번이면 끝난다. 폴링이 돌아야 여기 닿는다.
    expect(await screen.findAllByText(/검증 통과/)).not.toHaveLength(0)
    const passed = await screen.findAllByText('맞았습니다!!')
    expect(passed).not.toHaveLength(0)
    // 표가 시간·메모리까지 그린다.
    expect(screen.getAllByText('10ms')).not.toHaveLength(0)
  })

  it('고친 코드 옆에는 검증 표시가 저장 전이라고 적는다', async () => {
    const user = userEvent.setup()
    serveSolutions([
      solution({
        language: 'PYTHON',
        sourceCode: 'print(1)',
        status: 'PASSED',
        verdict: 'ACCEPTED',
      }),
    ])
    renderTab()
    await screen.findByText('검증 통과')

    await retype(user, 'PYTHON', 'print(2)')

    // 통과한 코드를 고치면 'PASSED'는 더 이상 칸에 든 코드의 상태가 아니다.
    expect(await screen.findByText('검증 통과 · 고친 코드는 저장 전')).toBeInTheDocument()
  })

  describe('검증을 거절당했을 때 (ADM-05)', () => {
    /**
     * 문구는 서버의 `detail`을 그대로 쓴다(계약: "화면에 그대로 보여 줄 문구"). 화면에 또
     * 적으면 서버가 다듬는 날 두 벌이 갈라진다. 여기서 보는 것은 **저장이 끝났다는 사실이
     * 남는지**와, 화면만 아는 안내가 붙는지다.
     */
    const cases = [
      { code: 'PROBLEM_VALIDATING', status: 409, detail: '이미 검증하는 중이에요', hint: null },
      { code: 'NOT_DRAFT', status: 409, detail: '이미 검증을 통과한 버전이에요', hint: null },
      { code: 'NO_SOLUTION', status: 409, detail: '정답 코드가 없어요', hint: null },
      {
        code: 'NO_TEST_CASES',
        status: 409,
        detail: '공개 예제가 없어요',
        hint: '테스트케이스 탭에서 공개 예제를 먼저 넣어 주세요.',
      },
      {
        code: 'LANGUAGE_NOT_CONFIGURED',
        status: 409,
        detail: 'C++의 시간·메모리 제한이 없어요',
        hint: null,
      },
      {
        code: 'JUDGE_UNAVAILABLE',
        status: 503,
        detail: '채점 서버가 설정되지 않았어요',
        hint: '채점 서버 문제라 코드를 고칠 필요는 없어요. 잠시 뒤 다시 눌러 주세요.',
      },
    ]

    // 제목에 code가 들어가야 실패했을 때 어느 거절인지 보인다.
    it.each(cases.map((item) => [item.code, item] as const))(
      '%s는 서버 문구를 보여 준다',
      async (code, { status, detail, hint }) => {
        const user = userEvent.setup()
        server.use(
          http.put('*/api/admin/problems/:id/solutions', () =>
            HttpResponse.json({ versionNo: 2, status: 'DRAFT' }),
          ),
          http.post('*/api/admin/problems/:id/validate', () =>
            HttpResponse.json({ status, code, detail }, { status }),
          ),
        )
        renderTab()
        await screen.findAllByText(/검증 통과/)

        await retype(user, 'PYTHON', 'print(1)')
        await user.click(validateButton())

        const alert = await screen.findByRole('alert')
        expect(alert).toHaveTextContent(detail)
        if (hint !== null) expect(alert).toHaveTextContent(hint)
        // 저장은 끝났다. 그 말을 하지 않으면 코드가 날아간 줄 알고 다시 쓴다.
        expect(screen.getByRole('status')).toHaveTextContent('검증은 시작하지 못했어요')
      },
    )
  })

  describe('리뷰 지적 — 저장 중의 편집 (major)', () => {
    /**
     * 버튼만 막고 에디터는 계속 입력을 받고 있었다. CodeMirror의 편집 영역은
     * contenteditable이라 바깥 `fieldset`의 `disabled`가 닿지 않는다.
     */
    it('저장하는 동안에는 코드를 고칠 수 없다', async () => {
      const user = userEvent.setup()
      let release = () => {}
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      server.use(
        http.put('*/api/admin/problems/:id/solutions', async () => {
          await held
          return HttpResponse.json({ versionNo: 2, status: 'DRAFT' })
        }),
      )
      serveSolutions([solution({ language: 'PYTHON', sourceCode: 'print(1)' })])
      renderTab()
      await screen.findByText('검증 전')

      await retype(user, 'PYTHON', 'print(2)')
      await user.click(saveButton())

      // 저장이 도는 중에 친 글자는 서버로 가지 않는다.
      await user.click(editor('PYTHON'))
      await user.paste('더 친 글자')
      expect(editor('PYTHON')).not.toHaveTextContent('더 친 글자')

      release()
      await screen.findByRole('status')
    })

    /**
     * 층을 걷지 않으면 서버가 다듬어 돌려준 값이 영영 보이지 않는다.
     *
     * 걷는 **시점**(재조회 전인지 후인지)은 jsdom에서 눈에 드러나지 않아 테스트로 묶지
     * 않았다. 재조회 뒤로 미루는 것은 리뷰 지적대로 두되, 여기서 지키는 것은 "서버 값이
     * 끝내 드러난다"는 것 하나다.
     */
    it('저장이 끝나면 서버가 돌려준 값이 보인다', async () => {
      const user = userEvent.setup()
      let stored = false
      server.use(
        http.get('*/api/admin/problems/:id/solutions', () =>
          HttpResponse.json([
            solution({
              language: 'PYTHON',
              sourceCode: stored ? '서버가 다듬은 코드' : 'print(1)',
            }),
          ]),
        ),
        http.put('*/api/admin/problems/:id/solutions', () => {
          stored = true
          return HttpResponse.json({ versionNo: 2, status: 'DRAFT' })
        }),
      )
      renderTab()
      await screen.findByText('검증 전')

      await retype(user, 'PYTHON', 'print(2)')
      await user.click(saveButton())

      await waitFor(() => expect(editor('PYTHON')).toHaveTextContent('서버가 다듬은 코드'))
    })
  })

  describe('리뷰 지적 — 판정이 없는 케이스 (major)', () => {
    /** 계약: `verdict`가 null인 것은 "돌리지 않았다"는 뜻뿐이다. 왜인지는 언어 상태가 말한다. */
    function serveCases(verdict: null, status: AdminSolution['status']) {
      serveSolutions([solution({ language: 'PYTHON', status })])
      server.use(
        http.get('*/api/admin/problems/:id/test-cases', () =>
          HttpResponse.json([
            {
              caseType: 'SAMPLE',
              input: '1',
              output: '1',
              inputBytes: 1,
              outputBytes: 1,
              validation: {
                PYTHON: {
                  verdict,
                  executionTimeMs: null,
                  memoryUsedKb: null,
                  runtimeErrorType: null,
                },
                CPP: null,
              },
            },
          ]),
        ),
      )
    }

    it('컴파일 에러로 돌리지 못한 케이스를 채점 불가로 적지 않는다', async () => {
      serveCases(null, 'FAILED')
      renderTab()

      expect(await screen.findByText('실행 안 함')).toBeInTheDocument()
      expect(screen.queryByText('채점 불가')).not.toBeInTheDocument()
    })

    it('아직 돌고 있는 케이스는 검증 중으로 적는다', async () => {
      serveCases(null, 'VALIDATING')
      renderTab()

      expect(await screen.findAllByText('검증 중')).not.toHaveLength(0)
      expect(screen.queryByText('실행 안 함')).not.toBeInTheDocument()
    })
  })

  /**
   * 탭을 늦게 열면 **첫 응답부터 끝난 상태**라 전이가 일어나지 않는다. 그런데 상세는
   * 'VALIDATING'으로 묵어 있고 폴링도 없어, 새로고침 전에는 화면이 잠긴 채 남았다.
   */
  it('검증이 이미 끝난 뒤에 열어도 상세를 다시 받는다', async () => {
    let caseCalls = 0
    server.use(
      http.get('*/api/admin/problems/:id/test-cases', () => {
        caseCalls += 1
        return HttpResponse.json([])
      }),
    )
    serveSolutions([solution({ language: 'PYTHON', status: 'PASSED', verdict: 'ACCEPTED' })])
    // 상세가 '검증 중'이라고 알고 있는 상태로 연다.
    renderTab({ locked: true })

    await screen.findByText('검증 통과')
    await waitFor(() => expect(caseCalls).toBeGreaterThan(1))
  })

  it('케이스별 결과를 못 받으면 알리고 다시 받을 길을 준다', async () => {
    const user = userEvent.setup()
    let calls = 0
    server.use(
      http.get('*/api/admin/problems/:id/test-cases', () => {
        calls += 1
        return HttpResponse.json(
          { status: 500, code: 'OOPS', detail: '잠시 뒤 다시 시도해 주세요' },
          { status: 500 },
        )
      }),
    )
    renderTab()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('케이스별 결과를 받지 못했어요')
    const before = calls
    await user.click(screen.getByRole('button', { name: '결과 다시 받기' }))
    await waitFor(() => expect(calls).toBeGreaterThan(before))
  })

  /**
   * 본문 없는 5xx는 openapi-fetch의 `error`가 undefined다. 상태로 가르지 않으면 서버가
   * 시작하지 않았는데 '검증을 시작했어요'라고 알리고 폴링도 돌지 않는다.
   */
  it('본문 없는 5xx를 검증 시작 성공으로 보지 않는다', async () => {
    const user = userEvent.setup()
    server.use(
      http.put('*/api/admin/problems/:id/solutions', () =>
        HttpResponse.json({ versionNo: 2, status: 'DRAFT' }),
      ),
      http.post('*/api/admin/problems/:id/validate', () => new HttpResponse(null, { status: 502 })),
    )
    renderTab()
    await screen.findAllByText(/검증 통과/)

    await retype(user, 'PYTHON', 'print(1)')
    await user.click(validateButton())

    expect(await screen.findByRole('status')).toHaveTextContent('검증은 시작하지 못했어요')
  })

  /**
   * 리뷰 지적(minor): 목이 정답 코드가 없는 언어의 결과까지 만들어 내고 있었다. 계약은
   * 그 언어의 `validation`을 null로 정했다 — 목을 믿는 테스트가 서버와 갈라진다.
   */
  it('정답 코드가 없는 언어는 목도 결과를 만들지 않는다', async () => {
    const user = userEvent.setup()
    renderTab({ problemId: 9 })
    await screen.findAllByText(/검증 통과/)

    // C++ 칸을 비워 저장하면 그 언어가 지워진다. 그 뒤 검증하면 Python 결과만 나와야 한다.
    await retype(user, 'CPP', '')
    await user.click(validateButton())

    await screen.findByText('정답 코드가 없어요')
    // 목은 조회마다 진행률을 올려 두 번이면 끝난다.
    expect(await screen.findByText(/검증 통과/)).toBeInTheDocument()
    const passed = await screen.findAllByText('맞았습니다!!')
    // 케이스 7개 × 한 언어. 두 언어였다면 14줄이다.
    expect(passed).toHaveLength(7)
  })

  it('저장이 실패하면 고치던 코드를 지우지 않는다', async () => {
    const user = userEvent.setup()
    server.use(
      http.put('*/api/admin/problems/:id/solutions', () =>
        HttpResponse.json(
          { status: 409, code: 'PROBLEM_VALIDATING', detail: '검증하는 중이에요' },
          { status: 409 },
        ),
      ),
    )
    renderTab()
    await screen.findAllByText(/검증 통과/)

    await retype(user, 'PYTHON', 'print(살려주세요)')
    await user.click(saveButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('검증하는 중이에요')
    expect(editor('PYTHON')).toHaveTextContent('print(살려주세요)')
  })
})

import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ProblemDetailView, SampleRunCase, SampleRunResult } from '@/api/types'
import { createQueryClient } from '@/app/queryClient'
import { ThemeProvider } from '@/app/ThemeProvider'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { resetSampleRuns } from '@/mocks/handlers'
import { SampleRun } from './SampleRun'
import type { SampleRunState } from './sampleRunQuery'
import { Component as SolvePage } from './SolvePage'

type Samples = ProblemDetailView['samples']

const SAMPLES: Samples = [
  { input: '4 9\n2 7 11 15\n', output: '0 1\n' },
  { input: '3 6\n3 2 4\n', output: '1 2\n' },
]

/**
 * 실행 상태 자리에 가짜를 넣는다.
 *
 * 화면 전체로는 비싸거나 못 보는 것들을 여기서 잰다 — 목으로는 한 가지 판정만 돌려줄 수
 * 있고(목 핸들러 주석), 컴파일 에러·런타임 에러·중간 상태는 응답을 직접 쥐어야 가른다.
 * 실제 접수·폴링은 아래 'SolvePage에서' 묶음이 한 번 통째로 잰다.
 */
function fake(over: Partial<SampleRunState>): SampleRunState {
  return { start: vi.fn(), pending: false, result: undefined, error: null, ...over }
}

function result(over: Partial<SampleRunResult> = {}): SampleRunResult {
  return {
    id: 1,
    problemId: 1,
    language: 'PYTHON',
    status: 'COMPLETED',
    progress: 100,
    verdict: 'ACCEPTED',
    runtimeErrorType: null,
    compilerMessage: null,
    submittedAt: '2026-10-25T00:00:00Z',
    judgedAt: '2026-10-25T00:00:02Z',
    cases: [],
    ...over,
  }
}

function sampleCase(over: Partial<SampleRunCase> = {}): SampleRunCase {
  return {
    ordinal: 1,
    actualOutput: '0 1\n',
    verdict: 'ACCEPTED',
    errorMessage: null,
    executionTimeMs: 9,
    memoryUsedKb: 3201,
    ...over,
  }
}

function renderRun(run: SampleRunState, samples = SAMPLES, code = 'print(1)') {
  return render(
    <SampleRun run={run} samples={samples} problemId={1} language="PYTHON" code={code} />,
  )
}

/** 진행·결과가 들어가는 live region. 끝나는 순간 사라지면 결과가 안내되지 않는다. */
const liveRegion = () => screen.getByRole('status')

describe('SampleRun (SOLVE-08)', () => {
  it('공개 예제가 없는 문제에서는 자리째로 빠진다', () => {
    renderRun(fake({}), [])

    expect(screen.queryByRole('button', { name: '실행' })).not.toBeInTheDocument()
    expect(screen.queryByText('예제 실행')).not.toBeInTheDocument()
  })

  it('코드가 비어 있으면 누를 수 없다', () => {
    renderRun(fake({}), SAMPLES, '   \n ')

    expect(screen.getByRole('button', { name: '실행' })).toBeDisabled()
  })

  it('접수 중에는 누를 수 없고 실행 중임을 알린다', () => {
    renderRun(fake({ pending: true }))

    expect(screen.getByRole('button', { name: '실행 중…' })).toBeDisabled()
    expect(liveRegion()).toHaveTextContent('예제를 실행하고 있어요…')
  })

  it('채점 중에는 진행률을 함께 알린다', () => {
    renderRun(fake({ result: result({ status: 'RUNNING', progress: 50, verdict: null }) }))

    expect(liveRegion()).toHaveTextContent('예제를 실행하고 있어요… 50%')
    expect(screen.getByRole('button', { name: '실행 중…' })).toBeDisabled()
  })

  /** 다른 상태의 0%는 "아직 시작도 안 했다"로 읽혀 오해를 준다 (결과 화면과 같은 규칙). */
  it('대기 중에는 진행률을 적지 않는다', () => {
    renderRun(fake({ result: result({ status: 'QUEUED', progress: 0, verdict: null }) }))

    expect(liveRegion()).toHaveTextContent('예제를 실행하고 있어요…')
    expect(liveRegion()).not.toHaveTextContent('0%')
  })

  it('기대 출력과 실제 출력을 나란히 보여 준다', () => {
    renderRun(
      fake({
        result: result({
          verdict: 'WRONG_ANSWER',
          cases: [
            sampleCase({ ordinal: 1, verdict: 'WRONG_ANSWER', actualOutput: '0 2\n' }),
            sampleCase({ ordinal: 2, actualOutput: '1 2\n' }),
          ],
        }),
      }),
    )

    const [first, second] = screen.getAllByRole('listitem')
    // 기대 출력은 응답에 없다. 문제 상세의 samples와 ordinal로 짝지은 값이다(계약).
    expect(within(first!).getByText('기대 출력')).toBeInTheDocument()
    expect(within(first!).getByText('0 1')).toBeInTheDocument()
    expect(within(first!).getByText('실제 출력')).toBeInTheDocument()
    expect(within(first!).getByText('0 2')).toBeInTheDocument()
    // 통과한 예제는 두 상자의 글자가 같다. 그게 '나란히 비교'의 전부다.
    expect(within(second!).getAllByText('1 2')).toHaveLength(2)
  })

  it('판정과 시간·메모리를 예제마다 보여 준다', () => {
    renderRun(
      fake({
        result: result({
          verdict: 'WRONG_ANSWER',
          cases: [
            sampleCase({
              verdict: 'WRONG_ANSWER',
              actualOutput: '0 2\n',
              executionTimeMs: 12,
              memoryUsedKb: 3400,
            }),
          ],
        }),
      }),
    )

    const item = screen.getByRole('listitem')
    expect(within(item).getByText('예제 1')).toBeInTheDocument()
    expect(within(item).getByText('틀렸습니다')).toBeInTheDocument()
    expect(within(item).getByText('12ms')).toBeInTheDocument()
    expect(within(item).getByText('3,400KB')).toBeInTheDocument()
  })

  /**
   * '맞았습니다!!'는 채점 결과의 말이다. 공개 예제는 문제에 적힌 몇 개뿐이라, 여기서 다
   * 맞아도 제출은 틀릴 수 있다 — 그 말을 붙이면 제출해도 통과한다는 뜻으로 읽힌다.
   */
  it('예제를 다 통과해도 채점 판정의 말을 쓰지 않는다', () => {
    renderRun(fake({ result: result({ cases: [sampleCase()] }) }))

    expect(liveRegion()).toHaveTextContent('공개 예제를 모두 통과했어요')
    expect(liveRegion()).toHaveTextContent('숨은 테스트는 제출해야 알 수 있어요')
    expect(screen.queryByText('맞았습니다!!')).not.toBeInTheDocument()
    expect(screen.getByRole('listitem')).toHaveTextContent('통과')
  })

  /**
   * 계약: COMPILE_ERROR면 예제별 판정이 모두 null이다. '실행 전'이 예제마다 늘어선 표는
   * 아무것도 말해 주지 않고, 사용자가 볼 것은 줄 번호가 든 메시지 하나다(RES-05).
   */
  it('컴파일 에러는 예제 표 대신 메시지를 보여 준다', () => {
    renderRun(
      fake({
        result: result({
          verdict: 'COMPILE_ERROR',
          compilerMessage: 'main.cpp:3:5: error: expected ‘;’',
          cases: [sampleCase({ verdict: null, actualOutput: null })],
        }),
      }),
    )

    expect(screen.getByText(/main\.cpp:3:5/)).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('런타임 에러는 종류 설명과 원문을 보여 준다', () => {
    renderRun(
      fake({
        result: result({
          verdict: 'RUNTIME_ERROR',
          runtimeErrorType: 'ZERO_DIVISION',
          cases: [
            sampleCase({
              verdict: 'RUNTIME_ERROR',
              actualOutput: '',
              errorMessage: 'Traceback (most recent call last):\n  File "main.py", line 4',
            }),
          ],
        }),
      }),
    )

    expect(liveRegion()).toHaveTextContent('런타임 에러')
    // 원문은 공개 예제라 그대로 온다 (RES-04). 줄 번호가 보여야 쓸모가 있다.
    expect(screen.getByText(/line 4/)).toBeInTheDocument()
  })

  /** 학생 코드가 만든 문자열이다. HTML로 렌더링하면 원문이 달라진다(계약). */
  it('에러 원문을 글자 그대로 그린다', () => {
    const raw = 'IndexError: list index out of range <b>0</b> *1*'
    renderRun(
      fake({
        result: result({
          verdict: 'RUNTIME_ERROR',
          runtimeErrorType: 'INDEX_ERROR',
          cases: [sampleCase({ verdict: 'RUNTIME_ERROR', errorMessage: raw })],
        }),
      }),
    )

    const shown = screen.getByText(/IndexError/)
    expect(shown).toHaveTextContent(raw)
    expect(shown.querySelector('b')).toBeNull()
  })

  it('아직 실행되지 않은 예제는 실행 전으로 두고 숫자를 비운다', () => {
    renderRun(
      fake({
        result: result({
          status: 'RUNNING',
          progress: 50,
          verdict: null,
          cases: [
            sampleCase(),
            sampleCase({
              ordinal: 2,
              verdict: null,
              actualOutput: null,
              executionTimeMs: null,
              memoryUsedKb: null,
            }),
          ],
        }),
      }),
    )

    const second = screen.getAllByRole('listitem')[1]!
    expect(within(second).getByText('실행 전')).toBeInTheDocument()
    // 없는 값을 '0ms'로 적으면 "아주 빨랐다"로 읽힌다.
    expect(second).not.toHaveTextContent('ms')
    // 기대 출력은 그대로 보여 준다 — 실제 출력 칸만 아직 없다.
    expect(within(second).getByText('기대 출력')).toBeInTheDocument()
    expect(within(second).queryByText('실제 출력')).not.toBeInTheDocument()
  })

  /** 서버가 범위 밖 ordinal을 주면 만들어 낸 기대값을 보여 주지 않는다. */
  it('짝지을 예제가 없으면 기대 출력 칸을 빼고 실제 출력만 보여 준다', () => {
    renderRun(fake({ result: result({ cases: [sampleCase({ ordinal: 9 })] }) }))

    const item = screen.getByRole('listitem')
    expect(within(item).queryByText('기대 출력')).not.toBeInTheDocument()
    expect(within(item).getByText('실제 출력')).toBeInTheDocument()
  })

  it('실패하면 서버 문구를 그대로 보여 준다', () => {
    renderRun(
      fake({
        // 서버 응답 그대로다. mutation의 error 타입은 Error라 캐스팅한다(SubmitButton.test와 같다).
        error: {
          status: 400,
          code: 'SOURCE_TOO_LONG',
          detail: '코드는 64KB까지 제출할 수 있어요',
        } as never,
      }),
    )

    expect(screen.getByRole('alert')).toHaveTextContent('코드는 64KB까지 제출할 수 있어요')
  })

  it('채점 불가는 이유를 말하고 다시 누를 수 있게 둔다', () => {
    renderRun(fake({ result: result({ status: 'JUDGE_ERROR', verdict: null }) }))

    expect(liveRegion()).toHaveTextContent('채점 불가')
    expect(liveRegion()).toHaveTextContent('내 코드의 문제가 아니에요')
    expect(screen.getByRole('button', { name: '실행' })).toBeEnabled()
  })

  it('누르면 지금 코드와 언어로 실행을 시작한다', async () => {
    const user = userEvent.setup()
    const start = vi.fn()
    renderRun(fake({ start }), SAMPLES, 'print(1)')

    await user.click(screen.getByRole('button', { name: '실행' }))

    expect(start).toHaveBeenCalledWith({
      problemId: 1,
      language: 'PYTHON',
      sourceCode: 'print(1)',
    })
  })
})

/** 이 화면은 RequireAuth 뒤에 있다. 세션이 없으면 임시 저장이 통째로 건너뛰어진다. */
const USER = { id: 1, nickname: '코다리', role: 'USER' } as const

function renderSolve() {
  const router = createMemoryRouter(
    [
      { path: '/problems/:id', Component: SolvePage },
      { path: '/submissions/:id', element: <h1>제출 결과 도착</h1> },
    ],
    { initialEntries: ['/problems/1'] },
  )
  const client = createQueryClient()
  client.setQueryData(ME_QUERY_KEY, USER)

  render(
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  )
}

/** 풀이 화면에는 지문·안내의 목록이 여럿이다. 예제 결과 목록만 집어낸다. */
const cases = () =>
  within(screen.getByRole('list', { name: '예제별 결과' })).getAllByRole('listitem')

describe('SolvePage에서 예제 실행 (SOLVE-08)', () => {
  afterEach(() => resetSampleRuns())

  /**
   * 접수(202) → 폴링 → 결과까지 한 번에 잰다.
   *
   * 목은 조회마다 한 걸음 나아가므로(QUEUED → RUNNING → COMPLETED) 폴링이 실제로
   * 돌아야 결과가 온다. 기본 간격이 1초라 넉넉히 기다린다 — 제출 결과 화면 테스트와
   * 같은 방식이다.
   *
   * 시작 코드를 그대로 돌리므로 목이 첫 예제를 틀린다. 통과·실패가 섞인 표가 나온다.
   */
  it('실행을 누르면 예제별 결과가 나온다', { timeout: 15_000 }, async () => {
    const user = userEvent.setup()
    renderSolve()

    await user.click(await screen.findByRole('button', { name: '실행' }))

    expect(await screen.findByText(/예제를 실행하고 있어요/)).toBeInTheDocument()

    // 끝날 때까지 기다린다. 목은 첫 응답(QUEUED)부터 예제 칸을 다 채워 보내므로
    // (계약: '실행 전인 예제도 있고 결과 값이 null이다') 개수로 재면 너무 일찍 통과한다.
    await screen.findByText('통과', undefined, { timeout: 6000 })

    const [first, second] = cases()
    expect(cases()).toHaveLength(2)
    expect(within(first!).getByText('틀렸습니다')).toBeInTheDocument()
    expect(within(first!).getByText('0 1')).toBeInTheDocument()
    expect(within(second!).getByText('통과')).toBeInTheDocument()
    // 통과한 예제는 두 상자의 글자가 같다.
    expect(within(second!).getAllByText('1 2')).toHaveLength(2)
  })

  /** 실행은 시도 횟수에 들어가지 않는다(계약). 결과 화면으로 가 버리면 안 된다. */
  it('실행해도 결과 화면으로 가지 않는다', { timeout: 15_000 }, async () => {
    const user = userEvent.setup()
    renderSolve()

    await user.click(await screen.findByRole('button', { name: '실행' }))
    await screen.findByText('통과', undefined, { timeout: 6000 })

    expect(screen.queryByRole('heading', { name: '제출 결과 도착' })).not.toBeInTheDocument()
  })
})

import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { createQueryClient } from '@/app/queryClient'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { resetSubmissions } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { Component as SubmissionResultPage } from './SubmissionResultPage'

const USER = { id: 1, nickname: '코다리', role: 'USER' } as const

function renderResult(url = '/submissions/1') {
  const client = createQueryClient()
  client.setQueryData(ME_QUERY_KEY, USER)
  const router = createMemoryRouter(
    [
      { path: '/submissions/:id', Component: SubmissionResultPage },
      { path: '/problems/:id', element: <h1>문제 풀이 도착</h1> },
    ],
    { initialEntries: [url] },
  )

  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return client
}

/** 목이 조회마다 한 걸음 나아가므로(handlers.ts) 제출을 하나 만들어 둔다. */
async function submit(sourceCode = 'print(1)') {
  const response = await fetch('http://localhost/api/submissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ problemId: 1, language: 'PYTHON', sourceCode }),
  })
  const body = (await response.json()) as { id: number }
  return body.id
}

/** 완료된 결과를 바로 주는 핸들러. 판정별 화면을 볼 때 쓴다. */
function completed(over: Record<string, unknown> = {}) {
  server.use(
    http.get('*/api/submissions/:id', () =>
      HttpResponse.json({
        id: 1,
        problemId: 1,
        problemTitle: '두 수의 합',
        language: 'PYTHON',
        status: 'COMPLETED',
        progress: 100,
        verdict: 'ACCEPTED',
        runtimeErrorType: null,
        runtimeErrorMessage: null,
        compilerMessage: null,
        executionTimeMs: 128,
        memoryUsedKb: 31204,
        submittedAt: '2026-10-24T05:00:00Z',
        judgedAt: '2026-10-24T05:00:03Z',
        ...over,
      }),
    ),
  )
}

describe('SubmissionResultPage', () => {
  afterEach(() => resetSubmissions())

  describe('채점 진행 (RES-01)', () => {
    it('폴링이 상태를 따라가 판정까지 간다', async () => {
      const id = await submit()
      renderResult(`/submissions/${id}`)

      // 목이 조회마다 QUEUED → COMPILING → RUNNING → COMPLETED로 넘어간다.
      expect(await screen.findByText('기다리는 중')).toBeInTheDocument()

      // 중간 상태를 하나씩 잡지 않는다. 폴링 간격(기본 1000ms)과 경합해 조용히 깨진다 —
      // 실제로 '채점 준비 중'을 놓쳐 한 번 깨졌다. 상태별 문구는 아래 테스트들이 목을
      // 직접 세워 보고, 여기서 보는 것은 아무도 밀지 않아도 끝까지 나아간다는 것이다.
      // 세 번 더 물어야 하므로 기다리는 시간을 늘린다. **테스트 쪽 제한도 함께** 늘린다 —
      // vitest 기본값이 5초라, findByText만 6초로 두면 그보다 먼저 걸려 원인을 알려 주는
      // 메시지 대신 일반 timeout으로 실패한다.
      expect(
        await screen.findByText('맞았습니다!!', undefined, { timeout: 6000 }),
      ).toBeInTheDocument()
    }, 15_000)

    /**
     * 끝났는데 계속 물으면 서버와 배터리를 버린다. 탭을 열어 둔 채 자리를 비운 사용자에게
     * 밤새 요청이 나간다.
     */
    it('판정이 나면 더 묻지 않는다', async () => {
      let calls = 0
      server.use(
        http.get('*/api/submissions/:id', () => {
          calls += 1
          return HttpResponse.json({
            id: 1,
            problemId: 1,
            problemTitle: '두 수의 합',
            language: 'PYTHON',
            status: 'COMPLETED',
            progress: 100,
            verdict: 'WRONG_ANSWER',
            runtimeErrorType: null,
            runtimeErrorMessage: null,
            compilerMessage: null,
            executionTimeMs: 100,
            memoryUsedKb: 1000,
            submittedAt: '2026-10-24T05:00:00Z',
            judgedAt: '2026-10-24T05:00:03Z',
          })
        }),
      )
      renderResult()
      await screen.findByText('틀렸습니다')

      const after = calls
      // 폴링 간격(기본 1000ms)보다 넉넉히 기다려 한 번 더 나가는지 본다.
      await new Promise((resolve) => setTimeout(resolve, 1200))
      expect(calls).toBe(after)
    })

    it('채점 중이 아니면 진행률을 붙이지 않는다', async () => {
      completed({ status: 'QUEUED', progress: 0, verdict: null })
      renderResult()

      // '기다리는 중 0%'는 "아직 시작도 안 했다"로 읽혀 오해를 준다.
      const status = await screen.findByText('기다리는 중')
      expect(status).not.toHaveTextContent('%')
      // 폴링으로 문구가 바뀔 때 스크린 리더가 읽어야 한다. 화면을 보지 않는
      // 사용자에게는 이것이 유일한 진행 신호다.
      expect(status).toHaveAttribute('role', 'status')
    })
  })

  describe('판정 표시 (RES-02)', () => {
    it('판정명·제출 번호·언어·시간·메모리를 보여 준다', async () => {
      completed({ id: 42 })
      renderResult('/submissions/42')

      expect(await screen.findByText('맞았습니다!!')).toBeInTheDocument()
      expect(screen.getByText('제출 #42')).toBeInTheDocument()
      expect(screen.getByText('Python')).toBeInTheDocument()
      expect(screen.getByText('128ms')).toBeInTheDocument()
      // 자릿수를 끊어 준다. '31204KB'는 한눈에 크기가 안 읽힌다.
      expect(screen.getByText('31,204KB')).toBeInTheDocument()
    })

    /** 컴파일 에러와 채점 불가는 실행 자체를 못 해 둘 다 null이다(계약). */
    it('시간·메모리가 없으면 그 자리를 비운다', async () => {
      completed({ verdict: 'COMPILE_ERROR', executionTimeMs: null, memoryUsedKb: null })
      renderResult()

      expect(await screen.findByText('컴파일 에러')).toBeInTheDocument()
      // '0ms'로 적으면 "아주 빨랐다"로 읽힌다.
      expect(screen.queryByText(/ms$/)).not.toBeInTheDocument()
      expect(screen.queryByText(/KB$/)).not.toBeInTheDocument()
    })
  })

  describe('다음 행동 (RES-07)', () => {
    it('정답이면 AI 리뷰와 다음 문제를 둔다', async () => {
      completed({ verdict: 'ACCEPTED' })
      renderResult()
      await screen.findByText('맞았습니다!!')

      // 아직 열 곳이 없어 비활성이다. 왜 안 되는지 글자로 적는다 (#42·#44).
      expect(screen.getByRole('button', { name: 'AI 리뷰 (준비 중)' })).toBeDisabled()
      expect(screen.getByRole('button', { name: '다음 문제 (준비 중)' })).toBeDisabled()
      expect(screen.queryByRole('link', { name: '다시 풀기' })).not.toBeInTheDocument()
    })

    it('오답이면 다시 풀기와 AI 분석을 둔다', async () => {
      completed({ verdict: 'WRONG_ANSWER', problemId: 7, language: 'CPP' })
      renderResult()
      await screen.findByText('틀렸습니다')

      // 제출한 언어를 담아야 저장해 둔 그 언어의 코드가 열린다 (SOLVE-11). 없으면 늘
      // 첫 언어(PYTHON)가 열려, C++로 제출한 사람이 Python 자리를 보게 된다.
      expect(screen.getByRole('link', { name: '다시 풀기' })).toHaveAttribute(
        'href',
        '/problems/7?language=CPP',
      )
      expect(screen.getByRole('button', { name: 'AI 분석 (준비 중)' })).toBeDisabled()
    })

    /**
     * 위쪽 문제 제목 링크로 들어가도 같은 곳이어야 한다. 언어가 빠지면 '다시 풀기'에서
     * 고친 문제(저장해 둔 C++ 코드 대신 Python 자리가 열림)가 이 링크에만 남는다.
     */
    it('문제 제목 링크도 제출 언어를 담는다', async () => {
      completed({ verdict: 'WRONG_ANSWER', problemId: 7, language: 'CPP' })
      renderResult()
      await screen.findByText('틀렸습니다')

      expect(screen.getByRole('link', { name: '두 수의 합' })).toHaveAttribute(
        'href',
        '/problems/7?language=CPP',
      )
    })

    /** 출력 형식이 틀린 것도 다시 풀어야 하는 것은 같다. */
    it('ACCEPTED가 아닌 판정은 모두 오답으로 본다', async () => {
      completed({ verdict: 'PRESENTATION_ERROR' })
      renderResult()
      await screen.findByText('출력 형식이 잘못되었습니다')

      expect(screen.getByRole('link', { name: '다시 풀기' })).toBeInTheDocument()
    })

    it('채점이 끝나기 전에는 버튼을 두지 않는다', async () => {
      completed({ status: 'RUNNING', progress: 40, verdict: null })
      renderResult()
      await screen.findByText('채점 중 40%')

      // 채점 중에 '다시 풀기'를 누르면 방금 보낸 제출의 결과를 못 보게 된다.
      expect(screen.queryByRole('link', { name: '다시 풀기' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /준비 중/ })).not.toBeInTheDocument()
    })
  })

  describe('없는 제출', () => {
    it('없는 번호는 찾을 수 없다고 끝낸다', async () => {
      renderResult('/submissions/9999')

      expect(
        await screen.findByRole('heading', { level: 1, name: '찾을 수 없습니다' }),
      ).toBeInTheDocument()
    })

    /**
     * 이 엔드포인트의 404는 없는 제출과 **남의 제출**에 같이 쓰인다(계약: 번호를 바꿔
     * 물어도 있는지 드러나지 않는다). 한 번 더 가도 같은 답이라 재시도가 의미 없다.
     */
    it('404에 다시 묻지 않는다', async () => {
      let calls = 0
      server.use(
        http.get('*/api/submissions/:id', () => {
          calls += 1
          return HttpResponse.json(
            { status: 404, code: 'SUBMISSION_NOT_FOUND', detail: '제출을 찾을 수 없어요' },
            { status: 404 },
          )
        }),
      )
      renderResult()
      await screen.findByRole('heading', { level: 1, name: '찾을 수 없습니다' })

      // heading이 뜨자마자 세면 1초 뒤 재조회가 나가도 첫 요청만 세어져 공짜로 통과한다.
      // 오류 화면 뒤에서 폴링이 계속 도는 것이 이 PR에서 나온 가장 큰 결함이었다 —
      // `retry: false`는 한 번의 fetch 안에서 재시도만 막고 interval 재조회는 막지 않는다.
      await new Promise((resolve) => setTimeout(resolve, 1200))
      expect(calls).toBe(1)
    })

    it('정수가 아닌 주소는 요청하지 않는다', async () => {
      let calls = 0
      server.use(
        http.get('*/api/submissions/:id', () => {
          calls += 1
          return HttpResponse.json({}, { status: 200 })
        }),
      )
      renderResult('/submissions/abc')

      expect(
        await screen.findByRole('heading', { level: 1, name: '찾을 수 없습니다' }),
      ).toBeInTheDocument()
      // 매크로태스크를 한 번 보낸 뒤에 센다 — 없으면 이 단언이 공짜로 통과한다.
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(calls).toBe(0)
    })
  })
})

/** 리뷰에서 나온 세 건이다. 전부 폴링이 도는 **중**에 벌어지는 일이라 따로 모았다. */
describe('폴링 중에 생기는 일', () => {
  /**
   * '채점 중 60%'를 보고 있다가 세션이 만료되거나 네트워크가 잠깐 끊긴 경우다. 받아 둔
   * 진행 상태를 버리고 오류 화면만 남기면, 사용자는 제출이 사라진 것으로 읽는다.
   */
  it('진행 중 폴링이 실패해도 받아 둔 상태를 그대로 보여 준다', async () => {
    let calls = 0
    server.use(
      http.get('*/api/submissions/:id', () => {
        calls += 1
        if (calls === 1) {
          return HttpResponse.json({
            id: 1,
            problemId: 1,
            problemTitle: '두 수의 합',
            language: 'PYTHON',
            status: 'RUNNING',
            progress: 60,
            verdict: null,
            runtimeErrorType: null,
            runtimeErrorMessage: null,
            compilerMessage: null,
            executionTimeMs: null,
            memoryUsedKb: null,
            submittedAt: '2026-10-24T05:00:00Z',
            judgedAt: null,
          })
        }
        return HttpResponse.json({ status: 500, title: 'Internal Server Error' }, { status: 500 })
      }),
    )
    renderResult()
    expect(await screen.findByText('채점 중 60%')).toBeInTheDocument()

    // 폴링이 한 번 더 나가 실패할 때까지 기다린다.
    await waitFor(() => expect(calls).toBeGreaterThan(1), { timeout: 3000 })

    expect(screen.getByText('채점 중 60%')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '문제가 발생했습니다' })).not.toBeInTheDocument()
  })

  /**
   * 받아 둔 것이 없는데 첫 조회가 5xx로 끝난 경우다.
   *
   * 일시적 실패라고 숨기면 오류 화면도 다시 시도 버튼도 없이 스켈레톤만 남고, 매초 실패
   * 요청이 나간다 — 끝나지 않는 로딩으로 읽힌다. 숨길 진행 상태가 없으면 숨기지 않는다.
   */
  it('데이터 없이 일시 오류로 끝나면 오류와 다시 시도를 보여 준다', async () => {
    let calls = 0
    server.use(
      http.get('*/api/submissions/:id', () => {
        calls += 1
        return HttpResponse.json({ status: 503, title: 'Service Unavailable' }, { status: 503 })
      }),
    )
    renderResult()

    expect(
      await screen.findByRole('heading', { level: 1, name: '문제가 발생했습니다' }),
    ).toBeInTheDocument()
    // 일시적 실패는 retryable이라 버튼이 뜬다 — 이 분기에서 onRetry가 실제로 쓰인다.
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    const after = calls
    await new Promise((resolve) => setTimeout(resolve, 1200))
    expect(calls).toBe(after)
  }, 15_000)

  /**
   * 오래 걸리는 채점을 띄워 둔 채 자리를 비우면 폴링 중에 세션이 만료된다.
   *
   * 받아 둔 데이터가 있다고 숨기면 멈춘 진행률만 보이고 401이 끝없이 나간다 — 사용자는
   * 끝나지 않는 채점으로 읽는다. 다시 물어도 같은 답인 오류는 화면을 오류로 바꾼다.
   */
  it('진행 중 401이 오면 폴링을 멈추고 세션을 버린다', async () => {
    let calls = 0
    server.use(
      http.get('*/api/submissions/:id', () => {
        calls += 1
        if (calls === 1) {
          return HttpResponse.json({
            id: 1,
            problemId: 1,
            problemTitle: '두 수의 합',
            language: 'PYTHON',
            status: 'RUNNING',
            progress: 60,
            verdict: null,
            runtimeErrorType: null,
            runtimeErrorMessage: null,
            compilerMessage: null,
            executionTimeMs: null,
            memoryUsedKb: null,
            submittedAt: '2026-10-24T05:00:00Z',
            judgedAt: null,
          })
        }
        return HttpResponse.json({ status: 401, title: 'Unauthorized' }, { status: 401 })
      }),
    )
    const client = renderResult()
    expect(await screen.findByText('채점 중 60%')).toBeInTheDocument()

    // 세션을 버려야 RequireAuth가 로그인 화면으로 보낸다. 문구만 띄우면 주소를 직접 쳐야 한다.
    await waitFor(() => expect(client.getQueryData(ME_QUERY_KEY)).toBeNull(), { timeout: 3000 })
    expect(screen.queryByText('채점 중 60%')).not.toBeInTheDocument()

    const after = calls
    await new Promise((resolve) => setTimeout(resolve, 1200))
    expect(calls).toBe(after)
  }, 15_000)

  /**
   * 화면을 보지 않는 사용자에게 가장 중요한 변화가 판정이다. 진행만 live region에 두면
   * 끝나는 순간 그 영역이 통째로 사라져, '채점 중 60%'까지만 듣고 결과를 직접 찾아야 한다.
   */
  it('판정도 진행과 같은 live region에서 알려 준다', async () => {
    completed({ verdict: 'TIME_LIMIT_EXCEEDED' })
    renderResult()

    const announced = await screen.findByText('시간 초과')
    expect(announced).toHaveAttribute('role', 'status')
  })
})

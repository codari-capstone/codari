import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
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
      // 세 번 더 물어야 하므로 기다리는 시간을 늘린다.
      expect(
        await screen.findByText('맞았습니다!!', undefined, { timeout: 6000 }),
      ).toBeInTheDocument()
    })

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
      completed({ verdict: 'WRONG_ANSWER', problemId: 7 })
      renderResult()
      await screen.findByText('틀렸습니다')

      expect(screen.getByRole('link', { name: '다시 풀기' })).toHaveAttribute('href', '/problems/7')
      expect(screen.getByRole('button', { name: 'AI 분석 (준비 중)' })).toBeDisabled()
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

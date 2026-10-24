import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SubmitButton } from './SubmitButton'
import type { useSubmit } from './submitQuery'

type Submit = ReturnType<typeof useSubmit>

/**
 * mutation 자리에 가짜를 넣는다.
 *
 * 화면 전체로는 못 보는 두 규칙을 여기서 잰다. 접수 뒤 잠금은 lazy 청크를 받는 **사이**의
 * 상태라 라우터를 끼워 재면 타이밍 경합이 되고(실제로 먼저 도착해 버렸다), 오류가 어느
 * 입력의 것인지도 mutation 상태를 직접 쥐어야 가른다.
 */
function fake(over: Partial<Submit>): Submit {
  return {
    isPending: false,
    isSuccess: false,
    error: null,
    variables: undefined,
    mutate: vi.fn(),
    ...over,
  } as unknown as Submit
}

function renderButton(submit: Submit, code = 'print(1)') {
  render(<SubmitButton submit={submit} problemId={1} language="PYTHON" code={code} />)
  return screen.getByRole('button', { name: /제출/ })
}

describe('SubmitButton', () => {
  it('보낼 코드가 있으면 누를 수 있다', () => {
    expect(renderButton(fake({}))).toBeEnabled()
  })

  it('코드가 비어 있으면 누를 수 없다', () => {
    expect(renderButton(fake({}), '   \n ')).toBeDisabled()
  })

  it('보내는 중에는 누를 수 없다', () => {
    expect(renderButton(fake({ isPending: true }))).toBeDisabled()
  })

  /**
   * 결과 화면은 lazy 라우트다. 202가 돌아와 `isPending`이 false가 돼도 청크를 받는 동안
   * 이 화면이 남으므로, 그때 버튼이 열리면 느린 연결에서 사용자가 한 번 더 누른다.
   * 제출은 되돌릴 수 없다 — 시도 횟수가 두 번 오른다.
   */
  it('접수된 뒤에도 잠겨 있다', () => {
    const button = renderButton(fake({ isSuccess: true }))

    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('제출 중…')
  })

  it('실패하면 서버 문구를 그대로 보여 준다', () => {
    renderButton(
      fake({
        error: { status: 400, code: 'SOURCE_EMPTY', detail: '코드를 입력해 주세요' } as never,
        variables: { problemId: 1, language: 'PYTHON', sourceCode: 'print(1)' },
      }),
    )

    expect(screen.getByRole('alert')).toHaveTextContent('코드를 입력해 주세요')
  })

  /**
   * C++로 제출해 받은 문구가 Python으로 바꾼 뒤에도 남으면, 사용자는 Python도 안 되는
   * 것으로 읽는다. 보낸 값과 지금 값을 비교해 가른다.
   */
  it('다른 언어로 보냈던 오류는 보여 주지 않는다', () => {
    renderButton(
      fake({
        error: {
          status: 400,
          code: 'LANGUAGE_NOT_SUPPORTED',
          detail: '언어를 바꿔 주세요',
        } as never,
        variables: { problemId: 1, language: 'CPP', sourceCode: 'print(1)' },
      }),
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('코드를 고친 뒤에는 이전 오류를 보여 주지 않는다', () => {
    renderButton(
      fake({
        error: { status: 400, code: 'SOURCE_EMPTY', detail: '코드를 입력해 주세요' } as never,
        variables: { problemId: 1, language: 'PYTHON', sourceCode: '예전 코드' },
      }),
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

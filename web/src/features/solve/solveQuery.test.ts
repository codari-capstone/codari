import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { createQueryClient } from '@/app/queryClient'
import { problemDetails } from '@/mocks/fixtures/problemDetails'
import { parseProblemId, problemDetailQuery } from './solveQuery'

function client(): QueryClient {
  return createQueryClient()
}

describe('problemDetailQuery', () => {
  it('문제 상세를 가져온다', async () => {
    const detail = await client().fetchQuery(problemDetailQuery(1))

    expect(detail.title).toBe('두 수의 합')
    // 비공개 테스트 케이스와 정답 코드는 응답에 없다(계약). 공개 예제만 온다.
    expect(detail.samples).toHaveLength(2)
    expect(detail.languages.map((item) => item.language)).toEqual(['PYTHON', 'CPP'])
  })

  it('없는 번호는 404 code를 실어 던진다', async () => {
    await expect(client().fetchQuery(problemDetailQuery(9999))).rejects.toMatchObject({
      status: 404,
      code: 'PROBLEM_NOT_FOUND',
    })
  })

  it('목록의 모든 문제에 상세가 있다', async () => {
    // 목록에서 눌렀는데 404가 나는 문제가 목에 생기지 않게 한다.
    const detail = await client().fetchQuery(
      problemDetailQuery(problemDetails[problemDetails.length - 1].id),
    )

    expect(detail.id).toBe(problemDetails[problemDetails.length - 1].id)
  })
})

describe('parseProblemId', () => {
  it('정수를 읽는다', () => {
    expect(parseProblemId('12')).toBe(12)
  })

  // 주소는 사용자가 손으로 고친다. 계약은 정수가 아닌 id에 400, 없는 번호에 404를 주는데
  // 사용자에게는 둘 다 "없는 문제"다. 보낼 필요가 없는 요청은 보내지 않는다.
  it.each(['abc', '1.5', '0', '-3', '', '1e300', undefined])('모르는 id는 null이다: %s', (raw) => {
    expect(parseProblemId(raw)).toBeNull()
  })
})

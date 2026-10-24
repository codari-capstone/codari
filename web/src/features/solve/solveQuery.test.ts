import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { createQueryClient } from '@/app/queryClient'
import { problemDetails } from '@/mocks/fixtures/problemDetails'
import { problems } from '@/mocks/fixtures/problems'
import { problemDetailQuery } from './solveQuery'

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

  it('목록의 모든 문제에 상세가 있다', () => {
    // 목록에서 눌렀는데 404가 나는 문제가 목에 생기지 않게 한다. 지금은 상세를 목록에서
    // 파생시키므로 저절로 지켜지지만, 누가 상세를 손으로 적은 목록으로 바꾸면 깨진다.
    expect(problemDetails.map((item) => item.id).sort((a, b) => a - b)).toEqual(
      problems.map((item) => item.id).sort((a, b) => a - b),
    )
  })
})

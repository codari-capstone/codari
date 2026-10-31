import { describe, expect, it } from 'vitest'

import type { AdminSolution } from '@/api/types'
import { adminSolutionsQuery } from './adminProblemQuery'
import {
  changedLanguages,
  dropSubmitted,
  toBody,
  toCodes,
  tooLongLanguages,
  MAX_SOURCE_BYTES,
} from './solutionsState'

function solution(language: 'PYTHON' | 'CPP', sourceCode: string): AdminSolution {
  return {
    language,
    sourceCode,
    verifiedAt: null,
    status: 'NOT_VALIDATED',
    progress: 0,
    verdict: null,
    compilerMessage: null,
  }
}

describe('solutionsState (ADM-05)', () => {
  it('없는 언어는 빈 칸으로 채운다', () => {
    // 계약: 정답 코드가 없는 언어는 목록에 없다. 화면은 늘 두 칸을 보여 준다.
    expect(toCodes([solution('PYTHON', 'print(1)')])).toEqual({ PYTHON: 'print(1)', CPP: '' })
  })

  it('빈 칸도 빼지 않고 보낸다', () => {
    // 계약이 빈 코드를 '그 언어를 지운다'로 받는다. 목록에서 빼면 지워지지 않는다.
    expect(toBody({ PYTHON: 'print(1)', CPP: '' })).toEqual([
      { language: 'PYTHON', sourceCode: 'print(1)' },
      { language: 'CPP', sourceCode: '' },
    ])
  })

  it('공백뿐인 칸은 빈 칸과 같게 센다', () => {
    // 서버도 그렇게 센다(공백뿐이면 지운다). 다르게 세면 '바뀐 내용이 없어요'가 어긋난다.
    const saved = [solution('PYTHON', 'print(1)')]
    expect(changedLanguages({ PYTHON: 'print(1)', CPP: '   ' }, saved)).toEqual([])
  })

  it('64KB를 넘은 언어만 집어낸다', () => {
    const codes = { PYTHON: 'x'.repeat(MAX_SOURCE_BYTES + 1), CPP: 'ok' }
    expect(tooLongLanguages(codes)).toEqual(['PYTHON'])
  })

  describe('dropSubmitted', () => {
    it('보낸 것과 같은 칸만 걷어 낸다', () => {
      const body = [
        { language: 'PYTHON' as const, sourceCode: 'print(1)' },
        { language: 'CPP' as const, sourceCode: '' },
      ]
      expect(dropSubmitted({ PYTHON: 'print(1)', CPP: 'int main(){}' }, body)).toEqual({
        CPP: 'int main(){}',
      })
    })

    /**
     * 리뷰 지적(major): 저장이 도는 동안 더 친 글자는 서버로 가지 않았다. 층을 통째로
     * 비우면 그 입력이 안내도 없이 사라진다.
     */
    it('보낸 뒤에 더 친 글자는 남긴다', () => {
      const body = [{ language: 'PYTHON' as const, sourceCode: 'print(1)' }]
      expect(dropSubmitted({ PYTHON: 'print(1) # 더 친 글자' }, body)).toEqual({
        PYTHON: 'print(1) # 더 친 글자',
      })
    })
  })

  /**
   * 리뷰 지적(minor): `data`만 보면 마지막 'VALIDATING'이 캐시에 남아, 재조회가 계속
   * 실패해도 화면 뒤에서 요청이 끝없이 나간다.
   */
  describe('검증 폴링 간격', () => {
    const interval = adminSolutionsQuery(1).refetchInterval
    const call = (state: { data?: AdminSolution[]; error: unknown }) =>
      typeof interval === 'function'
        ? interval({ state: { data: state.data, error: state.error } } as never)
        : interval

    it('검증 중이면 주기적으로 다시 묻는다', () => {
      expect(
        call({ data: [{ ...solution('PYTHON', ''), status: 'VALIDATING' }], error: null }),
      ).toBeGreaterThan(0)
    })

    it('끝났으면 멈춘다', () => {
      expect(call({ data: [{ ...solution('PYTHON', ''), status: 'PASSED' }], error: null })).toBe(
        false,
      )
    })

    it('오류가 나면 멈춘다', () => {
      const data = [{ ...solution('PYTHON', ''), status: 'VALIDATING' as const }]
      expect(call({ data, error: new Error('404') })).toBe(false)
    })
  })
})

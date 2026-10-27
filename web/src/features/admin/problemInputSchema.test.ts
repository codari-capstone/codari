import { describe, expect, it } from 'vitest'

import type { AdminProblemVersion } from '@/api/types'
import {
  EMPTY_FORM,
  followsPythonFormula,
  problemInputSchema,
  pythonLimits,
  toForm,
} from './problemInputSchema'

/**
 * 숫자로 된 언어 설정. EMPTY_FORM은 폼 모양(z.input)이라 제한값이 unknown이고,
 * followsPythonFormula는 저장된 값(number)을 받는다.
 */
const LANGUAGES = [
  { language: 'PYTHON' as const, timeLimitMs: 5000, memoryLimitMb: 512, starterCode: '' },
  { language: 'CPP' as const, timeLimitMs: 1000, memoryLimitMb: 256, starterCode: '' },
]

/** 통과하는 값 한 벌. 테스트마다 틀리게 만들 칸만 덮어쓴다. */
function valid(over: Partial<typeof EMPTY_FORM> = {}) {
  return { ...EMPTY_FORM, title: '두 수의 합', ...over }
}

describe('pythonLimits', () => {
  /**
   * #65 실측으로 확정된 배수다(`docs/judge-verdict-mapping.md` 1절). 그 문서가
   * "등록할 때 반영해 저장하므로 요청을 만들 때 다시 곱하지 않는다"고 적었으므로,
   * 이 값이 틀리면 그 문제의 Python 제출이 전부 시간 초과가 된다.
   */
  it('시간은 ×3 + 2초, 메모리는 ×2다', () => {
    expect(pythonLimits({ timeLimitMs: 1000, memoryLimitMb: 256 })).toEqual({
      timeLimitMs: 5000,
      memoryLimitMb: 512,
    })
  })
})

describe('followsPythonFormula', () => {
  it('보정값과 같으면 참이다', () => {
    expect(followsPythonFormula(LANGUAGES)).toBe(true)
  })

  it('누군가 직접 넣은 값이면 거짓이다', () => {
    const languages = LANGUAGES.map((entry) =>
      entry.language === 'PYTHON' ? { ...entry, timeLimitMs: 4000 } : entry,
    )

    expect(followsPythonFormula(languages)).toBe(false)
  })

  // 계약은 초안에 언어가 하나만 있어도 받아 준다. 계산할 근거가 없으면 직접 입력으로 연다.
  it('C++ 설정이 없으면 거짓이다', () => {
    const onlyPython = LANGUAGES.filter((entry) => entry.language === 'PYTHON')

    expect(followsPythonFormula(onlyPython)).toBe(false)
  })
})

describe('problemInputSchema', () => {
  it('제목이 공백뿐이면 막는다', () => {
    const result = problemInputSchema.safeParse(valid({ title: '   ' }))

    expect(result.success).toBe(false)
  })

  it('태그가 4개면 막는다', () => {
    const result = problemInputSchema.safeParse(valid({ tags: ['array', 'string', 'hash', 'dp'] }))

    expect(result.success).toBe(false)
  })

  /**
   * 계약: "`http://`나 `https://`로 시작해야 한다. 사용자 화면에 링크로 나간다."
   * 서버는 이걸 `code` 없는 400으로 답해 보여 줄 문구가 없다 — 화면이 막아야 한다.
   */
  it('원본 URL이 http(s)로 시작하지 않으면 막는다', () => {
    const result = problemInputSchema.safeParse(valid({ sourceUrl: 'leetcode.com/two-sum' }))

    expect(result.success).toBe(false)
  })

  it('원본 URL이 비어 있으면 통과하고 null이 된다', () => {
    const result = problemInputSchema.safeParse(valid({ sourceUrl: '' }))

    expect(result.success).toBe(true)
    expect(result.data?.sourceUrl).toBeNull()
  })

  /**
   * 빈 문자열을 그대로 보내면 '빈 출처'가 저장되고, 사용자 화면은 `sourceName !== null`을
   * 보고 빈 출처 줄을 그린다 (SOLVE-03에서 겪은 그 버그다).
   */
  it('출처·라이선스의 공백도 null이 된다', () => {
    const result = problemInputSchema.safeParse(valid({ sourceName: '  ', license: '' }))

    expect(result.data?.sourceName).toBeNull()
    expect(result.data?.license).toBeNull()
  })

  // 입력란은 문자열을 준다. 그대로 보내면 서버가 타입으로 거절한다.
  it('제한값 문자열을 숫자로 바꾼다', () => {
    const languages = EMPTY_FORM.languages.map((entry) => ({
      ...entry,
      timeLimitMs: '1500' as unknown as number,
    }))

    const result = problemInputSchema.safeParse(valid({ languages }))

    expect(result.success).toBe(true)
    expect(result.data?.languages[0]?.timeLimitMs).toBe(1500)
  })

  it('메모리 제한이 2보다 작으면 막는다', () => {
    const languages = EMPTY_FORM.languages.map((entry) => ({ ...entry, memoryLimitMb: 1 }))

    expect(problemInputSchema.safeParse(valid({ languages })).success).toBe(false)
  })

  /**
   * 상한(20초·512MB)은 걸지 않는다. 서버가 `LIMIT_OUT_OF_RANGE`와 함께 범위를 담아
   * 주므로, 화면에 적으면 judge0.conf가 바뀌는 날 두 곳이 갈라진다.
   */
  it('상한은 서버에 맡긴다', () => {
    const languages = EMPTY_FORM.languages.map((entry) => ({ ...entry, timeLimitMs: 99_000 }))

    expect(problemInputSchema.safeParse(valid({ languages })).success).toBe(true)
  })
})

describe('toForm', () => {
  const version: AdminProblemVersion = {
    id: 1,
    slug: 'p-1',
    versionNo: 2,
    status: 'DRAFT',
    createdAt: '2026-10-20T09:00:00Z',
    publishedAt: null,
    title: '두 수의 합',
    difficulty: 'EASY',
    statementMarkdown: '지문',
    inputDescription: '입력',
    outputDescription: '출력',
    constraintsMarkdown: '',
    sourceName: null,
    sourceUrl: null,
    license: null,
    tags: ['array'],
    languages: [{ language: 'CPP', timeLimitMs: 2000, memoryLimitMb: 128, starterCode: 'int' }],
  }

  it('null을 빈 문자열로 되돌린다', () => {
    const form = toForm(version)

    expect(form.sourceName).toBe('')
    expect(form.sourceUrl).toBe('')
    expect(form.license).toBe('')
  })

  // 서버가 한 언어만 준 초안도 두 줄로 열려야 한다. 빠진 언어는 기본값으로 채운다.
  it('언어를 폼의 순서로 두 줄 세운다', () => {
    const form = toForm(version)

    expect(form.languages.map((entry) => entry.language)).toEqual(['PYTHON', 'CPP'])
    expect(form.languages[1]?.timeLimitMs).toBe(2000)
  })
})

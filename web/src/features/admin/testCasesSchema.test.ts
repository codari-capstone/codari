import { describe, expect, it } from 'vitest'

import {
  formatBytes,
  MAX_INPUT_BYTES,
  MAX_OUTPUT_BYTES,
  testCasesSchema,
  totalBytesError,
  utf8Bytes,
} from './testCasesSchema'

describe('utf8Bytes', () => {
  // 한글은 3바이트다. length로 세면 상한의 3분의 1에서 걸린다.
  it('한글을 3바이트로 센다', () => {
    expect(utf8Bytes('가')).toBe(3)
    expect('가'.length).toBe(1)
  })

  it('줄바꿈도 센다', () => {
    expect(utf8Bytes('1 2\n')).toBe(4)
  })
})

describe('formatBytes', () => {
  it('1KiB 아래는 바이트로 쓴다', () => {
    expect(formatBytes(512)).toBe('512B')
  })

  it('1MiB 아래는 KB로 쓴다', () => {
    expect(formatBytes(2048)).toBe('2.0KB')
  })

  it('1MiB 이상은 MB로 쓴다', () => {
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0MB')
  })
})

// 2MiB짜리를 테스트마다 새로 만들면 한 파일에서 10MB 넘게 할당해, 병렬로 도는 다른
// 테스트 파일까지 느려진다(5초 제한에 걸린 파일이 있었다). 한 번 만들어 돌려 쓴다.
const BIG_INPUT = 'a'.repeat(MAX_INPUT_BYTES)
const BIG_OUTPUT = 'a'.repeat(MAX_OUTPUT_BYTES)

describe('testCasesSchema', () => {
  it('글을 다듬지 않는다', () => {
    const parsed = testCasesSchema.parse({
      cases: [{ caseType: 'SAMPLE', input: ' 1 2 \n', output: '3\n\n' }],
    })

    // 계약: "글은 받은 그대로 저장한다 — 앞뒤 공백·줄바꿈 포함." trim을 걸면 기대 출력의
    // 마지막 줄바꿈이 사라져 채점이 틀어진다.
    expect(parsed.cases[0]).toEqual({ caseType: 'SAMPLE', input: ' 1 2 \n', output: '3\n\n' })
  })

  it('빈 입력·기대 출력을 받는다', () => {
    expect(
      testCasesSchema.safeParse({ cases: [{ caseType: 'HIDDEN', input: '', output: '' }] }).success,
    ).toBe(true)
  })

  it('케이스 10개를 넘기면 막는다', () => {
    const cases = Array.from({ length: 11 }, () => ({
      caseType: 'SAMPLE' as const,
      input: '',
      output: '',
    }))

    const result = testCasesSchema.safeParse({ cases })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('케이스는 10개까지예요')
  })

  it('입력 2MiB를 넘긴 행을 짚어 준다', () => {
    const result = testCasesSchema.safeParse({
      cases: [
        { caseType: 'SAMPLE', input: '', output: '' },
        { caseType: 'HIDDEN', input: BIG_INPUT + 'a', output: '' },
      ],
    })

    expect(result.success).toBe(false)
    // 어느 행인지 말해 주어야 고칠 수 있다.
    expect(result.error?.issues[0]?.path).toEqual(['cases', 1, 'input'])
    expect(result.error?.issues[0]?.message).toBe('입력이 2MiB를 넘어요')
  })

  it('기대 출력 1MiB를 넘긴 행을 짚어 준다', () => {
    const result = testCasesSchema.safeParse({
      cases: [{ caseType: 'SAMPLE', input: '', output: BIG_OUTPUT + 'a' }],
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['cases', 0, 'output'])
  })

  it('상한만큼은 받는다', () => {
    expect(
      testCasesSchema.safeParse({
        cases: [{ caseType: 'SAMPLE', input: BIG_INPUT, output: '' }],
      }).success,
    ).toBe(true)
  })
})

describe('totalBytesError', () => {
  it('합이 10MiB 아래면 null이다', () => {
    expect(totalBytesError([{ caseType: 'SAMPLE', input: '1\n', output: '1\n' }])).toBeNull()
  })

  /**
   * 행마다는 상한 안인데 합이 넘는 경우다. 이것만 스키마에 넣지 않은 까닭은 오류가 붙을
   * 자리가 행이 아니라 표 전체라서다.
   */
  it('행마다는 괜찮아도 합이 10MiB를 넘으면 문구를 준다', () => {
    const cases = Array.from({ length: 6 }, () => ({
      caseType: 'HIDDEN' as const,
      input: BIG_INPUT,
      output: '',
    }))

    expect(totalBytesError(cases)).toContain('10MiB를 넘어요')
    expect(totalBytesError(cases)).toContain('12.0MB')
  })
})

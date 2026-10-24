import { afterEach, describe, expect, it, vi } from 'vitest'

import { readSavedCode, savedCodeKey, storeSavedCode } from './savedCode'

describe('savedCode', () => {
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('문제와 언어가 키에 함께 들어간다', () => {
    expect(savedCodeKey(7, 'PYTHON')).toBe('solve:7:PYTHON')
    // 언어가 빠지면 Python으로 쓰던 코드가 C++ 자리에 그대로 열린다.
    expect(savedCodeKey(7, 'CPP')).not.toBe(savedCodeKey(7, 'PYTHON'))
  })

  it('쓴 코드를 그대로 읽는다', () => {
    storeSavedCode(1, 'PYTHON', 'print(1)')

    expect(readSavedCode(1, 'PYTHON')).toBe('print(1)')
    expect(readSavedCode(1, 'CPP')).toBeNull()
    expect(readSavedCode(2, 'PYTHON')).toBeNull()
  })

  /**
   * 사생활 보호 모드나 사이트 데이터가 막힌 브라우저에서는 접근 자체가 던진다.
   * 저장이 없던 것으로 보고 넘어가야 한다 — 화면이 터지면 문제를 못 푼다.
   */
  it('저장소가 던져도 읽기는 null, 쓰기는 조용히 넘어간다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })

    expect(readSavedCode(1, 'PYTHON')).toBeNull()
    expect(() => storeSavedCode(1, 'PYTHON', 'print(1)')).not.toThrow()
  })
})

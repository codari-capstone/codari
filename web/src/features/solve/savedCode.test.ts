import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearSavedCode, readSavedCode, savedCodeKey, storeSavedCode } from './savedCode'

describe('savedCode', () => {
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('사용자·문제·언어가 모두 키에 들어간다', () => {
    expect(savedCodeKey(5, 7, 'PYTHON')).toBe('solve:5:7:PYTHON')
    // 사용자가 빠지면 공용 PC에서 다른 계정의 코드가 열린다.
    expect(savedCodeKey(6, 7, 'PYTHON')).not.toBe(savedCodeKey(5, 7, 'PYTHON'))
    // 언어가 빠지면 Python으로 쓰던 코드가 C++ 자리에 열린다.
    expect(savedCodeKey(5, 7, 'CPP')).not.toBe(savedCodeKey(5, 7, 'PYTHON'))
  })

  it('쓴 코드를 그대로 읽는다', () => {
    storeSavedCode(5, 1, 'PYTHON', 'print(1)')

    expect(readSavedCode(5, 1, 'PYTHON')).toBe('print(1)')
    expect(readSavedCode(5, 1, 'CPP')).toBeNull()
    expect(readSavedCode(5, 2, 'PYTHON')).toBeNull()
  })

  /**
   * 공용 PC에서 A가 쓰고 로그아웃하지 않은 채 B가 로그인하는 경우다. 세션이 조용히
   * 끊기면 로그아웃을 거치지도 않으니, 지우는 것만으로는 막을 수 없고 키가 갈려야 한다.
   */
  it('다른 사용자의 코드를 읽지도 덮어쓰지도 않는다', () => {
    storeSavedCode(5, 1, 'PYTHON', 'A가 쓴 코드')

    expect(readSavedCode(6, 1, 'PYTHON')).toBeNull()

    storeSavedCode(6, 1, 'PYTHON', 'B가 쓴 코드')
    expect(readSavedCode(5, 1, 'PYTHON')).toBe('A가 쓴 코드')
  })

  it('사용자를 모르면 읽지도 쓰지도 않는다', () => {
    storeSavedCode(undefined, 1, 'PYTHON', 'print(1)')

    expect(localStorage.length).toBe(0)
    expect(readSavedCode(undefined, 1, 'PYTHON')).toBeNull()
  })

  /** 로그아웃은 "이 사람의 데이터를 전부 잊는다"는 뜻이다 (useLogout 주석). */
  it('지우면 모든 사용자의 저장이 사라지고 다른 키는 남는다', () => {
    storeSavedCode(5, 1, 'PYTHON', 'A')
    storeSavedCode(6, 2, 'CPP', 'B')
    localStorage.setItem('codari-theme', 'dark')

    clearSavedCode()

    expect(readSavedCode(5, 1, 'PYTHON')).toBeNull()
    expect(readSavedCode(6, 2, 'CPP')).toBeNull()
    // 테마는 사람이 아니라 이 기기의 보기 설정이다.
    expect(localStorage.getItem('codari-theme')).toBe('dark')
  })

  /**
   * 사생활 보호 모드나 사이트 데이터가 막힌 브라우저에서는 접근 자체가 던진다.
   * 저장이 없던 것으로 보고 넘어가야 한다 — 화면이 터지면 문제를 못 푼다.
   */
  it('저장소가 던져도 읽기는 null, 쓰기와 지우기는 조용히 넘어간다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
      throw new Error('denied')
    })

    expect(readSavedCode(5, 1, 'PYTHON')).toBeNull()
    expect(() => storeSavedCode(5, 1, 'PYTHON', 'print(1)')).not.toThrow()
    expect(() => clearSavedCode()).not.toThrow()
  })
})

import { describe, expect, it } from 'vitest'

import { formatTimeLimit, LANGUAGE_LABEL } from './labels'

describe('formatTimeLimit', () => {
  it('초로 바꾼다', () => {
    expect(formatTimeLimit(2000)).toBe('2초')
  })

  /**
   * 반올림하면 안 된다.
   *
   * 1500ms 제한을 "2초"로 알려 주면, 1.7초에 TLE가 난 사용자가 왜 떨어졌는지 모른다.
   * 서버가 언어별 시간 보정(#72)을 하면 나누어떨어지지 않는 제한이 나올 수 있다.
   */
  it('나누어떨어지지 않으면 소수로 보여 준다', () => {
    expect(formatTimeLimit(1500)).toBe('1.5초')
    expect(formatTimeLimit(500)).toBe('0.5초')
  })
})

describe('LANGUAGE_LABEL', () => {
  // 화면은 지금 첫 언어(PYTHON)만 그려서 CPP 라벨이 어디서도 안 보인다.
  // SOLVE-04(2차)에서 언어를 고르면 바로 쓰인다.
  it('계약의 enum 값마다 문구가 있다', () => {
    expect(LANGUAGE_LABEL).toEqual({ PYTHON: 'Python', CPP: 'C++' })
  })
})

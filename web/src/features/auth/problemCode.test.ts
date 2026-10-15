import { describe, expect, it } from 'vitest'

import { problemCode, problemMessage } from './problemCode'

describe('problemCode', () => {
  it('본문의 code를 꺼낸다', () => {
    expect(problemCode({ status: 409, code: 'EMAIL_TAKEN' })).toBe('EMAIL_TAKEN')
  })

  it('code가 없으면 undefined다', () => {
    // RFC 9457의 모든 멤버는 선택이다. 서버가 code를 빼고 줄 수 있다.
    expect(problemCode({ status: 500 })).toBeUndefined()
    expect(problemCode(new Error('network'))).toBeUndefined()
    expect(problemCode(null)).toBeUndefined()
  })

  it('code가 문자열이 아니면 undefined다', () => {
    // 그대로 돌려주면 화면이 숫자를 코드로 비교해 분기가 조용히 어긋난다.
    expect(problemCode({ code: 42 })).toBeUndefined()
  })
})

describe('problemMessage', () => {
  it('서버의 detail을 그대로 돌려준다', () => {
    // 이 프로젝트의 인증 API는 detail에 한국어 사용자 문구를 담는다 (contracts/openapi.yaml).
    expect(
      problemMessage({ status: 409, code: 'EMAIL_TAKEN', detail: '이미 가입된 이메일이에요' }),
    ).toBe('이미 가입된 이메일이에요')
  })

  it('detail이 없으면 일반 문구로 떨어진다', () => {
    // 네트워크 오류나 detail 없는 5xx다. toUserMessage가 상태별 문구를 준다.
    expect(problemMessage({ status: 500 })).not.toBe('')
    expect(problemMessage(undefined)).not.toBe('')
  })

  it('detail이 빈 문자열이면 일반 문구로 떨어진다', () => {
    // 빈 문구를 그대로 그리면 사용자는 아무 설명 없이 실패만 본다.
    expect(problemMessage({ status: 400, detail: '' })).not.toBe('')
  })
})

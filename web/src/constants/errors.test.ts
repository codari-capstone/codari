import { describe, expect, it } from 'vitest'

import { toUserMessage } from './errors'

describe('toUserMessage', () => {
  it('아는 type이면 그 문구를 쓴다', () => {
    const msg = toUserMessage({
      type: '/problems/judge-unavailable',
      title: 'Judge unavailable',
      status: 503,
      detail: 'Judge0 queue is not reachable',
    })

    expect(msg.title).toBe('지금은 제출할 수 없습니다')
    expect(msg.description).toContain('시도 횟수에 넣지 않습니다')
    expect(msg.retryable).toBe(true)
  })

  it('모르는 type이면 status별 기본 문구를 쓴다', () => {
    expect(toUserMessage({ type: '/problems/unknown-thing', status: 404 }).title).toBe(
      '찾을 수 없습니다',
    )
    expect(toUserMessage({ status: 401 }).title).toBe('로그인이 필요합니다')
    expect(toUserMessage({ status: 403 }).title).toBe('권한이 없습니다')
    expect(toUserMessage({ status: 429 }).retryable).toBe(true)
  })

  /**
   * 413은 본문이 512KB를 넘을 때다(계약: 모든 API 공통). 서버가 본문을 읽지도 않아
   * `code`가 없으므로 이 표가 받는다 — 없으면 "문제가 발생했습니다"로 떨어져, 무엇을
   * 줄여야 하는지 알 수 없다. 다시 보내도 같은 결과라 retryable이 아니다.
   */
  it('413은 줄이라고 말하고 재시도를 권하지 않는다', () => {
    expect(toUserMessage({ status: 413 }).title).toBe('보낸 내용이 너무 큽니다')
    expect(toUserMessage({ status: 413 }).retryable).toBe(false)
  })

  it('5xx는 다시 시도할 수 있다고 본다', () => {
    expect(toUserMessage({ status: 500 }).retryable).toBe(true)
    expect(toUserMessage({ status: 502 }).retryable).toBe(true)
  })

  // status 0은 일부 fetch 래퍼가 네트워크 실패를 올릴 때 쓴다. 재시도가 가장 적절한 경우다.
  it('status 0(네트워크 실패)도 다시 시도할 수 있다고 본다', () => {
    expect(toUserMessage({ status: 0 }).retryable).toBe(true)
  })

  it('4xx는 다시 시도해도 같다고 본다', () => {
    expect(toUserMessage({ status: 400 }).retryable).toBe(false)
    expect(toUserMessage({ status: 404 }).retryable).toBe(false)
    expect(toUserMessage({ status: 418 }).retryable).toBe(false)
  })

  // 서버가 보내는 type은 외부 입력이다. 프로토타입 상속 키가 표에 적중한 것처럼
  // 동작하면 title·description이 undefined인 빈 오류 화면이 된다.
  it('프로토타입 상속 키를 type으로 받아도 폴백으로 간다', () => {
    for (const type of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      const msg = toUserMessage({ type, status: 500 })
      expect(msg.title).toBe('문제가 발생했습니다')
      expect(msg.retryable).toBe(true)
    }
  })

  it('반환한 객체를 고쳐도 표가 오염되지 않는다', () => {
    const first = toUserMessage({ type: '/problems/judge-unavailable' })
    first.title = '바뀐 제목'
    expect(toUserMessage({ type: '/problems/judge-unavailable' }).title).toBe(
      '지금은 제출할 수 없습니다',
    )
  })

  // 네트워크가 끊기면 JSON이 아니라 Error나 undefined가 올라온다
  it('RFC 9457 형식이 아니어도 문구를 돌려준다', () => {
    expect(toUserMessage(undefined).title).toBe('문제가 발생했습니다')
    expect(toUserMessage(new Error('Failed to fetch')).title).toBe('문제가 발생했습니다')
    expect(toUserMessage('그냥 문자열').title).toBe('문제가 발생했습니다')
    expect(toUserMessage(undefined).retryable).toBe(true)
  })

  it('입력이 ProblemDetail이 아닐 때 돌려준 객체를 고쳐도 FALLBACK이 오염되지 않는다', () => {
    const first = toUserMessage(undefined)
    first.title = '바뀐 제목'
    expect(toUserMessage(undefined).title).toBe('문제가 발생했습니다')
  })

  // 서버 detail을 그대로 보여 주면 사용자가 읽을 수 없는 영어 기술 문장이 노출된다
  it('서버 detail을 사용자 문구로 쓰지 않는다', () => {
    const msg = toUserMessage({ status: 500, detail: 'NullPointerException at line 42' })
    expect(msg.description).not.toContain('NullPointerException')
  })
})

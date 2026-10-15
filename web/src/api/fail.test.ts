import { describe, expect, it } from 'vitest'

import { fail } from './fail'

// fail은 Error가 아닌 평범한 객체를 던지므로 toThrow 대신 잡아서 비교한다.
function thrownBy(result: Parameters<typeof fail>[0]): unknown {
  try {
    fail(result)
  } catch (error) {
    return error
  }
  return undefined
}

describe('fail', () => {
  it('본문의 code·detail을 그대로 싣고 status는 HTTP 상태로 덮는다', () => {
    const thrown = thrownBy({
      error: { code: 'EMAIL_TAKEN', detail: '이미 가입된 이메일이에요', status: 999 },
      response: new Response(null, { status: 409 }),
    })
    expect(thrown).toEqual({ code: 'EMAIL_TAKEN', detail: '이미 가입된 이메일이에요', status: 409 })
  })

  it('본문이 없으면 status만 올린다', () => {
    expect(thrownBy({ response: new Response(null, { status: 500 }) })).toEqual({ status: 500 })
  })

  it('본문이 객체가 아니면 status만 올린다', () => {
    expect(thrownBy({ error: 'oops', response: new Response(null, { status: 503 }) })).toEqual({
      status: 503,
    })
  })
})

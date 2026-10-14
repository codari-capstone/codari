import { describe, expect, it } from 'vitest'

import { loginErrorMessage, loginSchema } from './loginSchema'

describe('loginSchema', () => {
  it('올바른 입력을 통과시킨다', () => {
    const result = loginSchema.safeParse({
      email: 'user@codari.test',
      password: 'Codari!test1',
    })

    expect(result.success).toBe(true)
  })

  it('공백만 넣으면 두 필드 모두 해당 문구로 거부한다', () => {
    // 이메일 문구가 형식 문구로 바뀌면(trim이 빠지면) 이 단언이 깨진다.
    const result = loginSchema.safeParse({ email: '   ', password: '   ' })

    expect(result.success).toBe(false)
    const messages = result.error?.issues.map((i) => [String(i.path[0]), i.message])
    expect(messages).toContainEqual(['email', '이메일을 입력해 주세요'])
    expect(messages).toContainEqual(['password', '비밀번호를 입력해 주세요'])
  })

  it('비밀번호가 공백만이면 이메일이 맞아도 거부한다', () => {
    // 이 단언이 없으면 공백 비밀번호가 서버까지 간다.
    const result = loginSchema.safeParse({ email: 'a@b.co', password: '   ' })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path[0]).toBe('password')
    expect(result.error?.issues[0]?.message).toBe('비밀번호를 입력해 주세요')
  })

  it('비밀번호의 앞뒤 공백은 값의 일부로 그대로 둔다', () => {
    // 비밀번호를 trim하면 앞뒤 공백이 실제 값인 계정이 로그인할 수 없게 된다. 다시 떼지 말 것.
    const result = loginSchema.safeParse({ email: 'a@b.co', password: ' s3cret! ' })

    expect(result.success && result.data.password).toBe(' s3cret! ')
  })

  it('앞뒤 공백을 떼고 돌려준다', () => {
    const result = loginSchema.safeParse({
      email: '  user@codari.test  ',
      password: 'Codari!test1',
    })

    expect(result.success && result.data.email).toBe('user@codari.test')
  })

  it('이메일 모양이 아니면 거부한다', () => {
    expect(loginSchema.safeParse({ email: 'codari.test', password: 'Codari!test1' }).success).toBe(
      false,
    )
  })

  it('비밀번호 길이 규칙을 걸지 않는다', () => {
    // 로그인은 형식만 본다(loginSchema.ts 주석 참고). 규칙이 바뀐 뒤 가입한 계정이 자기 비밀번호를 못 넣게 되고,
    // 길이 거부가 그 계정의 비밀번호 길이를 알려 주는 단서가 된다.
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'a' }).success).toBe(true)
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'a'.repeat(99) }).success).toBe(true)
  })
})

describe('loginErrorMessage', () => {
  it('401이면 자격 증명 불일치 문구를 준다', () => {
    const message = loginErrorMessage({ status: 401 })

    expect(message).toContain('이메일 또는 비밀번호가 맞지 않아요')
    expect(message).toContain('GitHub 로그인')
  })

  it('429면 로그인 제한 문구를 준다', () => {
    const message = loginErrorMessage({ status: 429 })

    expect(message).toContain('로그인 시도가 너무 많아요')
    expect(message).toContain('5분')
  })

  it('401과 429 문구는 서로 다르다', () => {
    expect(loginErrorMessage({ status: 401 })).not.toBe(loginErrorMessage({ status: 429 }))
  })

  it('그 밖의 오류는 일반 문구로 떨어진다', () => {
    const message = loginErrorMessage({ status: 500 })

    expect(message).not.toContain('이메일 또는 비밀번호가 맞지 않아요')
    expect(message).not.toContain('로그인 시도가 너무 많아요')
    expect(message.length).toBeGreaterThan(0)
  })

  it('모양을 알 수 없는 값도 문구를 준다', () => {
    expect(loginErrorMessage(new Error('network')).length).toBeGreaterThan(0)
  })
})

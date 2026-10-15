import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import { MOCK_CODE, resetEmailCodes } from '@/mocks/fixtures/emailCodes'
import { mockAccounts } from '@/mocks/fixtures/users'
import { server } from '@/mocks/server'
import { problemCode } from './problemCode'
import { checkNickname, sendSignupCode, signUp, verifySignupCode } from './signupQuery'

afterEach(() => resetEmailCodes())

const GOOD = { nickname: '새사람', password: 'Codari!test1', passwordConfirm: 'Codari!test1' }

async function verificationTokenFor(email = 'new@codari.test') {
  await sendSignupCode(email)
  return verifySignupCode({ email, code: MOCK_CODE })
}

describe('sendSignupCode', () => {
  it('204면 조용히 끝난다', async () => {
    await expect(sendSignupCode('new@codari.test')).resolves.toBeUndefined()
  })

  it('실패하면 code를 실어 던진다', async () => {
    // 화면이 이 code로 [로그인하러 가기]를 붙일지 가른다.
    await expect(sendSignupCode(mockAccounts[0]!.email)).rejects.toMatchObject({
      code: 'EMAIL_TAKEN',
      status: 409,
    })
  })

  it('본문에 status가 없어도 HTTP 상태를 싣는다', async () => {
    // RFC 9457의 멤버는 모두 선택이다. status가 빠져 오면 화면 분기가 상태를 못 본다.
    server.use(
      http.post('*/api/auth/signup/email-code', () =>
        HttpResponse.json(
          { code: 'EMAIL_TAKEN', detail: '이미 가입된 이메일이에요' },
          { status: 409 },
        ),
      ),
    )
    await expect(sendSignupCode('x@codari.test')).rejects.toMatchObject({ status: 409 })
  })
})

describe('verifySignupCode', () => {
  it('토큰을 돌려준다', async () => {
    await sendSignupCode('new@codari.test')
    await expect(verifySignupCode({ email: 'new@codari.test', code: MOCK_CODE })).resolves.toMatch(
      /.+/,
    )
  })

  it('틀리면 CODE_MISMATCH를 던진다', async () => {
    await sendSignupCode('new@codari.test')
    const error = await verifySignupCode({ email: 'new@codari.test', code: '000000' }).catch(
      (e: unknown) => e,
    )
    expect(problemCode(error)).toBe('CODE_MISMATCH')
  })
})

describe('checkNickname', () => {
  it('쓸 수 있으면 true, 아니면 false다', async () => {
    await expect(checkNickname('빈닉네임')).resolves.toBe(true)
    await expect(checkNickname(mockAccounts[0]!.user.nickname)).resolves.toBe(false)
  })

  it('규칙에 안 맞으면 던진다 (false가 아니다)', async () => {
    // false로 뭉개면 화면이 "이미 사용 중"이라고 거짓말한다. 서버는 400 INVALID_NICKNAME을 준다.
    const error = await checkNickname('가').catch((e: unknown) => e)
    expect(problemCode(error)).toBe('INVALID_NICKNAME')
  })
})

describe('signUp', () => {
  it('204면 조용히 끝난다', async () => {
    const verificationToken = await verificationTokenFor()
    await expect(signUp({ verificationToken, ...GOOD })).resolves.toBeUndefined()
  })

  it('가입에 성공한 뒤 같은 토큰으로 또 보내면 EMAIL_TAKEN이다', async () => {
    // 제출 버튼을 두 번 누른 경우다. 증명서는 30분 동안 살아 있으므로(서버가 JWT를 소비하지 않는다)
    // 두 번째 요청은 "증명서 만료"가 아니라 "이미 가입된 이메일"로 돌아온다 — 가입에 성공한
    // 사람에게 실패 문구가 뜬다. 화면이 제출 중 버튼을 끄는 이유다.
    const verificationToken = await verificationTokenFor()
    await signUp({ verificationToken, ...GOOD })

    const error = await signUp({ verificationToken, ...GOOD }).catch((e: unknown) => e)
    expect(problemCode(error)).toBe('EMAIL_TAKEN')
    expect(error).toMatchObject({ status: 409 })
  })

  it('필드 오류로 거부된 뒤 같은 토큰으로 다시 보내면 가입된다', async () => {
    // 비밀번호 규칙을 어겨 400을 받은 뒤, 고쳐서 같은 증명서로 다시 보낸다. 서버는 증명서를
    // 소비하지 않으므로 이게 되어야 한다 (계약: "증명서가 유효한 동안 닉네임만 다시 입력").
    const verificationToken = await verificationTokenFor()

    const error = await signUp({
      verificationToken,
      ...GOOD,
      password: 'short',
      passwordConfirm: 'short',
    }).catch((e: unknown) => e)
    expect(problemCode(error)).toBe('INVALID_PASSWORD')

    await expect(signUp({ verificationToken, ...GOOD })).resolves.toBeUndefined()
  })
})

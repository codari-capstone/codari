import { afterEach, describe, expect, it } from 'vitest'

import { MOCK_CODE, resetEmailCodes } from '@/mocks/fixtures/emailCodes'
import { mockAccounts } from '@/mocks/fixtures/users'
import { resetPassword, sendResetCode, verifyResetCode } from './passwordResetQuery'
import { problemCode } from './problemCode'

afterEach(() => resetEmailCodes())

const email = mockAccounts[0]!.email
const NEW = { password: 'Codari!new12', passwordConfirm: 'Codari!new12' }

async function resetTokenFor() {
  await sendResetCode(email)
  return verifyResetCode({ email, code: MOCK_CODE })
}

describe('sendResetCode', () => {
  it('204면 조용히 끝난다', async () => {
    await expect(sendResetCode(email)).resolves.toBeUndefined()
  })

  it('가입되지 않은 이메일은 EMAIL_NOT_FOUND다', async () => {
    await expect(sendResetCode('nobody@codari.test')).rejects.toMatchObject({
      code: 'EMAIL_NOT_FOUND',
      status: 404,
    })
  })
})

describe('verifyResetCode', () => {
  it('토큰을 돌려준다', async () => {
    await sendResetCode(email)
    await expect(verifyResetCode({ email, code: MOCK_CODE })).resolves.toMatch(/.+/)
  })

  it('틀리면 CODE_MISMATCH를 던진다', async () => {
    await sendResetCode(email)
    const error = await verifyResetCode({ email, code: '000000' }).catch((e: unknown) => e)
    expect(problemCode(error)).toBe('CODE_MISMATCH')
  })
})

describe('resetPassword', () => {
  it('204면 조용히 끝난다', async () => {
    const resetToken = await resetTokenFor()
    await expect(resetPassword({ resetToken, ...NEW })).resolves.toBeUndefined()
  })

  it('재설정은 토큰을 한 번만 받는다', async () => {
    // 서버는 성공하면 token_version을 올려 같은 토큰을 쓸 수 없게 만든다.
    const resetToken = await resetTokenFor()
    const body = { resetToken, ...NEW }

    await expect(resetPassword(body)).resolves.toBeUndefined()
    await expect(resetPassword(body)).rejects.toMatchObject({ code: 'RESET_EXPIRED' })
  })

  it('필드 오류로 거부된 뒤 같은 토큰으로 다시 보내면 재설정된다', async () => {
    // 실패한 시도는 토큰을 닳게 하지 않는다. 고쳐서 다시 보낼 수 있어야 화면이 막히지 않는다.
    const resetToken = await resetTokenFor()

    const error = await resetPassword({
      resetToken,
      password: 'short',
      passwordConfirm: 'short',
    }).catch((e: unknown) => e)
    expect(problemCode(error)).toBe('INVALID_PASSWORD')

    await expect(resetPassword({ resetToken, ...NEW })).resolves.toBeUndefined()
  })
})

import { api } from '@/api/client'
import { fail } from '@/api/fail'

/** 비밀번호 재설정 호출 (COM-08). 경로와 본문은 contracts/openapi.yaml이 정한다. */

/** 인증번호 발송. 일반 가입 계정에만 보낸다 — 가입되지 않은 이메일은 404다. */
export async function sendResetCode(email: string): Promise<void> {
  const result = await api.POST('/api/auth/password-reset/email-code', { body: { email } })
  if (!result.response.ok) fail(result)
}

/** 인증번호 확인. 10분 동안 쓸 수 있는 재설정 증명서를 돌려준다. */
export async function verifyResetCode(input: { email: string; code: string }): Promise<string> {
  const result = await api.POST('/api/auth/password-reset/email-code/verify', { body: input })
  if (result.data === undefined) fail(result)
  return result.data.resetToken
}

/**
 * 새 비밀번호 설정. 성공하면 모든 기기에서 로그아웃된다(계약).
 *
 * 그 이메일에 걸린 로그인 잠금도 풀려서 새 비밀번호로 바로 로그인할 수 있다.
 */
export async function resetPassword(input: {
  resetToken: string
  password: string
  passwordConfirm: string
}): Promise<void> {
  const result = await api.POST('/api/auth/password-reset', { body: input })
  if (!result.response.ok) fail(result)
}

import { api } from '@/api/client'
import { fail } from '@/api/fail'

/**
 * 가입 호출 (COM-06). 경로와 본문 모양은 contracts/openapi.yaml이 정한다.
 *
 * 임시 계약(provisional.ts)이 아니라 생성 타입을 쓰는 첫 모듈이다. /api/me·로그인·로그아웃은
 * 세션 모델이 계약과 달라 아직 provisionalApi에 있다 (contracts/auth-proposal.md 2절).
 */

/** 인증번호 발송. 204라 돌려줄 본문이 없다. */
export async function sendSignupCode(email: string): Promise<void> {
  const result = await api.POST('/api/auth/signup/email-code', { body: { email } })
  if (!result.response.ok) fail(result)
}

/** 인증번호 확인. 30분 동안 쓸 수 있는 가입 증명서를 돌려준다. */
export async function verifySignupCode(input: { email: string; code: string }): Promise<string> {
  const result = await api.POST('/api/auth/signup/email-code/verify', { body: input })
  if (result.data === undefined) fail(result)
  return result.data.verificationToken
}

/**
 * 닉네임 중복 확인. 쓸 수 있으면 true다.
 *
 * 규칙에 맞지 않는 값은 400이고, 그것을 false로 뭉개지 않는다 — 화면이 '이미 사용 중'이라고
 * 거짓말하게 된다. 던지면 화면이 서버 detail('닉네임은 2~16자…')을 보여 준다.
 */
export async function checkNickname(nickname: string): Promise<boolean> {
  const result = await api.GET('/api/auth/nickname-availability', {
    params: { query: { nickname } },
  })
  if (result.data === undefined) fail(result)
  return result.data.available
}

/** 가입 완료. 로그인시키지 않는다 — 계약이 204만 주고 토큰을 주지 않는다. */
export async function signUp(input: {
  verificationToken: string
  nickname: string
  password: string
  passwordConfirm: string
}): Promise<void> {
  const result = await api.POST('/api/auth/signup', { body: input })
  if (!result.response.ok) fail(result)
}

/**
 * 목 인증번호 상태. 개발과 테스트에서만 쓰는 가짜 값이다.
 *
 * 목은 메일을 보내지 않으므로 번호가 고정이어야 흐름을 끝까지 밟을 수 있다.
 * 화면에 띄우지 않는다 — 띄우면 운영 빌드로 새어 나갈 길이 생긴다 (users.ts와 같은 규칙).
 *
 * 발송 제한(1분 간격·하루 5회·IP 20회)은 세지 않는다. 그것은 서버의 일이고, 목이 흉내내면
 * 테스트가 목의 규칙을 검사하게 된다. 429가 필요한 테스트는 server.use로 덮는다.
 */
export const MOCK_CODE = '123456'

/** 인증번호를 다섯 번 틀리면 무효가 된다 (계정 규칙). */
const MAX_ATTEMPTS = 5

export type CodePurpose = 'SIGNUP' | 'RESET'

interface CodeState {
  attempts: number
}

const sent = new Map<string, CodeState>()
/** 발급된 토큰 → 발급 대상. 계약대로 읽어도 닳지 않는다. 무효화는 재설정 성공에서만 한다. */
const issuedTokens = new Map<string, { purpose: CodePurpose; email: string }>()
/** 가입을 마친 이메일. 서버의 existsByEmail 자리다. mockAccounts는 건드리지 않는다. */
const signedUp = new Set<string>()
let tokenSeq = 0

function key(purpose: CodePurpose, email: string) {
  return `${purpose}:${email}`
}

export function markCodeSent(purpose: CodePurpose, email: string): void {
  sent.set(key(purpose, email), { attempts: 0 })
}

export type VerifyResult =
  | { ok: true; token: string }
  | { ok: false; code: 'CODE_EXPIRED' | 'CODE_MISMATCH' | 'CODE_ATTEMPTS_EXCEEDED' }

export function verifyMockCode(purpose: CodePurpose, email: string, code: string): VerifyResult {
  const state = sent.get(key(purpose, email))
  // 받은 적이 없으면 서버도 CODE_EXPIRED로 답한다(활성 번호가 없다).
  if (!state) return { ok: false, code: 'CODE_EXPIRED' }

  if (code !== MOCK_CODE) {
    state.attempts += 1
    if (state.attempts >= MAX_ATTEMPTS) {
      sent.delete(key(purpose, email))
      return { ok: false, code: 'CODE_ATTEMPTS_EXCEEDED' }
    }
    return { ok: false, code: 'CODE_MISMATCH' }
  }

  sent.delete(key(purpose, email))
  tokenSeq += 1
  const token = `mock-${purpose.toLowerCase()}-${tokenSeq}-${email}`
  issuedTokens.set(token, { purpose, email })
  return { ok: true, token }
}

/**
 * 토큰이 발급된 이메일. 읽어도 토큰은 닳지 않는다 — 계약이 두 흐름 모두 "값만 고쳐 같은
 * 토큰으로 다시 보낼 수 있다"고 적는다(가입 #108, 재설정 #106). 모르는 토큰이면 null.
 */
export function tokenEmail(token: unknown, purpose: CodePurpose): string | null {
  if (typeof token !== 'string') return null
  const issued = issuedTokens.get(token)
  return issued && issued.purpose === purpose ? issued.email : null
}

/** 재설정이 성공했을 때만 부른다. 서버는 token_version을 올려 같은 토큰을 0행 갱신으로 만든다. */
export function invalidateToken(token: string): void {
  issuedTokens.delete(token)
}

export function markSignedUp(email: string): void {
  signedUp.add(email)
}

export function isSignedUp(email: string): boolean {
  return signedUp.has(email)
}

/** 테스트 사이에 상태를 비운다. 남으면 앞 테스트의 시도 횟수가 다음 테스트에 이어진다. */
export function resetEmailCodes(): void {
  sent.clear()
  issuedTokens.clear()
  signedUp.clear()
}

import type { CurrentUser } from '@/api/types'

/**
 * refresh token 쿠키 이름. 계약의 `/api/auth/refresh`가 읽는 이름과 같다.
 *
 * 목도 계약과 같은 세션 모델을 쓴다 — access token은 응답 본문으로 주고 `Authorization`
 * 헤더로 받으며, 쿠키는 갱신에만 쓴다. 전에는 세션 쿠키 하나로 로그인 상태를 나타냈는데,
 * 그러면 **실서버에서만 깨지는 차이**가 남는다(그 파일에 "그날까지"라고 적어 둔 그날이다).
 */
export const REFRESH_COOKIE = 'refresh_token'

/**
 * access token을 사용자 번호로 만든다. 목에만 있는 규칙이다.
 *
 * 진짜 서버는 서명한 JWT를 주지만, 목이 검증할 것은 "누구인가"뿐이다. 토큰을 발급 번호로
 * 구분해 두는 이유는 갱신 테스트 때문이다 — 갱신 뒤 토큰이 **바뀌었는지**를 보려면 같은
 * 사용자라도 값이 달라야 한다.
 */
export function mockAccessToken(userId: number, issue = 1): string {
  return `mock-access.${userId}.${issue}`
}

/** 토큰에서 사용자 번호를 꺼낸다. 모르는 모양이면 null. */
export function userIdFromToken(token: string | undefined): number | null {
  if (token === undefined) return null
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'mock-access') return null
  const id = Number(parts[1])
  return Number.isSafeInteger(id) ? id : null
}

export interface MockAccount {
  email: string
  password: string
  user: CurrentUser
}

/**
 * 목 계정. 개발·테스트에서만 쓰는 가짜 값이다.
 *
 * 비밀번호는 docs/feature-spec.md '계정 규칙'의 비밀번호 규칙을 만족해야 한다.
 * 만족하지 않는 값을 두면 가입 폼(COM-06)을 만들 때 이 계정으로는 로그인은 되는데
 * 같은 비밀번호로 가입은 안 되는 모순이 생긴다.
 *
 * 화면에 안내로 띄우지 않는다. 띄우면 운영 빌드로 새어 나갈 길이 생긴다.
 */
export const mockAccounts: MockAccount[] = [
  {
    email: 'user@codari.test',
    password: 'Codari!test1',
    user: { id: 1, nickname: '코다리', role: 'USER' },
  },
  {
    email: 'admin@codari.test',
    password: 'Codari!admin1',
    user: { id: 2, nickname: '관리자', role: 'ADMIN' },
  },
]

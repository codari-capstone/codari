import type { AuthUser } from '@/api/provisional'

/**
 * 목 세션 쿠키 이름. 핸들러가 심고 핸들러가 읽는다.
 *
 * **이름만 바꿔서 실제 API에 붙일 수는 없다.** 계약(`contracts/openapi.yaml`)이 정한 것은
 * 다른 세션 모델이다 — access token은 응답 본문으로 받아 메모리에 두고 `Authorization`
 * 헤더로 보내고, 쿠키(`refresh_token`, `Path=/api/auth`)는 갱신에만 쓴다. 목은 서버가 심는
 * 세션 쿠키 하나로 로그인 상태를 나타내므로 구조가 다르다. 무엇이 달라지는지는
 * `contracts/auth-proposal.md` 2절과 6절에 있다.
 *
 * 그래도 이 상수를 두는 이유는, 그날까지 목의 쿠키 이름이 한 곳에만 적혀 있게 하는 것이다.
 * 핸들러와 테스트가 모두 이 값을 쓴다.
 */
export const SESSION_COOKIE = 'codari_session'

export interface MockAccount {
  email: string
  password: string
  user: AuthUser
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

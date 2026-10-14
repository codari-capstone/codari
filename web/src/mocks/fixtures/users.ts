import type { AuthUser } from '@/api/provisional'

/**
 * 목 세션 쿠키 이름. 핸들러가 심고 핸들러가 읽는다.
 *
 * 실제 서버가 쓸 이름은 #24에서 정해진다. 그때 이 상수만 바꾸면 되도록
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
 * 만족하지 않는 값을 두면 2차에서 가입 폼을 만들 때 이 계정으로는 로그인은 되는데
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

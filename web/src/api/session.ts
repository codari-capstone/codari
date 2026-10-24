/**
 * access token 보관 (COM-04).
 *
 * **메모리에만 둔다.** localStorage나 쿠키에 두면 XSS 하나로 샌다 — 지문·에러 원문처럼
 * 남이 쓴 글자를 그리는 화면이 여럿이라 그 위험을 감수할 이유가 없다.
 *
 * 새로고침하면 사라지지만 잃을 것이 없다. refresh token은 서버가 쿠키로 들고 있어
 * (`/api/auth/refresh`의 `in: cookie`) 첫 401에서 새 access token을 받아 온다. 저장해 두는
 * 쪽이 오히려 "만료된 토큰으로 한 번 더 시도"라는 경로를 만든다.
 *
 * 모듈 변수 하나인 이유는 이 값이 요청마다 읽히기 때문이다. React state에 두면 fetch를
 * 부르는 자리마다 훅을 거쳐야 하고, 미들웨어(client.ts)에서는 훅을 쓸 수 없다.
 */
let accessToken: string | null = null

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string | null): void {
  accessToken = token
}

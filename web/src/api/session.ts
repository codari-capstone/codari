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
 * 모듈 변수인 이유는 이 값이 요청마다 읽히기 때문이다. React state에 두면 fetch를
 * 부르는 자리마다 훅을 거쳐야 하고, 미들웨어(client.ts)에서는 훅을 쓸 수 없다.
 */
let accessToken: string | null = null

/**
 * 세션 세대. 로그아웃할 때마다 올라간다.
 *
 * 갱신 요청이 떠 있는 동안 로그아웃하면, 늦게 도착한 응답이 방금 버린 세션의 토큰을 다시
 * 심는다 — 서버의 로그아웃은 refresh 계열만 폐기하고 **이미 발급된 access token은 만료까지
 * 유효**해서, 그 탭은 로그아웃 직후 다시 인증된 상태가 된다. 갱신을 시작할 때 세대를 적어
 * 두었다가 돌아왔을 때 달라졌으면 결과를 버린다.
 */
let generation = 0

export function getAccessToken(): string | null {
  return accessToken
}

export function getGeneration(): number {
  return generation
}

export function setAccessToken(token: string | null): void {
  accessToken = token
}

/** 다른 탭이 로그아웃했음을 알리는 통로. 지원하지 않는 브라우저에서는 null. */
const channel =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('codingmon-session')

/**
 * 세션을 끝낸다 (COM-03).
 *
 * 토큰을 버리고 세대를 올린다. 세대를 올리는 이유는 위 주석에 있다.
 *
 * **다른 탭에도 알린다.** 전에는 쿠키 세션이라 탭끼리 함께 끊겼는데, access token이
 * 탭마다의 메모리에 있어 한 탭에서 로그아웃해도 다른 탭은 만료될 때까지 인증 요청이
 * 계속 성공한다 — 공용 컴퓨터에서 위험하다. 토큰만 버린다. 그 탭의 화면은 다음 요청이
 * 401을 받을 때 로그인 화면으로 간다(RequireAuth).
 */
export function endSession(): void {
  accessToken = null
  generation += 1
  channel?.postMessage('ended')
}

channel?.addEventListener('message', () => {
  // 알린 탭이 아니라 받은 탭에서 도는 자리다. 다시 알리지 않는다(서로 알리면 고리가 된다).
  accessToken = null
  generation += 1
})

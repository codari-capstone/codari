import { api } from '@/api/client'
import { fail } from '@/api/fail'
import { refreshAccessToken } from '@/api/refresh'
import { getAccessToken, setAccessToken } from '@/api/session'
import type { CurrentUser } from '@/api/types'

/** 시작 주소. 계약이 "브라우저를 이 주소로 이동시킨다(fetch가 아님)"고 적는다. */
const START_PATH = '/api/auth/github'

/**
 * 돌아갈 주소를 적어 두는 자리.
 *
 * 라우터 state를 쓸 수 없다 — SPA를 **완전히 떠나** GitHub까지 갔다가 새 문서로 돌아오므로
 * 메모리에 있던 것은 다 사라진다. 같은 탭의 왕복 한 번만 살아남으면 되니 sessionStorage다.
 */
const FROM_KEY = 'github-login:from'

/**
 * GitHub 로그인 시작 (COM-02).
 *
 * **찔러보지 않고 바로 이동한다.** 계약은 설정이 없는 서버가 503 `GITHUB_UNAVAILABLE`을
 * 주도록 했는데, 그 조건은 `GITHUB_CLIENT_ID`·`SECRET`이 있나 없나뿐이다
 * (GitHubLoginController.start) — 사용자별·일시적 조건이 아니라 배포 전체가 가지는 고정
 * 성질이라, 설정이 있으면 영원히 안 나고 없으면 모두에게 항상 난다. 미리 fetch로 확인하면
 * 정상 서버에서 매 클릭마다 요청 한 번과 state 한 개를 버리는 값을 치르고, 막는 상황은
 * "배포가 잘못됐다" 하나다. 그 경우엔 날것 JSON이 보이고 즉시 드러난다.
 *
 * 한 번만 보내면서 503을 잡을 길은 지금 계약에 없다 — 브라우저 이동의 응답 본문은 SPA로
 * 돌아오지 않고, fetch로는 브라우저를 이동시킬 수 없다. 올바른 자리는 서버다: start가
 * 503 대신 `/login/github?result=error`로 보내면 이 흐름의 다른 모든 실패와 같은 길을 탄다.
 */
export function startGitHubLogin(from: string): void {
  rememberGitHubReturn(from)
  // 이 한 줄은 단위 테스트가 볼 수 없다 — jsdom은 이동을 구현하지 않고, location.assign은
  // 바꿔 끼울 수도 없다(non-configurable). e2e가 누른 뒤 주소로 확인한다.
  window.location.assign(START_PATH)
}

/**
 * 돌아갈 주소를 적어 둔다.
 *
 * 이동과 따로 두는 이유: 이동은 jsdom에서 확인할 수 없는데 이쪽은 저장이 막힌 경우까지
 * 봐야 한다. 둘을 한 함수에 두면 그 검사를 콘솔 잡음과 맞바꿔야 한다.
 */
export function rememberGitHubReturn(from: string): void {
  try {
    sessionStorage.setItem(FROM_KEY, from)
  } catch {
    // 사생활 보호 모드처럼 저장이 막힌 경우다. 돌아올 때 /problems로 떨어진다 — 로그인
    // 자체를 막을 이유는 아니다.
  }
}

/**
 * 적어 둔 돌아갈 주소. 한 번 쓰면 지운다.
 *
 * 지우는 이유: 남겨 두면 다음에 다른 화면에서 GitHub 로그인을 시작했다가 실패한 뒤에도
 * 옛 주소로 끌려간다. 값은 믿지 않는다 — 돌아간 화면이 safeRedirect로 검사한다.
 */
export function takeGitHubReturnPath(): string | null {
  try {
    const from = sessionStorage.getItem(FROM_KEY)
    sessionStorage.removeItem(FROM_KEY)
    return from
  } catch {
    return null
  }
}

/**
 * 이미 가입한 GitHub 계정이라 로그인된 상태로 돌아왔다 (`result=success`).
 *
 * 콜백은 refresh 쿠키만 심어 주고 access token은 주지 않는다(계약: "웹은 돌아온 뒤
 * `/api/auth/refresh`로 access token을 받는다"). 그래서 이메일 로그인과 달리 갱신이
 * 첫 걸음이다. 그 뒤는 같다 — 닉네임은 토큰이 아니라 `/api/users/me`로 받는다.
 */
export async function resumeGitHubSession(): Promise<CurrentUser> {
  const token = await refreshAccessToken(getAccessToken())
  // 쿠키가 없거나 이미 폐기됐다. 성공이라고 돌아왔지만 세션이 없다.
  if (token === null) throw new Error('GITHUB_SESSION_MISSING')

  const me = await api.GET('/api/users/me')
  if (me.data === undefined) {
    // 방금 받은 토큰으로 자기 정보를 못 받는 경우다. 반쪽 세션을 남기지 않는다 (authQuery).
    setAccessToken(null)
    fail(me)
  }
  return me.data
}

/**
 * GitHub 가입 완료 (COM-02). 204라 돌려줄 본문이 없다.
 *
 * 로그인시키지 않는다 — 계약이 "로그인시키지 않으므로 웹은 로그인 화면으로 보낸다"고
 * 적는다. 이메일 가입(COM-06)과 같다. 증명서는 콜백이 심은 쿠키라 본문에 실을 것이 없다.
 */
export async function gitHubSignUp(nickname: string): Promise<void> {
  const result = await api.POST('/api/auth/github/signup', { body: { nickname } })
  if (!result.response.ok) fail(result)
}

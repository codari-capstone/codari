import { getAccessToken, getGeneration, setAccessToken } from './session'

/** 갱신 요청이 쓰는 잠금 이름. 탭끼리 공유된다. */
const LOCK_NAME = 'codingmon-auth-refresh'

/**
 * access token을 새로 받는다. 성공하면 새 토큰, 실패하면 null.
 *
 * refresh token은 쿠키라 본문에 실을 것이 없다(계약의 `in: cookie`). 그래서 생성된
 * 클라이언트를 거치지 않고 `fetch`를 직접 부른다 — 그 클라이언트의 미들웨어가 401에서
 * 다시 이 함수를 부르면 서로를 부르는 고리가 된다.
 */
async function requestNewToken(): Promise<string | null> {
  try {
    const response = await fetch(`${window.location.origin}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'same-origin',
    })
    if (!response.ok) return null
    const body = (await response.json()) as { accessToken?: unknown }
    return typeof body.accessToken === 'string' ? body.accessToken : null
  } catch {
    // 네트워크가 끊긴 경우다. 세션이 끝난 것과 구분할 길이 없으니 실패로 본다.
    return null
  }
}

/**
 * 토큰을 갱신한다 (COM-04). 탭끼리 한 번에 하나씩 한다.
 *
 * **계약이 Web Locks를 쓰라고 적어 두었다**: "프런트는 탭끼리 갱신을 한 번에 하나씩
 * 한다(Web Locks `navigator.locks.request`). 앞 탭의 응답으로 쿠키가 바뀐 뒤 다음 탭이
 * 요청하므로, 같은 토큰을 동시에 보내 401을 받는 일이 없다."
 *
 * 지키지 않으면 탭 둘이 같은 refresh token을 보낸다. 서버는 바뀐 지 10초 안의 재사용은
 * 401만 주지만, 그보다 오래됐으면 **탈취로 보고 같은 로그인의 토큰을 모두 폐기한다** —
 * 두 탭이 다 로그아웃된다.
 *
 * `navigator.locks`가 없는 브라우저에서는 잠금 없이 진행한다. 탭 경합은 남지만, 갱신을
 * 아예 못 하는 것보다는 낫다.
 *
 * @param used 401을 받은 요청이 **실제로 보낸** 토큰. 이 값이 기준이다.
 *
 * 처음에는 함수를 부른 시점의 토큰과 비교했는데 틀렸다. 만료 토큰 T0으로 동시에 나간
 * 요청 중 하나가 T1로 갱신한 뒤 느린 쪽의 401이 도착하면, 그 시점의 "현재 토큰"은 이미
 * T1이라 "바뀐 것이 없다"로 읽혀 한 번 더 갱신했다. 보낸 토큰과 비교하면 그 요청이 **낡은
 * 토큰으로 실패했다**는 사실이 그대로 드러난다.
 */
export async function refreshAccessToken(used: string | null): Promise<string | null> {
  const run = async (): Promise<string | null> => {
    // 그사이 다른 요청이 이미 새 토큰을 받아 왔다. 그것을 쓴다.
    // 세션이 끝나 null이 된 경우도 여기서 걸러져, 나머지 401들이 각자 갱신을 또
    // 요청하지 않는다(그러면 실패 요청이 401 개수만큼 나간다).
    const current = getAccessToken()
    if (current !== used) return current

    const startedAt = getGeneration()
    const token = await requestNewToken()

    // 기다리는 동안 로그아웃했다. 방금 버린 세션의 토큰을 되살리지 않는다 (session.ts).
    if (getGeneration() !== startedAt) return null

    if (token === null) {
      // 실패했어도 그사이 다른 경로(로그인 등)가 유효한 토큰을 심었으면 지우지 않는다.
      if (getAccessToken() === used) setAccessToken(null)
      return null
    }
    setAccessToken(token)
    return token
  }

  if (typeof navigator === 'undefined' || navigator.locks === undefined) return run()
  return navigator.locks.request(LOCK_NAME, run)
}

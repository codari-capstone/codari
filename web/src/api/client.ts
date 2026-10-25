import createClient, { type ClientOptions, type Middleware } from 'openapi-fetch'

import { refreshAccessToken } from './refresh'
import type { paths } from './schema'
import { getAccessToken } from './session'

/**
 * 클라이언트 설정.
 *
 * baseUrl을 현재 origin으로 두는 이유: 개발에서는 Vite 프록시가, 운영에서는 ALB가
 * /api 요청을 Spring Boot로 넘긴다. 화면과 API가 같은 도메인이라 쿠키·CORS 설정이 단순하다.
 *
 * `credentials: 'same-origin'`은 refresh token 쿠키 때문에 필요하다 — access token은
 * 헤더로 보내지만 갱신은 쿠키로 한다(계약).
 *
 * '/' 같은 상대 경로를 쓰면 안 된다. openapi-fetch가 fetch 전에 new Request()를
 * 만드는데 Node의 Request는 상대 URL을 받지 않아, jsdom 테스트에서
 * "Failed to parse URL from /api/..."로 실패한다.
 */
export const clientOptions: ClientOptions = {
  baseUrl: window.location.origin,
  credentials: 'same-origin',

  // fetch를 호출 시점에 해석한다. openapi-fetch는 기본적으로 생성 시점의
  // globalThis.fetch를 붙잡는데, 이 모듈은 테스트의 beforeAll보다 먼저 평가되므로
  // MSW가 globalThis.fetch를 교체하기 전의 원본을 쥐게 된다. 그러면 컴포넌트
  // 테스트가 MSW 핸들러에 닿지 못하고 실제 네트워크로 나간다.
  // 브라우저에서는 MSW가 서비스 워커로 가로채므로 동작 차이가 없다.
  fetch: (request) => globalThis.fetch(request),
}

/**
 * 모든 API 호출은 이 클라이언트를 거친다. 경로·파라미터·응답 타입이
 * OpenAPI 명세에서 생성한 타입으로 자동 검사된다.
 *
 * 타입은 contracts/openapi.yaml에서 생성한다(schema.d.ts의 paths). 손으로 쓴 임시 계약은
 * COM-04로 세션 모델을 계약에 맞추면서 사라졌다 — 이제 모든 호출이 이 하나를 거친다.
 */
export const api = createClient<paths>(clientOptions)

/**
 * 토큰을 붙이지도, 갱신하지도 않는 경로.
 *
 * `/api/auth/*`는 전부 비로그인으로 쓰는 곳이다(로그인·가입·재설정·GitHub·갱신). 서버의
 * Bearer 필터는 permitAll 경로에서도 **무효 토큰이면 401로 막으므로**, 만료된 토큰을 들고
 * 있는 채로 로그아웃을 누르면 logout 401 → 갱신 → logout 재시도로 왕복이 세 번 생기고
 * refresh 쿠키가 한 번 더 회전한다. 로그인은 더 나쁘다 — 갱신 대상도 아니라서, 비밀번호가
 * 맞아도 만료 토큰 때문에 받은 401이 그대로 '로그인 실패'로 보인다.
 *
 * 갱신을 거는 쪽에서도 같은 판단이다. 갱신 자체의 401로 또 갱신하면 고리가 된다.
 */
function isPublicAuthPath(url: string): boolean {
  return new URL(url).pathname.startsWith('/api/auth/')
}

/**
 * 재시도에 쓸 요청 사본과 그때 보낸 토큰. 요청 id로 찾는다.
 *
 * 응답을 받은 뒤의 `request`는 본문을 이미 흘려보낸 뒤라 `new Request(request)`가
 * 던진다("body already read") — GET은 괜찮지만 제출 같은 POST가 깨진다. 보내기 전에
 * 떠 둔 사본이 있어야 같은 본문을 한 번 더 보낼 수 있다.
 *
 * 응답이 오든 실패하든 바로 지운다. onResponse에서만 지웠더니 네트워크 오류나 abort로
 * fetch가 던질 때 사본이 남아, API에 닿지 못하는 동안 제출 본문까지 든 Request가 쌓였다.
 */
const pending = new Map<string, { request: Request; token: string | null }>()

/**
 * 세션 미들웨어 (COM-04).
 *
 * 호출부마다 토큰을 붙이고 401을 처리하는 대신 한 곳에 둔다 — 빠뜨린 호출부에서만
 * 로그아웃되는 버그는 찾기 어렵다.
 *
 * 401을 받으면 **한 번만** 갱신하고 원래 요청을 다시 보낸다. 재시도한 요청의 응답은
 * 이 미들웨어를 다시 거치지 않으므로(우리가 직접 fetch를 부른다) 고리가 생기지 않는다.
 * 갱신이 실패하면 원래의 401을 그대로 내보내고, 그 401을 받은 쪽이 세션을 버려 로그인
 * 화면으로 간다(features/auth/session.ts).
 */
const sessionMiddleware: Middleware = {
  onRequest({ request, id }) {
    if (isPublicAuthPath(request.url)) return request

    const token = getAccessToken()
    if (token !== null) request.headers.set('Authorization', `Bearer ${token}`)
    pending.set(id, { request: request.clone(), token })
    return request
  },

  async onResponse({ response, id }) {
    const original = pending.get(id)
    pending.delete(id)
    if (response.status !== 401 || original === undefined) return response

    const token = await refreshAccessToken(original.token)
    if (token === null) return response

    original.request.headers.set('Authorization', `Bearer ${token}`)
    return clientOptions.fetch!(original.request)
  },

  // fetch가 던지면 onResponse가 불리지 않는다. 사본을 여기서도 치운다.
  onError({ id }) {
    pending.delete(id)
  },
}

api.use(sessionMiddleware)

/**
 * 보관 중인 요청 사본 수. **테스트만 쓴다.**
 *
 * 사본이 쌓이는 것은 화면에 드러나지 않아 동작으로는 잴 수 없다 — 지우는 곳이 둘(응답과
 * 오류)이라는 것을 붙들어 두려면 이 값을 직접 보는 수밖에 없다. 읽기만 하는 통로라
 * 밖에서 상태를 바꿀 수는 없다.
 */
export function pendingRequestCount(): number {
  return pending.size
}

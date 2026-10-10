import createClient, { type ClientOptions } from 'openapi-fetch'

import type { paths } from './schema'

/**
 * 두 클라이언트가 공유하는 설정. 명세 확정 전까지는 api(빈 paths)와
 * provisionalApi(손으로 쓴 paths)가 공존하므로, 설정을 복사해 두면 반드시 갈라진다.
 *
 * baseUrl을 현재 origin으로 두는 이유: 개발에서는 Vite 프록시가, 운영에서는 ALB가
 * /api 요청을 Spring Boot로 넘긴다. 화면과 API가 같은 도메인이라 쿠키·CORS 설정이 단순하다.
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
 * 명세(#2)가 아직 없어 paths가 비어 있다. 그동안의 호출은 provisionalApi를 쓴다.
 */
export const api = createClient<paths>(clientOptions)

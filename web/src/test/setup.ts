import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'

import { server } from '@/mocks/server'

/**
 * findBy·waitFor의 기본 제한 1초는 전체 스위트에서 모자라다.
 *
 * vite.config.ts의 testTimeout과 **다른 값이다** — 그쪽은 테스트 하나 전체의 제한이고,
 * 이건 단언 하나가 기다리는 시간이다. 그래서 15초를 줘도 1.3초쯤에 findBy가 먼저 포기해
 * 파일 56개를 함께 돌릴 때마다 **매번 다른 테스트가** 깨졌다(실패 시점이 모두 1.3~1.6초로
 * 같은 것이 단서였다). 파일을 더할 때마다 다른 사람이 같은 함정을 다시 밟지 않게 한 자리에서
 * 정한다.
 */
configure({ asyncUtilTimeout: 5000 })

// 브라우저와 같은 MSW handlers를 테스트에서도 재사용한다.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

afterEach(() => {
  cleanup()
  server.resetHandlers()
})

afterAll(() => server.close())

// jsdom에는 scrollTo가 없어 호출마다 'Not implemented' 오류를 콘솔에 찍는다. 페이지를
// 넘기는 테스트가 그걸로 로그를 덮어 실제 회귀를 가린다. 아무것도 하지 않는 함수로 둔다.
window.scrollTo = () => {}

/**
 * jsdom은 `Range`의 레이아웃 측정을 구현하지 않는다 (`Element` 쪽은 있다).
 *
 * CodeMirror가 `requestAnimationFrame` 안에서 글자 크기를 재며 이걸 부른다. 없으면
 * `TypeError`가 테스트 밖으로 터져, 단언은 전부 통과하는데 vitest가 Unhandled Error로
 * 실행을 실패시킨다. rAF가 테스트 종료 전에 도느냐에 달려 있어 로컬에서는 통과하고
 * CI에서만 터졌다 — 빠진 것을 메우지 않으면 다시 조용히 돌아온다.
 *
 * 0을 돌려준다. jsdom에는 레이아웃이 없어 어떤 값을 주든 거짓이고, CodeMirror는
 * 측정값이 0이면 기본값으로 그린다. 치수를 보는 테스트는 e2e가 맡는다.
 */
Range.prototype.getClientRects = () => [] as unknown as DOMRectList
Range.prototype.getBoundingClientRect = () => new DOMRect()

// jsdom에는 matchMedia가 없다. 테마 초기값 조회가 던지지 않게 기본값(라이트)을 준다.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

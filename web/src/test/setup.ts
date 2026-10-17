import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'

import { server } from '@/mocks/server'

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

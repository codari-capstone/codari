import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // 개발 중에도 화면과 API가 같은 주소로 보이게 해 CORS·쿠키 문제를 피한다.
    // 운영의 ALB 경로 라우팅(/api/* -> API 서버)과 같은 구조다.
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    // e2e는 Playwright가 맡는다
    exclude: ['e2e/**', 'node_modules/**'],
    /**
     * 기본값 5초로는 모자라다.
     *
     * 화면 하나를 그리고 응답을 붙잡아 두는 테스트는 혼자 돌면 1~1.5초인데, 전체
     * 스위트(파일 55개, 격리 때문에 파일마다 워커를 띄운다)와 함께 돌면 3배가 넘는다.
     * 그래서 테스트 파일을 더할 때마다 **5초에 가까운 다른 테스트가 깨졌다** —
     * responsiveSubmit과 SignupPage가 차례로 그랬다.
     *
     * 파일마다 `}, 15_000)`을 붙이면 다음 사람이 같은 함정을 다시 밟는다. 제한은 느린
     * 테스트를 숨기려는 게 아니라 멈춘 테스트를 잡으려는 것이니, 한 곳에서 넉넉히 둔다.
     */
    testTimeout: 15_000,
  },
})

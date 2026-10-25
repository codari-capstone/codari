import { expect, test } from '@playwright/test'

import { login } from './login.js'

/**
 * 세션 유지 (COM-04).
 *
 * 토큰을 강제로 만료시키는 대신 **새로고침**을 쓴다. access token은 메모리에만 있어
 * (api/session.ts) 새로고침하면 사라지고, 남은 것은 refresh 쿠키뿐이다 — 토큰 없이 시작해
 * 401을 받고 갱신해서 이어 가는 경로가 그대로 돌아간다.
 *
 * 목 모드에서는 여기까지가 한계다. Playwright의 `page.route`로 401을 꾸며 넣을 수 없고
 * (MSW가 서비스 워커에서 가로채 네트워크까지 가지 않는다), `context.clearCookies()`로
 * refresh 쿠키를 지울 수도 없다(MSW가 쿠키를 자기 항아리에 둔다). 그래서 "갱신도 실패하면
 * 로그인 화면으로" 쪽은 단위 테스트가 본다(api/refresh.test.ts, RequireAuth.test.tsx).
 */
test.describe('세션 유지', () => {
  test('새로고침해도 로그인 상태가 이어진다', async ({ page }) => {
    await login(page)
    await page.goto('/problems/1')
    await expect(page.getByRole('heading', { level: 1, name: '두 수의 합' })).toBeVisible()

    // 메모리의 access token이 사라진다. 쿠키로 되살리지 못하면 로그인 화면으로 밀려난다.
    await page.reload()

    await expect(page.getByRole('heading', { level: 1, name: '두 수의 합' })).toBeVisible()
    await expect(page).toHaveURL(/\/problems\/1/)
  })
})

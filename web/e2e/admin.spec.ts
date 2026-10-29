import { expect, test } from '@playwright/test'

import { ADMIN, login } from './login.js'

/**
 * 관리자 문제 관리 목록 (ADM-01).
 *
 * 단위 테스트가 상태 문구를 경우마다 재므로 여기서는 실제 브라우저에서만 드러나는 것을
 * 본다 — lazy 라우트가 /admin에서 실제로 받아지는지, 검색 디바운스가 진짜 시간으로
 * 도는지다.
 */
test('관리자 목록에 상태와 버전이 보이고 검색이 걸러진다', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/admin')

  await expect(page.getByRole('heading', { level: 1, name: '문제 관리' })).toBeVisible()
  await expect(page.getByRole('row', { name: /두 수의 합/ })).toContainText('공개')

  // 공개 버전 위에 초안이 있는 문제. 응답에는 이 문구가 없고 화면이 두 값으로 만든다.
  await expect(page.getByRole('row', { name: /연습 문제 9/ })).toContainText('공개 v1 · 수정 중')

  await page.getByLabel('제목으로 검색').fill('두')

  await expect(page.getByText('조건에 맞는 문제 1개')).toBeVisible()
  await expect(page.getByRole('row')).toHaveCount(2) // 머리 1 + 1
})

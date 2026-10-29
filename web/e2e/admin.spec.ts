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

/**
 * 문제 등록·수정 (ADM-02·03·07).
 *
 * 단위 테스트가 저장 분기와 문구를 경우마다 재므로, 여기서는 브라우저에서만 드러나는
 * 것을 본다 — 목록에서 폼까지 lazy 라우트가 이어지는지, 숨은 탭에 둔 값이 실제 제출에
 * 실려 가는지, Markdown 미리보기가 정말 그려지는지다.
 */
test('목록에서 문제를 열어 지문을 고치면 공개 중인 버전에 반영된다', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/admin')

  await page.getByRole('link', { name: '두 수의 합' }).click()

  await expect(page.getByRole('heading', { level: 1, name: '문제 수정' })).toBeVisible()
  await expect(page.getByLabel('제목')).toHaveValue('두 수의 합')

  await page.getByRole('tab', { name: '지문' }).click()
  await page.getByRole('textbox', { name: '지문' }).fill('# 고친 지문\n\n$O(n)$에 풀린다.')

  // 미리보기는 사용자 화면과 같은 컴포넌트다. KaTeX가 실제로 수식을 그리는지 본다.
  const preview = page.locator('.katex')
  await expect(preview.first()).toBeVisible()

  await page.getByRole('button', { name: '저장' }).click()

  await expect(page.getByRole('status')).toContainText('공개 중인 v1')
})

test('새 문제를 등록하면 초안으로 목록에 들어간다', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/admin')

  await page.getByRole('link', { name: '새 문제' }).click()

  // 폼이 실제로 떴는지 먼저 본다. getByLabel은 부분 일치라 '제목'이 목록의
  // '제목으로 검색'에도 걸린다 — lazy 청크를 기다리지 않으면 목록이 아직 떠 있는 동안
  // 검색창에 제목을 넣고, 폼은 빈 제목으로 저장을 눌러 400이 된다.
  await expect(page.getByRole('checkbox').first()).toBeVisible()

  const title = page.getByLabel('제목')
  await title.fill('e2e로 만든 문제')
  await expect(title).toHaveValue('e2e로 만든 문제')
  await page.getByRole('button', { name: '저장' }).click()

  await expect(page.getByRole('status')).toContainText('만들었어요')
  await expect(page).toHaveURL(/\/admin\/problems\/\d+$/)

  // 목록으로 돌아오면 초안으로 보인다. 목 상태가 요청 사이에 남아 있다는 뜻이기도 하다.
  await page.getByRole('link', { name: '문제 관리로' }).click()
  await page.getByLabel('제목으로 검색').fill('e2e로')
  await expect(page.getByRole('row', { name: /e2e로 만든 문제/ })).toContainText('작성 중')
})

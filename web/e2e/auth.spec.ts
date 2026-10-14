import { expect, test, type Page } from '@playwright/test'

// 목 계정이다. web/src/mocks/fixtures/users.ts와 같은 값을 쓴다.
const USER = { email: 'user@codari.test', password: 'Codari!test1', nickname: '코다리' }
const ADMIN = { email: 'admin@codari.test', password: 'Codari!admin1' }

async function login(page: Page, account: { email: string; password: string }) {
  await page.getByLabel('이메일').fill(account.email)
  await page.getByLabel('비밀번호').fill(account.password)
  await page.getByRole('button', { name: '로그인' }).click()
}

// 로그인 폼은 lazy 라우트라 goto 직후엔 아직 없을 수 있다. 폼이 보인 뒤에야 입력한다.
async function openLogin(page: Page) {
  await page.goto('/login')
  await expect(page.getByRole('form', { name: '로그인' })).toBeVisible()
}

function userMenu(page: Page) {
  return page.getByRole('button', { name: new RegExp(USER.nickname) })
}

test('로그인하면 헤더가 바뀌고 새로고침해도 유지된다', async ({ page }) => {
  await openLogin(page)
  await login(page, USER)

  await expect(page.getByRole('heading', { name: '문제 목록' })).toBeVisible()
  await expect(userMenu(page)).toBeVisible()
  await expect(page).toHaveURL(/\/problems$/)

  // 쿠키로 세션을 유지하는지가 요점이다.
  await page.reload()
  await expect(page.getByRole('heading', { name: '문제 목록' })).toBeVisible()
  await expect(userMenu(page)).toBeVisible()
})

test('로그아웃하면 문제 목록으로 가고 헤더에 로그인 링크가 돌아온다', async ({ page }) => {
  await openLogin(page)
  await login(page, USER)
  await expect(userMenu(page)).toBeVisible()

  await userMenu(page).click()
  await page.getByRole('menuitem', { name: '로그아웃' }).click()

  // 사용자 메뉴가 사라지고 로그인 링크가 돌아와야 헤더가 로그아웃 상태를 따라간 것이다.
  await expect(page.getByRole('banner').getByRole('link', { name: '로그인' })).toBeVisible()
  await expect(userMenu(page)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '문제 목록' })).toBeVisible()
  await expect(page).toHaveURL(/\/problems$/)
})

test('비로그인이 제출 기록에 가면 로그인 후 그 자리로 돌아온다', async ({ page }) => {
  await page.goto('/submissions')

  await expect(page.getByRole('form', { name: '로그인' })).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
  await login(page, USER)

  await expect(page.getByRole('heading', { name: '제출 기록' })).toBeVisible()
  await expect(page).toHaveURL(/\/submissions$/)
})

test('로그인 실패 문구는 이유를 구분해 주지 않는다', async ({ page }) => {
  await openLogin(page)
  await login(page, { email: USER.email, password: '틀린비밀번호1!' })

  await expect(page.getByRole('alert')).toContainText('이메일 또는 비밀번호가 맞지 않아요')
  await expect(page).toHaveURL(/\/login$/)
})

test('USER가 관리자 화면에 가면 권한 없음으로 떨어진다', async ({ page }) => {
  await openLogin(page)
  await login(page, USER)
  await expect(userMenu(page)).toBeVisible()

  await page.goto('/admin')

  await expect(page.getByRole('heading', { name: '권한이 없습니다' })).toBeVisible()
  await expect(page).toHaveURL(/\/forbidden$/)
  await expect(page.getByRole('banner').getByRole('link', { name: '관리자' })).toBeHidden()
})

test('ADMIN에게는 관리자 메뉴가 보인다', async ({ page }) => {
  await openLogin(page)
  await login(page, ADMIN)

  await expect(page.getByRole('banner').getByRole('link', { name: '관리자' })).toBeVisible()
})

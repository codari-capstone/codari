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

  // 로그인 직후의 목적지가 문제 목록이라, 거기서 로그아웃하면 이동하지 않아도 같은 화면이다.
  // 보호된 화면에서 나가야 로그아웃이 문제 목록으로 보내는지 가려낼 수 있다.
  await page.goto('/submissions')
  await expect(page.getByRole('heading', { name: '제출 기록' })).toBeVisible()

  await userMenu(page).click()
  await page.getByRole('menuitem', { name: '로그아웃' }).click()

  // 사용자 메뉴가 사라지고 로그인 링크가 돌아와야 헤더가 로그아웃 상태를 따라간 것이다.
  await expect(page.getByRole('banner').getByRole('link', { name: '로그인' })).toBeVisible()
  await expect(userMenu(page)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '문제 목록' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '제출 기록' })).toHaveCount(0)
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

test('필터를 걸어 둔 채 헤더의 로그인을 누르면 그 목록으로 돌아온다 (COM-07)', async ({ page }) => {
  await page.goto('/problems?difficulty=EASY')
  await expect(page.getByRole('heading', { name: '문제 목록' })).toBeVisible()

  // 목록 안내에도 '로그인' 링크가 있다. 헤더(banner) 안으로 좁혀야 버튼을 집는다.
  await page.getByRole('banner').getByRole('link', { name: '로그인' }).click()
  await expect(page.getByRole('form', { name: '로그인' })).toBeVisible()
  await login(page, USER)

  // 링크가 지금 주소를 싣지 않으면 조건이 사라진 /problems로 떨어진다.
  await expect(page).toHaveURL(/\/problems\?difficulty=EASY$/)
  await expect(userMenu(page)).toBeVisible()
})

test('비로그인이 문제 상세를 열면 로그인 화면으로 간다', async ({ page }) => {
  await page.goto('/problems/1')

  // URL은 /login으로 바뀐 뒤에도 lazy LoginPage 청크가 그려지기 전까지 폼이 없다. 폼이 보이는 것으로 화면이 떴음을 먼저 확인한다.
  await expect(page.getByRole('form', { name: '로그인' })).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})

const LOGIN_FAILED =
  '이메일 또는 비밀번호가 맞지 않아요. GitHub로 가입했다면 GitHub 로그인을 이용해 주세요'

// 두 입력에서 같은 문구가 나와야 "이유를 구분해 주지 않는다"가 성립한다.
for (const [사례, account] of [
  ['비밀번호가 틀려도', { email: USER.email, password: '틀린비밀번호1!' }],
  ['없는 이메일이어도', { email: 'nobody@codari.test', password: USER.password }],
] as const) {
  test(`${사례} 로그인 실패 문구가 같다`, async ({ page }) => {
    await openLogin(page)
    await login(page, account)

    await expect(page.getByRole('alert')).toHaveText(LOGIN_FAILED)
    await expect(page).toHaveURL(/\/login$/)
  })
}

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

  // 메뉴가 보이는 것과 화면에 들어가지는 것은 별개다. 관리자 화면은 아직 자리표시라
  // 제목이 가장 단단한 단서다.
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: '관리자 문제 제작' })).toBeVisible()
  await expect(page).toHaveURL(/\/admin$/)
})

import { expect, test, type Page } from '@playwright/test'

// 목 계정이다. web/src/mocks/fixtures/users.ts와 같은 값을 쓴다.
const USER = { email: 'user@codari.test', password: 'Codari!test1', nickname: '코다리' }
const ADMIN = { email: 'admin@codari.test', password: 'Codari!admin1' }

async function login(page: Page, account: { email: string; password: string }) {
  await page.getByLabel('이메일').fill(account.email)
  await page.getByLabel('비밀번호').fill(account.password)
  await page.getByRole('button', { name: '로그인', exact: true }).click()
}

// 로그인 폼은 lazy 라우트라 goto 직후엔 아직 없을 수 있다. 폼이 보인 뒤에야 입력한다.
async function openLogin(page: Page) {
  await page.goto('/login')
  await expect(page.getByRole('form', { name: '로그인' })).toBeVisible()
}

function userMenu(page: Page) {
  return page.getByRole('button', { name: new RegExp(USER.nickname) })
}

// 목이 받아 주는 새 계정. web/src/mocks/fixtures/users.ts에 없는 이메일과 닉네임이어야 한다.
const NEW_USER = { email: 'newbie@codari.test', nickname: '뉴비', password: 'Codari!new12' }
// 목의 인증번호. web/src/mocks/fixtures/emailCodes.ts와 같은 값을 쓴다.
const MOCK_CODE = '123456'

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

test('회원가입을 마치면 안내와 함께 로그인 화면으로 보낸다 (COM-06)', async ({ page }) => {
  await openLogin(page)
  await page.getByRole('link', { name: '회원가입' }).click()
  // lazy 라우트라 화면이 그려진 뒤에야 입력한다. 이메일 입력이 보이면 청크가 떴다.
  await expect(page).toHaveURL(/\/signup$/)
  await expect(page.getByLabel('이메일')).toBeVisible()

  await page.getByLabel('이메일').fill(NEW_USER.email)
  await page.getByRole('button', { name: '인증번호 받기' }).click()
  await page.getByLabel('인증번호').fill(MOCK_CODE)
  await page.getByRole('button', { name: '확인', exact: true }).click()
  await expect(page.getByText('인증됐어요')).toBeVisible()

  await page.getByLabel('닉네임').fill(NEW_USER.nickname)
  await page.getByRole('button', { name: '중복 확인' }).click()
  await expect(page.getByText('쓸 수 있어요')).toBeVisible()

  await page.getByLabel('비밀번호', { exact: true }).fill(NEW_USER.password)
  await page.getByLabel('비밀번호 확인').fill(NEW_USER.password)
  await page.getByRole('button', { name: '가입 완료' }).click()

  // 계약이 가입 응답에 토큰을 주지 않는다. 로그인은 사용자가 직접 한다.
  // 목은 가입한 계정을 로그인 계정에 넣지 않으므로 여기서 끝낸다.
  await expect(page.getByText('가입이 완료됐어요. 로그인해 주세요')).toBeVisible()
  await expect(page.getByRole('form', { name: '로그인' })).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})

test('비밀번호 재설정을 마치면 안내와 함께 로그인 화면으로 보낸다 (COM-08)', async ({ page }) => {
  await openLogin(page)
  await page.getByRole('link', { name: '비밀번호 찾기' }).click()
  await expect(page).toHaveURL(/\/password-reset$/)
  await expect(page.getByLabel('이메일')).toBeVisible()

  await page.getByLabel('이메일').fill(USER.email)
  await page.getByRole('button', { name: '인증번호 받기' }).click()
  await page.getByLabel('인증번호').fill(MOCK_CODE)
  await page.getByRole('button', { name: '확인', exact: true }).click()
  await expect(page.getByText('인증됐어요')).toBeVisible()

  await page.getByLabel('새 비밀번호', { exact: true }).fill('Codari!new99')
  await page.getByLabel('새 비밀번호 확인').fill('Codari!new99')
  await page.getByRole('button', { name: '재설정' }).click()

  // 목은 비밀번호를 바꾸지 않으므로 새 비밀번호로 로그인해 보지 않는다.
  await expect(page.getByText('비밀번호를 바꿨어요. 새 비밀번호로 로그인해 주세요')).toBeVisible()
  await expect(page.getByRole('form', { name: '로그인' })).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})

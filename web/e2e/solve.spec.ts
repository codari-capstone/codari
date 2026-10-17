import { expect, test, type Page } from '@playwright/test'

// 목 계정이다. web/src/mocks/fixtures/users.ts와 같은 값을 쓴다.
const USER = { email: 'user@codari.test', password: 'Codari!test1' }

/**
 * 문제 풀이 화면은 로그인해야 본다 (COM-05, RequireAuth).
 *
 * 로그인 자체를 시험하는 것은 auth.spec.ts다. 여기서는 그 화면에 닿기 위한 준비다.
 */
async function login(page: Page) {
  await page.goto('/login')
  await expect(page.getByRole('form', { name: '로그인' })).toBeVisible()
  await page.getByLabel('이메일').fill(USER.email)
  await page.getByLabel('비밀번호').fill(USER.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await expect(page).toHaveURL(/\/problems$/)
}

test.describe('문제 풀이 화면', () => {
  test('목록에서 문제를 누르면 지문·예제·출처가 보인다', async ({ page }) => {
    await login(page)

    await page.getByRole('link', { name: '두 수의 합' }).click()

    await expect(page.getByRole('heading', { level: 1, name: '두 수의 합' })).toBeVisible()
    await expect(page.getByText('Python · 2초 · 256MB')).toBeVisible()
    // 수식이 KaTeX로 그려진다. 글자 그대로 남으면 지문이 읽히지 않는다 (SOLVE-01).
    await expect(page.locator('.katex').first()).toBeVisible()
    await expect(page.getByRole('heading', { name: '예제', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'LeetCode 1. Two Sum' })).toBeVisible()
    await expect(page.getByText('문제 버전: v1')).toBeVisible()
  })

  /**
   * 이 둘은 e2e만 잡을 수 있다.
   *
   * 배치를 CSS가 아니라 matchMedia로 가르기 때문에(useWideLayout) jsdom 단위 테스트는
   * stub을 바꿔 가며 양쪽을 확인할 뿐 실제 폭에서 어느 쪽이 되는지는 보지 못한다.
   */
  test('넓은 화면은 지문과 에디터를 나란히 보여 준다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await login(page)
    await page.goto('/problems/1')

    await expect(page.getByRole('heading', { level: 1, name: '두 수의 합' })).toBeVisible()
    await expect(page.getByRole('tablist')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '예제', exact: true })).toBeVisible()
    await expect(page.getByText('코드 에디터는 준비 중입니다.')).toBeVisible()
  })

  test('좁은 화면은 탭으로 나누고 문서가 가로로 넘치지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await login(page)
    await page.goto('/problems/1')

    await expect(page.getByRole('heading', { level: 1, name: '두 수의 합' })).toBeVisible()
    await expect(page.getByRole('tab', { name: '지문' })).toBeVisible()
    await expect(page.getByText('코드 에디터는 준비 중입니다.')).toBeHidden()

    await page.getByRole('tab', { name: '코드 작성' }).click()
    await expect(page.getByText('코드 에디터는 준비 중입니다.')).toBeVisible()
    await expect(page.getByRole('heading', { name: '예제', exact: true })).toBeHidden()

    // 예제와 코드 블록은 긴 줄을 가진다. pre 안에서만 가로로 흐르고 문서는 안 넘쳐야 한다.
    await page.getByRole('tab', { name: '지문' }).click()
    await expect(page.getByRole('heading', { name: '예제', exact: true })).toBeVisible()
    const width = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }))
    expect(width.document).toBeLessThanOrEqual(width.viewport)
  })
})

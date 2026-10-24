import { expect, test, type Page } from '@playwright/test'

// 목 계정이다. web/src/mocks/fixtures/users.ts와 같은 값을 쓴다.
const USER = { email: 'user@codari.test', password: 'Codari!test1' }

async function login(page: Page) {
  await page.goto('/login')
  await expect(page.getByRole('form', { name: '로그인' })).toBeVisible()
  await page.getByLabel('이메일').fill(USER.email)
  await page.getByLabel('비밀번호').fill(USER.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await expect(page).toHaveURL(/\/problems$/)
}

test.describe('제출 결과 화면', () => {
  /**
   * 제출부터 판정까지 한 번에 본다 (SOLVE-09 → RES-01·02·07).
   *
   * 폴링은 e2e만 제대로 잴 수 있다 — 단위 테스트는 목을 직접 세워 상태를 하나씩 보여
   * 주지만, 실제로 간격을 두고 스스로 나아가는지는 브라우저에서만 드러난다.
   */
  test('코드를 제출하면 채점이 진행되고 판정이 뜬다', async ({ page }) => {
    await login(page)
    await page.goto('/problems/1')

    const editor = page.getByRole('textbox', { name: '코드 편집기' })
    await editor.click()
    await page.keyboard.type('print(1)')
    await page.getByRole('button', { name: '제출' }).click()

    await expect(page).toHaveURL(/\/submissions\/\d+$/)
    // 처음에는 기다리는 중이다. 한 번에 판정이 뜨면 폴링이 돌지 않은 것이다.
    await expect(page.getByText('기다리는 중')).toBeVisible()

    // 아무도 밀지 않아도 판정까지 나아간다.
    await expect(page.getByText('맞았습니다!!')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/^제출 #\d+$/)).toBeVisible()
    await expect(page.getByText('Python')).toBeVisible()

    // 정답이면 AI 리뷰·다음 문제다 (RES-07). 둘 다 아직 열 곳이 없어 비활성이다.
    await expect(page.getByRole('button', { name: 'AI 리뷰 (준비 중)' })).toBeDisabled()
    await expect(page.getByRole('button', { name: '다음 문제 (준비 중)' })).toBeDisabled()
  })

  /** 시작 코드를 그대로 내면 목이 오답을 준다(handlers.ts) — 오답 쪽 버튼을 본다. */
  test('오답이면 다시 풀기로 그 문제로 돌아간다', async ({ page }) => {
    await login(page)
    await page.goto('/problems/1')
    await expect(page.getByRole('textbox', { name: '코드 편집기' })).toBeVisible()

    await page.getByRole('button', { name: '제출' }).click()
    await expect(page.getByText('틀렸습니다')).toBeVisible({ timeout: 15_000 })

    await expect(page.getByRole('button', { name: 'AI 분석 (준비 중)' })).toBeDisabled()
    await page.getByRole('link', { name: '다시 풀기' }).click()

    await expect(page).toHaveURL(/\/problems\/1$/)
    // 쓰던 코드가 그대로 열린다 (SOLVE-11).
    await expect(page.getByRole('textbox', { name: '코드 편집기' })).toContainText('sys.stdin')
  })
})

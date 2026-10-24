import { expect, type Page } from '@playwright/test'

/** 목 계정이다. web/src/mocks/fixtures/users.ts와 같은 값을 쓴다. */
export const USER = { email: 'user@codari.test', password: 'Codari!test1' }

/**
 * 로그인해 둔다. 보호된 화면(COM-05, RequireAuth)에 닿기 위한 준비다.
 *
 * 로그인 자체를 시험하는 것은 auth.spec.ts다 — 그쪽은 실패 경로와 리다이렉트까지 보므로
 * 이 헬퍼를 쓰지 않는다. 여기 모은 것은 solve·result가 글자 하나까지 같은 절차를 각각
 * 복사해 두고 있던 것이다. 폼 라벨이나 도착 주소가 바뀌면 고칠 자리가 하나여야 한다.
 */
export async function login(page: Page) {
  await page.goto('/login')
  await expect(page.getByRole('form', { name: '로그인' })).toBeVisible()
  await page.getByLabel('이메일').fill(USER.email)
  await page.getByLabel('비밀번호').fill(USER.password)
  await page.getByRole('button', { name: '로그인' }).click()
  await expect(page).toHaveURL(/\/problems$/)
}

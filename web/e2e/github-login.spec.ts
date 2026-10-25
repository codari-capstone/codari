import { expect, test } from '@playwright/test'

/**
 * GitHub 로그인 (COM-02).
 *
 * **목 모드에서는 시작 단계의 이동만 확인할 수 있다.** 계약이 `GET /api/auth/github`를
 * 브라우저 이동으로 정했고(fetch가 아니다), MSW의 서비스 워커는 네비게이션 요청을 그냥
 * 통과시킨다(public/mockServiceWorker.js의 "Bypass navigation requests"). 그래서 GitHub를
 * 거쳐 콜백으로 돌아오는 왕복은 여기서 재현할 수 없다 — 돌아온 뒤의 세 갈래는 단위
 * 테스트가 본다(GitHubCallbackPage.test.tsx).
 *
 * 그래도 여기서만 볼 수 있는 것이 하나 있다: **버튼이 실제로 그 주소로 이동하는가.**
 * jsdom은 이동을 구현하지 않고 `location.assign`은 바꿔 끼울 수도 없어서, 단위 테스트에
 * 그 한 줄을 확인할 자리가 없다.
 */
test.describe('GitHub 로그인', () => {
  test('버튼을 누르면 계약이 정한 시작 주소로 이동한다', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('form', { name: '로그인' })).toBeVisible()

    await page.getByRole('button', { name: 'GitHub로 로그인' }).click()

    // 실서버라면 여기서 302로 GitHub 인증 화면으로 간다. 목 모드에서는 이 요청이 vite 프록시로
    // 나가 ECONNREFUSED가 되고(로그에 그 줄이 남는다) 주소는 그대로 남는다.
    await expect(page).toHaveURL(/\/api\/auth\/github$/)
  })

  test('이동 전에 돌아갈 주소를 적어 둔다', async ({ page }) => {
    // 보호된 화면에 비로그인으로 들어가면 RequireAuth가 로그인 화면으로 보내며 주소를 싣는다.
    await page.goto('/submissions')
    await expect(page).toHaveURL(/\/login$/)

    await page.getByRole('button', { name: 'GitHub로 로그인' }).click()
    await expect(page).toHaveURL(/\/api\/auth\/github$/)

    // SPA를 완전히 떠나므로 라우터 state로는 남길 수 없다. 이게 끊기면 GitHub를 다녀온
    // 사람이 제출 기록이 아니라 문제 목록으로 떨어진다.
    const remembered = await page.evaluate(() => sessionStorage.getItem('github-login:from'))
    expect(remembered).toBe('/submissions')
  })

  test('돌아온 뒤 닉네임만 정하면 가입이 끝난다', async ({ page }) => {
    // 콜백이 보내 주는 주소를 직접 연다(위 주석의 이유로 왕복은 재현할 수 없다).
    await page.goto('/login/github?result=signup')

    await expect(page.getByRole('heading', { level: 1, name: '닉네임 정하기' })).toBeVisible()
    // 비밀번호는 만들지 않는다(명세 COM-02).
    await expect(page.getByLabel('비밀번호')).toHaveCount(0)

    await page.getByLabel('닉네임').fill('깃허브사람')
    await page.getByRole('button', { name: '중복 확인' }).click()
    await expect(page.getByText('쓸 수 있어요')).toBeVisible()

    await page.getByRole('button', { name: '가입 완료' }).click()

    // 증명서 쿠키가 없어 실패한다 — 콜백을 거치지 않았으니 당연하다. 중요한 것은 그때
    // 닉네임을 고치게 두지 않고 GitHub 로그인부터 다시 하게 보낸다는 것이다.
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('alert')).toContainText('GitHub 로그인을 다시 해 주세요')
  })
})

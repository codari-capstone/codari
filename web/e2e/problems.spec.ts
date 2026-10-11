import { expect, test } from '@playwright/test'

test.describe('문제 목록', () => {
  test('목록이 표로 보인다', async ({ page }) => {
    await page.goto('/problems')

    await expect(page.getByRole('heading', { level: 1, name: '문제 목록' })).toBeVisible()
    await expect(page.getByRole('link', { name: '두 수의 합' })).toBeVisible()
    // 머리 1 + 본문 8
    await expect(page.getByRole('row')).toHaveCount(9)
  })

  test('필터가 URL에 남아 새로고침해도 유지된다', async ({ page }) => {
    await page.goto('/problems')
    await expect(page.getByRole('row')).toHaveCount(9)

    // check()는 클릭 직후 한 번만 checked를 확인해 던진다. 체크 상태는
    // onChange → setSearchParams(URL 갱신) → 리렌더를 거쳐 정해지는데, 그 사이
    // 타이밍에 걸리면 "Clicking the checkbox did not change its state"로 실패한다
    // (단일 워커로도 재현됨). click() 뒤 expect().toBeChecked()로 안정될 때까지 기다린다.
    await page.getByRole('checkbox', { name: '어려움' }).click()
    await expect(page.getByRole('checkbox', { name: '어려움' })).toBeChecked()

    await expect(page).toHaveURL(/difficulty=HARD/)
    await expect(page.getByRole('row')).toHaveCount(3) // 머리 1 + HARD 2

    await page.reload()

    await expect(page.getByRole('checkbox', { name: '어려움' })).toBeChecked()
    await expect(page.getByRole('row')).toHaveCount(3)
  })

  test('난이도 정렬은 쉬움부터다', async ({ page }) => {
    await page.goto('/problems')
    await page.getByRole('button', { name: /난이도/ }).click()

    await expect(page).toHaveURL(/sort=difficulty%2Casc/)

    const cells = page.locator('tbody tr td:nth-child(3)')
    await expect(cells.first()).toHaveText('쉬움')
    // 문자열 정렬이면 '어려움'이 가운데로 온다
    await expect(cells.last()).toHaveText('어려움')
  })

  test('좁은 화면에서 사이드바가 표 위로 쌓이고 문서가 가로로 넘치지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto('/problems')
    await expect(page.getByRole('link', { name: '두 수의 합' })).toBeVisible()

    const layout = await page.evaluate(() => {
      const aside = document.querySelector('aside')
      const main = document.querySelector('main')
      if (!aside || !main) return null

      return {
        asideBottom: aside.getBoundingClientRect().bottom,
        mainTop: main.getBoundingClientRect().top,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      }
    })

    expect(layout).not.toBeNull()
    // 2열이면 asideBottom > mainTop 이다. 쌓였으면 사이드바가 본문 위에서 끝난다.
    expect(layout!.asideBottom).toBeLessThanOrEqual(layout!.mainTop + 1)
    // 문서 자체가 가로로 넘치면 화면 전체가 흔들린다. 다만 이 단언만으로는 표가
    // 컨테이너로 스크롤을 받고 있다는 것까지는 증명하지 못한다 — 아래에서 따로 본다.
    expect(layout!.documentWidth).toBeLessThanOrEqual(layout!.viewportWidth + 1)

    // 문서 폭 단언만으로는 부족하다. 지금 fixture의 제목이 짧아 320px에서도 표가
    // 다 들어가므로, overflow-x-auto를 지워도 그 단언은 통과한다. 스크롤을 받는 쪽이
    // 문서가 아니라 표 컨테이너인지를 따로 확인한다 — 실제 문제 제목은 fixture보다
    // 길고, 로그인하면 열도 하나 늘어난다.
    const overflowX = await page
      .locator('[data-slot="table-container"]')
      .evaluate((el) => getComputedStyle(el).overflowX)

    expect(overflowX, '표 컨테이너가 가로 스크롤을 받지 않는다').toBe('auto')
  })
})

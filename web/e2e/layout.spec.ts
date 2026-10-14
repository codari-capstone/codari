import { expect, test } from '@playwright/test'

test('상단 내비게이션이 보이고 공개 메뉴로 이동한다', async ({ page }) => {
  // 문제 목록이 아닌 곳에서 출발해야 클릭이 아무 일도 안 해도 통과하는 일이 없다.
  await page.goto('/login')
  await expect(page.getByRole('form', { name: '로그인' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Codari' })).toBeVisible()

  await page
    .getByRole('navigation', { name: '주요 메뉴' })
    .getByRole('link', { name: '문제' })
    .click()
  await expect(page.getByRole('heading', { name: '문제 목록' })).toBeVisible()
  await expect(page).toHaveURL(/\/problems$/)
})

// 클릭 직후에는 URL이 먼저 /submissions가 되고, 로그인으로 밀려나는 건 라우트 청크와
// 세션 조회가 끝난 뒤다. 그 사이 URL만 보면 타이밍에 따라 통과하므로 로그인 폼이 뜬
// 정착 상태를 기다린다.
test('비로그인이 보호된 메뉴를 누르면 로그인 화면에 닿는다', async ({ page }) => {
  await page.goto('/problems')
  await expect(page.getByRole('heading', { name: '문제 목록' })).toBeVisible()

  await page.getByRole('link', { name: '제출 기록' }).click()

  await expect(page.getByRole('form', { name: '로그인' })).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: '제출 기록' })).toHaveCount(0)
})

// 헤더 링크가 404로 떨어지면 URL만 맞아서는 못 잡는다. 폼이 실제로 그려지는지 본다.
test('헤더의 로그인 링크가 로그인 폼이 있는 화면으로 간다', async ({ page }) => {
  await page.goto('/problems')

  await page.getByRole('banner').getByRole('link', { name: '로그인' }).click()

  await expect(page.getByRole('form', { name: '로그인' })).toBeVisible()
  await expect(page.getByLabel('이메일')).toBeVisible()
  await expect(page.getByLabel('비밀번호')).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})

test('테마를 바꾸면 새로고침해도 유지된다', async ({ page }) => {
  await page.goto('/problems')

  const html = page.locator('html')
  await expect(html).not.toHaveClass(/dark/)

  await page.getByRole('button', { name: '다크 모드로 전환' }).click()
  await expect(html).toHaveClass(/dark/)

  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
})

/**
 * 번들 로드 전 깜빡임 (index.html의 인라인 스크립트).
 *
 * ThemeProvider의 useLayoutEffect는 React가 렌더를 시작한 뒤만 덮는다. main.tsx가
 * App을 동적 import하는 동안에는 아무 JS도 테마를 정하지 않으므로, 그 구간을
 * index.html의 인라인 스크립트가 맡는다. 앱 번들을 막아 그 구간을 고정시켜 검사한다.
 */
test('앱 번들이 오지 않아도 저장된 다크 테마가 적용된다', async ({ page }) => {
  await page.goto('/problems')
  await page.getByRole('button', { name: '다크 모드로 전환' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)

  await page.route('**/assets/*.js', (route) => route.abort())
  await page.reload()

  // 번들이 실제로 막혔는지부터 확인한다. 막히지 않았다면 이 테스트는 아무것도 증명하지 않는다
  await expect(page.getByRole('banner')).toHaveCount(0)
  await expect(page.locator('html')).toHaveClass(/dark/)
})

/**
 * 글꼴 CDN이 응답하지 않아도 화면이 뜨는지.
 *
 * 글꼴 CSS를 일반 stylesheet로 두면 렌더 차단 자원이 되어, cdn.jsdelivr.net이
 * 막힌 사내망이나 CI에서 응답을 기다리는 동안 첫 페인트가 밀린다. abort가 아니라
 * "응답하지 않는" 상태를 만들어야 이 차이가 드러난다 — abort는 즉시 실패해
 * 차단이든 아니든 빨리 끝난다.
 */
test('글꼴 CDN이 응답하지 않아도 화면이 뜬다', async ({ page }) => {
  await page.route('**cdn.jsdelivr.net/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 15_000))
    await route.abort()
  })

  // load를 기다리면 위 15초를 그대로 기다리게 된다
  await page.goto('/problems', { waitUntil: 'commit' })

  await expect(page.getByRole('heading', { name: '문제 목록' })).toBeVisible({ timeout: 8_000 })
})

test('권한 없음 화면이 뜬다', async ({ page }) => {
  await page.goto('/forbidden')

  await expect(page.getByText('403')).toBeVisible()
  await expect(page.getByRole('heading', { name: '권한이 없습니다' })).toBeVisible()
})

/**
 * 좁은 화면에서 메뉴가 잘리지 않는지 (UX-05).
 *
 * "링크가 보이는가"로는 이 회귀를 잡을 수 없다. nav에 min-w-0과 overflow-x-auto가
 * 붙어 있던 동안 320px에서 메뉴 세 개가 전부 화면 밖에 있었는데도
 * toBeVisible()과 문서 scrollWidth 검사는 모두 통과했다. 박스가 0이 아니고
 * overflow가 가로 스크롤을 흡수했기 때문이다. 그래서 링크의 실제 좌표를 nav의
 * 보이는 영역과 비교한다.
 */
for (const width of [320, 390, 430, 768]) {
  test(`${width}px에서 메뉴 세 개가 모두 보인다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/problems')

    await expect(page.getByRole('link', { name: 'Codari' })).toBeVisible()

    const measured = await page.evaluate(() => {
      const nav = document.querySelector('header nav')
      if (!nav) return null
      const navBox = nav.getBoundingClientRect()
      const links = Array.from(nav.querySelectorAll('a'))
      const outside = links
        .filter((a) => {
          const box = a.getBoundingClientRect()
          // 1px은 소수점 반올림 여유
          return box.right > navBox.right + 1 || box.left < navBox.left - 1
        })
        .map((a) => a.textContent?.trim())
      return { clipped: nav.scrollWidth > nav.clientWidth, outside, count: links.length }
    })

    expect(measured, 'header nav를 찾지 못했다 — 셀렉터가 깨졌다').not.toBeNull()
    expect(measured!.count).toBe(3)
    expect(measured!.clipped, 'nav 내용이 보이는 영역보다 넓다').toBe(false)
    expect(measured!.outside, '보이는 영역 밖으로 밀려난 메뉴가 있다').toEqual([])

    // 가로 스크롤이 생기면 반응형이 깨진 것이다
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflows, '문서에 가로 스크롤이 생겼다').toBe(false)

    // h-14(56px 고정)와 flex-wrap이 함께 있으면 내용이 박스 밖으로 넘친다.
    // boundingBox()는 레이아웃 박스만 돌려줘 넘친 콘텐츠를 보지 못한다.
    const headerOverflows = await page.evaluate(() => {
      const el = document.querySelector('header > div')
      if (!el) return null
      return el.scrollHeight > el.clientHeight
    })
    expect(headerOverflows, 'header가 세로로 넘쳤다').toBe(false)
  })
}

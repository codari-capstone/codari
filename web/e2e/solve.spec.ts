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
    await expect(page.getByRole('textbox', { name: '코드 편집기' })).toBeVisible()

    // 언어를 바꾸면 제한 표시도 바뀐다 (SOLVE-04). 문법 강조가 실제로 C++로 바뀌는지는
    // 실제 브라우저에서만 보인다 — jsdom에는 CodeMirror의 강조 레이어가 없다.
    await page.getByRole('radio', { name: 'C++' }).check()
    await expect(page.getByText('C++ · 1초 · 256MB')).toBeVisible()
    await expect(page.getByRole('textbox', { name: '코드 편집기' })).toContainText(
      'ios::sync_with_stdio',
    )
  })

  test('좁은 화면은 탭으로 나누고 문서가 가로로 넘치지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await login(page)
    await page.goto('/problems/1')

    await expect(page.getByRole('heading', { level: 1, name: '두 수의 합' })).toBeVisible()
    await expect(page.getByRole('tab', { name: '지문' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: '코드 편집기' })).toBeHidden()

    await page.getByRole('tab', { name: '코드 작성' }).click()
    await expect(page.getByRole('textbox', { name: '코드 편집기' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '예제', exact: true })).toBeHidden()

    await page.getByRole('tab', { name: '지문' }).click()
    await expect(page.getByRole('heading', { name: '예제', exact: true })).toBeVisible()
  })

  /**
   * 탭을 옮겨도 에디터가 죽지 않는지 (SOLVE-10 + SOLVE-05).
   *
   * 좁은 화면에서 지문↔코드 전환은 풀면서 계속 일어난다. Radix는 비활성 패널을
   * 언마운트하므로 `forceMount`가 없으면 CodeMirror가 매번 새로 켜진다. 코드 문자열은
   * SolvePage의 state라 그것만으로는 살아남아, **undo 이력**으로 가른다 — 이력은
   * CodeMirror 인스턴스 안에만 있어서 다시 켜지면 비어 있다.
   *
   * 높이도 함께 잰다. 비활성 패널은 `display:none`이라 그동안 CodeMirror가 자기 크기를
   * 재지 못한다. 다시 보일 때 0으로 남으면 에디터가 사라진 것처럼 보인다.
   */
  test('탭을 옮겼다 돌아와도 코드와 undo 이력이 남아 있다', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await login(page)
    await page.goto('/problems/1')
    await expect(page.getByRole('heading', { level: 1, name: '두 수의 합' })).toBeVisible()

    await page.getByRole('tab', { name: '코드 작성' }).click()
    const editor = page.getByRole('textbox', { name: '코드 편집기' })
    await editor.click()
    await page.keyboard.type('first = 1')
    // CodeMirror의 undo는 기본 500ms 안의 입력을 한 덩어리로 묶는다. 두 덩어리로
    // 나눠야 "한 번 되돌리면 첫 줄만 남는다"를 단언할 수 있다.
    await page.waitForTimeout(700)
    await page.keyboard.press('Enter')
    await page.keyboard.type('second = 2')
    await expect(editor).toContainText('second = 2')

    await page.getByRole('tab', { name: '지문' }).click()
    await expect(page.getByRole('heading', { name: '예제', exact: true })).toBeVisible()
    await page.getByRole('tab', { name: '코드 작성' }).click()

    await expect(editor).toContainText('second = 2')
    const box = await page.locator('.cm-editor').boundingBox()
    expect(box?.height ?? 0).toBeGreaterThan(100)

    await editor.click()
    await page.keyboard.press('ControlOrMeta+z')
    await expect(editor).toContainText('first = 1')
    await expect(editor).not.toContainText('second = 2')
  })

  /**
   * 새로고침해도 코드가 남는지 (SOLVE-11).
   *
   * 단위 테스트는 재마운트로 새로고침을 흉내 내지만, 실제 새로고침은 번들을 다시 받고
   * localStorage만 살아남는 과정이다. 저장 키나 읽는 시점이 틀리면 거기서만 드러난다.
   */
  test('새로고침해도 쓰던 코드가 남아 있다', async ({ page }) => {
    await login(page)
    await page.goto('/problems/1')
    await expect(page.getByRole('heading', { level: 1, name: '두 수의 합' })).toBeVisible()

    const editor = page.getByRole('textbox', { name: '코드 편집기' })
    await editor.click()
    await page.keyboard.type('# 새로고침해도 남아야 한다')
    await expect(editor).toContainText('# 새로고침해도 남아야 한다')

    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: '두 수의 합' })).toBeVisible()

    await expect(page.getByRole('textbox', { name: '코드 편집기' })).toContainText(
      '# 새로고침해도 남아야 한다',
    )
  })

  /**
   * 디스플레이 수식($$...$$)이 화면을 가로로 밀지 않는지.
   *
   * KaTeX는 디스플레이 수식을 표로 배치해 한 줄로 그린다 — 꺾이지 않으므로
   * `overflow-wrap:anywhere`가 듣지 않는다. 긴 식 하나가 375px 화면에서 문서 전체를
   * 민다. pre와 같은 방식(자기 안에서 가로로 흐르게)으로 막는다.
   *
   * 두 가지를 함께 잰다. 문서가 안 넘치는 것만 보면 식이 짧아도 통과하므로(1차의
   * 가로 넘침 테스트가 그래서 세 번 고쳐졌다), 식이 실제로 자기 상자보다 넓어
   * **스크롤되고 있다**는 것도 단언한다.
   */
  test('지문의 긴 디스플레이 수식이 화면을 가로로 밀지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await login(page)
    await page.goto('/problems/2')
    await expect(page.getByRole('heading', { level: 1, name: '문자열 뒤집기' })).toBeVisible()

    const measured = await page.evaluate(() => {
      const math = document.querySelector('.katex-display')
      if (!math) return null
      return {
        math: { scroll: math.scrollWidth, client: math.clientWidth },
        document: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
      }
    })

    expect(measured).not.toBeNull()
    // 식이 상자보다 넓다 = 막을 거리가 실제로 있다
    expect(measured!.math.scroll).toBeGreaterThan(measured!.math.client)
    // 그런데도 문서는 넘치지 않는다 = 식이 자기 안에서 흐른다
    expect(measured!.document).toBeLessThanOrEqual(measured!.viewport)
  })

  /**
   * 지문에는 글자만 이어진 긴 토큰이 들어온다 (문자열 문제의 예시가 그렇다).
   *
   * Chromium은 `sys.stdin.read()`처럼 괄호·점이 있는 토큰은 알아서 꺾지만, 글자만 이어진
   * 토큰은 꺾지 않아 문단 밖으로 삐져나온다. 2번 문제(문자열 뒤집기) 지문에 그런 예시가 있다.
   *
   * 문서 폭이 아니라 **문단 폭**을 잰다. 토큰이 조금 길면 문단만 넘고 문서는 아직 안 넘는데
   * (측정: 문단 327px, 코드 348px, 뷰포트 375px) 그때도 글자는 이미 여백으로 삐져나와 있다.
   * 문서 폭으로만 재면 토큰 길이를 뷰포트에 맞춰 둬야 해서, 글꼴이나 여백이 조금 바뀌면
   * 조용히 통과하는 테스트가 된다.
   */
  test('지문의 긴 예시 문자열이 문단 밖으로 삐져나오지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await login(page)
    await page.goto('/problems/2')
    await expect(page.getByRole('heading', { level: 1, name: '문자열 뒤집기' })).toBeVisible()

    const measured = await page.evaluate(() => {
      const target = Array.from(document.querySelectorAll('p')).find((el) =>
        el.querySelector('code'),
      )
      if (!target) return null
      return {
        paragraph: { scroll: target.scrollWidth, client: target.clientWidth },
        document: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
      }
    })

    expect(measured).not.toBeNull()
    expect(measured!.paragraph.scroll).toBeLessThanOrEqual(measured!.paragraph.client)
    // 문서까지 밀리는 더 심한 경우도 함께 막는다.
    expect(measured!.document).toBeLessThanOrEqual(measured!.viewport)
  })
})

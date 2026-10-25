import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { rememberGitHubReturn, takeGitHubReturnPath } from './githubQuery'

/**
 * 돌아갈 주소 기억하기 (COM-02).
 *
 * GitHub 로그인은 SPA를 완전히 떠나므로 라우터 state로는 아무것도 들고 있을 수 없다.
 * 이 왕복이 끊기면 사용자는 어디서 시작했든 늘 문제 목록으로 떨어진다.
 *
 * 이동 자체(`startGitHubLogin`)는 여기서 보지 않는다 — jsdom이 구현하지 않는다.
 * 버튼이 무엇을 넘기는지는 LoginPage.test.tsx, 실제 이동은 e2e가 본다.
 */
beforeEach(() => {
  sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('takeGitHubReturnPath', () => {
  it('적어 둔 주소를 돌려주고 지운다', () => {
    rememberGitHubReturn('/submissions')

    expect(takeGitHubReturnPath()).toBe('/submissions')
    // 남겨 두면 다음에 다른 화면에서 시작한 로그인이 옛 주소로 끌려간다.
    expect(takeGitHubReturnPath()).toBeNull()
  })

  it('적어 둔 것이 없으면 null', () => {
    expect(takeGitHubReturnPath()).toBeNull()
  })

  it('저장이 막혀 있어도 로그인을 막지 않는다', () => {
    // 사생활 보호 모드에서는 setItem이 던진다. 돌아갈 주소를 잃는 것과 로그인을 아예
    // 못 하는 것은 다른 무게다.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    // 적어 두지 못했어도 로그인은 진행한다. 돌아올 때 /problems로 떨어질 뿐이다.
    expect(() => rememberGitHubReturn('/submissions')).not.toThrow()
  })

  it('읽기가 막혀 있어도 던지지 않는다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(takeGitHubReturnPath()).toBeNull()
  })
})

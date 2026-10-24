import { describe, expect, it } from 'vitest'

import { BEGINNER_GUIDE } from './beginnerGuide'

/**
 * 입문자 안내는 그대로 붙여 넣어 돌아가야 한다 (SOLVE-07).
 *
 * 처음에는 읽는 방법 여러 개를 한 예시에 이어 붙였다가, 양쪽 언어에서 바로 그 조합이
 * 만드는 함정을 예시에 담고 있었다. 뿌리가 같아서 "한 예시에 한 가지 방법만"으로
 * 고쳤고, 이 테스트가 그 결정을 붙들고 있다. 다른 읽기 방법은 terms에서 함정과 함께
 * 설명한다.
 */
describe('BEGINNER_GUIDE', () => {
  it('Python 예시는 한 번에 읽기만 쓴다', () => {
    const { readingExample } = BEGINNER_GUIDE.PYTHON

    expect(readingExample).toContain('sys.stdin.read()')
    // readline()이 뒤에 올 입력까지 미리 읽어 두어서, 이어지는 read()가 빈 값을 받는다.
    expect(readingExample).not.toContain('readline')
  })

  it('C++ 예시는 cin >> 다음에 getline을 부르지 않는다', () => {
    const { readingExample } = BEGINNER_GUIDE.CPP

    expect(readingExample).toContain('cin >>')
    // cin >>이 남긴 줄바꿈을 getline이 그 줄의 끝으로 보고 빈 문자열을 돌려준다.
    expect(readingExample).not.toContain('getline')
  })

  it('두 언어 모두 예시와 용어 설명을 가진다', () => {
    for (const guide of Object.values(BEGINNER_GUIDE)) {
      expect(guide.readingExample.trim()).not.toBe('')
      // 표준 입력·표준 출력이 무엇인지 모르면 예시만으로는 한 걸음도 못 뗀다.
      expect(guide.terms.length).toBeGreaterThanOrEqual(2)
    }
  })
})

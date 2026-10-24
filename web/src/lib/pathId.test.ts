import { describe, expect, it } from 'vitest'

import { parsePathId } from './pathId'

/**
 * 문제 번호와 제출 번호가 이 하나를 쓴다. 화면마다 한 벌씩 두었더니 본문이 같은 함수가
 * 둘이 되어, 한쪽의 상한이나 0 처리만 바뀌면 다른 주소는 옛 규칙으로 검사됐다.
 */
describe('parsePathId', () => {
  it('정수를 읽는다', () => {
    expect(parsePathId('12')).toBe(12)
  })

  // 주소는 사용자가 손으로 고친다. 계약은 정수가 아닌 id에 400, 없는 번호에 404를 주는데
  // 사용자에게는 둘 다 "없는 것"이다. 보낼 필요가 없는 요청은 보내지 않는다.
  it.each(['abc', '1.5', '0', '-3', '', '1e300', undefined])('모르는 id는 null이다: %s', (raw) => {
    expect(parsePathId(raw)).toBeNull()
  })
})

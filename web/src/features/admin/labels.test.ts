import { describe, expect, it } from 'vitest'

import { problemStateLabel } from './labels'

describe('problemStateLabel', () => {
  it('공개 중인 버전이 최신이면 "공개"다', () => {
    expect(problemStateLabel('PUBLISHED', 3)).toBe('공개')
  })

  it('공개한 적이 없으면 최신 버전의 상태만 보여 준다', () => {
    expect(problemStateLabel('DRAFT', null)).toBe('작성 중')
    expect(problemStateLabel('VALIDATING', null)).toBe('검증 중')
    expect(problemStateLabel('RETIRED', null)).toBe('비공개')
  })

  /** 계약이 적어 둔 예시 그대로다. 사용자는 v2를 풀고 관리자는 그 위를 고치는 중이다. */
  it('공개 버전 위에 초안을 쓰는 중이면 둘을 함께 보여 준다', () => {
    expect(problemStateLabel('DRAFT', 2)).toBe('공개 v2 · 수정 중')
  })

  // '작성 중'이 아니다. 이미 있는 문제를 고치는 중이라 사용자에게는 옛 버전이 보인다.
  it('공개 버전이 있으면 초안을 "수정 중"으로 적는다', () => {
    expect(problemStateLabel('DRAFT', 1)).not.toContain('작성 중')
  })

  it('공개 버전을 두고 검증 중이면 검증 문구를 그대로 쓴다', () => {
    expect(problemStateLabel('VALIDATING', 5)).toBe('공개 v5 · 검증 중')
  })
})

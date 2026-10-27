import { describe, expect, it } from 'vitest'

import { problemStateLabel, savedVersionNotice } from './labels'

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

describe('savedVersionNotice', () => {
  /**
   * 이 문구가 필요한 까닭이 #33에서 정책이 바뀌었기 때문이다. 공개 중인 버전을 그 자리에서
   * 고치면 사용자 화면에 바로 나간다 — 알리지 않으면 관리자가 모르고 공개된 지문을 고친다.
   */
  it('공개 중인 버전을 고쳤으면 바로 반영됐다고 알린다', () => {
    const notice = savedVersionNotice(
      { versionNo: 3, status: 'PUBLISHED' },
      { latestVersionNo: 3, publishedVersionNo: 3 },
    )

    expect(notice).toContain('공개 중인 v3')
    expect(notice).toContain('바로')
  })

  it('새 초안이 생겼으면 사용자가 아직 보는 버전을 알린다', () => {
    const notice = savedVersionNotice(
      { versionNo: 4, status: 'DRAFT' },
      { latestVersionNo: 3, publishedVersionNo: 3 },
    )

    expect(notice).toContain('새 초안 v4')
    expect(notice).toContain('v3')
  })

  // 공개된 적 없는 문제에 "사용자는 vN을 풀어요"라고 적으면 거짓말이 된다.
  it('공개된 버전이 없으면 사용자가 보는 버전을 말하지 않는다', () => {
    const notice = savedVersionNotice(
      { versionNo: 2, status: 'DRAFT' },
      { latestVersionNo: 1, publishedVersionNo: null },
    )

    expect(notice).toContain('새 초안 v2')
    expect(notice).not.toContain('풀어요')
  })

  it('같은 초안에 저장했으면 그대로 알린다', () => {
    const notice = savedVersionNotice(
      { versionNo: 2, status: 'DRAFT' },
      { latestVersionNo: 2, publishedVersionNo: 1 },
    )

    expect(notice).toBe('초안 v2에 저장했어요')
  })

  it('새로 만든 문제는 만들었다고 알린다', () => {
    expect(savedVersionNotice({ versionNo: 1, status: 'DRAFT' }, null)).toContain('만들었어요')
  })
})

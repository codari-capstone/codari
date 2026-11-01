import type { ProblemVersionStatus, PublishCondition, SolutionStatus } from '@/api/types'

/** 버전 하나의 상태. 기능명세 ADM-01의 '작성 중·검증 중·공개' 문구를 쓴다. */
export const VERSION_STATUS_LABEL: Record<ProblemVersionStatus, string> = {
  DRAFT: '작성 중',
  VALIDATING: '검증 중',
  PUBLISHED: '공개',
  RETIRED: '비공개',
}

/**
 * 목록에 보여 줄 문제 상태 (ADM-01).
 *
 * **상태가 둘일 수 있다.** 공개 중인 버전을 두고 그 위에 새 초안을 쓰는 중이면, 사용자는
 * 옛 버전을 풀고 관리자는 새 버전을 고치고 있다. 둘 중 하나만 보여 주면 "공개했는데 왜
 * 수정이 안 보이나" 또는 "작성 중인데 왜 사용자에게 보이나"가 된다. 계약이 이 합성을
 * 화면 몫으로 정하고 예시까지 적어 뒀다 — `DRAFT` + `publishedVersionNo`가 2면
 * "공개 v2 · 수정 중".
 *
 * 그래서 `DRAFT`의 문구가 두 가지다. 공개된 버전이 없으면 처음 쓰는 것이라 '작성 중',
 * 있으면 이미 있는 것을 고치는 것이라 '수정 중'이다.
 */
export function problemStateLabel(
  latestStatus: ProblemVersionStatus,
  publishedVersionNo: number | null,
): string {
  // 최신 버전이 공개 중이면 더 얹을 작업이 없다. publishedVersionNo는 같은 번호다.
  if (latestStatus === 'PUBLISHED') return VERSION_STATUS_LABEL.PUBLISHED

  if (publishedVersionNo === null) return VERSION_STATUS_LABEL[latestStatus]

  const work = latestStatus === 'DRAFT' ? '수정 중' : VERSION_STATUS_LABEL[latestStatus]
  return `공개 v${publishedVersionNo} · ${work}`
}

/**
 * 저장이 어느 버전에 들어갔는지 알리는 문구 (ADM-07).
 *
 * **이 문구가 필요한 까닭이 정책이 바뀌었기 때문이다.** 모든 수정이 새 버전을 만들지
 * 않는다 — 글만 고치면 최신 버전을 그 자리에서 고치고, 그 버전이 공개 중이면 **사용자
 * 화면에 바로 반영된다**(#33). 관리자가 그걸 모르고 공개된 지문을 고치면 안 되므로,
 * 저장 응답의 `versionNo`·`status`로 어느 경우였는지 알려 준다.
 */
export function savedVersionNotice(
  saved: { versionNo: number; status: ProblemVersionStatus },
  /** 저장 전 상태. 새로 만든 문제면 null이다. */
  before: { latestVersionNo: number; publishedVersionNo: number | null } | null,
): string {
  if (before === null) return `문제를 만들었어요. 초안 v${saved.versionNo}입니다`

  if (saved.status === 'PUBLISHED') {
    return `공개 중인 v${saved.versionNo}에 바로 반영했어요. 사용자 화면에 지금 보여요`
  }

  if (saved.versionNo > before.latestVersionNo) {
    const published = before.publishedVersionNo
    const made = `채점 기준이 바뀌어 새 초안 v${saved.versionNo}을 만들었어요`
    return published === null ? made : `${made}. 공개하기 전까지 사용자는 v${published}를 풀어요`
  }

  // 내렸던 버전을 그 자리에서 고친 경우다. '초안'이라고 하면 없는 초안이 있는 것처럼
  // 알리게 된다 — 공개를 내린 버전이라 사용자에게는 보이지 않는다.
  if (saved.status === 'RETIRED') {
    return `비공개 상태인 v${saved.versionNo}에 저장했어요. 사용자에게는 보이지 않아요`
  }

  return `초안 v${saved.versionNo}에 저장했어요`
}

/**
 * 정답 코드 하나의 검증 상태 (ADM-05).
 *
 * `JUDGE_ERROR`를 '검증 실패'로 적지 않는다. 계약이 "채점이 실패해도(채점 불가)"를 따로
 * 둔 것은 코드가 틀린 게 아니라 채점 서버가 못 돌린 경우라서다 — '실패'로 적으면 멀쩡한
 * 코드를 뜯어보게 된다.
 */
export const SOLUTION_STATUS_LABEL: Record<SolutionStatus, string> = {
  NOT_VALIDATED: '검증 전',
  VALIDATING: '검증 중',
  PASSED: '검증 통과',
  FAILED: '검증 실패',
  JUDGE_ERROR: '채점 불가',
}

/**
 * 못 채운 공개 조건을 사람 말로 (ADM-06).
 *
 * 조건은 **서버가 세고 화면은 받아 적는다**(상세의 `unmetConditions`, 공개 거절 409의
 * `unmetConditions`). 그래서 여기에는 수치를 다시 적지 않는다 — 계약이 "2개 이상"을
 * 바꾸는 날 화면 문구와 실제 판정이 갈라진다. 무엇을 해야 하는지만 적는다.
 *
 * `tab`은 그 조건을 고칠 수 있는 탭이다. 조건만 보여 주고 고칠 곳을 알려 주지 않으면
 * 관리자가 네 탭을 뒤져야 한다.
 */
export const PUBLISH_CONDITION_LABEL: Record<
  PublishCondition,
  { text: string; tab: 'basic' | 'statement' | 'cases' | 'solutions'; tabLabel: string }
> = {
  SAMPLE_COUNT: { text: '공개 예제가 모자라요', tab: 'cases', tabLabel: '테스트케이스' },
  HIDDEN_COUNT: { text: '비공개 테스트케이스가 모자라요', tab: 'cases', tabLabel: '테스트케이스' },
  TAG_COUNT: { text: '개념 태그를 1~3개 골라 주세요', tab: 'basic', tabLabel: '기본 정보' },
  SOURCE: { text: '출처를 입력해 주세요', tab: 'basic', tabLabel: '기본 정보' },
  LANGUAGES: { text: 'Python·C++ 제한을 둘 다 설정해 주세요', tab: 'statement', tabLabel: '지문' },
  SOLUTIONS_VERIFIED: {
    text: 'Python·C++ 정답 코드가 둘 다 검증을 통과해야 해요',
    tab: 'solutions',
    tabLabel: '정답 코드',
  },
}

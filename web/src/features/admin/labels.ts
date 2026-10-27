import type { ProblemVersionStatus } from '@/api/types'

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

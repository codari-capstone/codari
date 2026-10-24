import type { SubmissionResult } from '@/api/types'

export interface NextAction {
  label: string
  /** 눌렀을 때 갈 곳. 없으면 아직 열 곳이 없다는 뜻이다. */
  to?: string
  /** 아직 못 여는 이유를 적는다. 그 기능을 만드는 이슈 번호다. */
  pendingIssue?: string
}

/**
 * 판정에 따른 다음 행동 (RES-07).
 *
 * 정답이면 [AI 리뷰]·[다음 문제], 오답이면 [다시 풀기]·[AI 분석]이다. `ACCEPTED`가
 * 아닌 판정은 모두 오답으로 본다 — 출력 형식이 틀린 것도 다시 풀어야 하는 것은 같다.
 *
 * **셋은 아직 열 곳이 없다.** AI 분석은 #41, AI 리뷰는 #42, 다음 문제 추천은 #44가
 * 만든다. 그래도 넷을 다 둔다 — RES-07의 핵심은 "판정에 따라 버튼이 달라진다"이고,
 * 되는 것만 넣으면 그 규칙을 지금 테스트로 고정할 수 없다. 그 이슈들이 끝나면 여기
 * `pendingIssue`를 `to`로 바꾸는 것이 연결의 전부다.
 *
 * 채점이 끝나지 않았거나 채점 불가면 빈 배열이다. 채점 불가의 재제출 버튼과 안내는
 * #32(RES-06)가 붙인다 — 그쪽이 "시도 횟수에 넣지 않는다"는 문구까지 함께 다룬다.
 */
export function nextActions(result: SubmissionResult): NextAction[] {
  if (result.verdict === null) return []

  if (result.verdict === 'ACCEPTED') {
    return [
      { label: 'AI 리뷰', pendingIssue: '#42' },
      { label: '다음 문제', pendingIssue: '#44' },
    ]
  }

  return [
    // 저장해 둔 코드가 그대로 열린다 (SOLVE-11).
    { label: '다시 풀기', to: `/problems/${result.problemId}` },
    { label: 'AI 분석', pendingIssue: '#41' },
  ]
}

import type { SubmissionResult } from '@/api/types'
import { solvePath } from '@/features/solve/solvePath'

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
 * 채점 불가는 서버 문제라 판정이 없다(계약: `verdict`가 null이고 시도 횟수에 넣지
 * 않는다). 다시 제출할 길만 준다 — 안내 문구는 `VERDICT_INFO.JUDGE_ERROR`가 가진다.
 * 결과 응답에는 제출한 코드가 없어서 이 자리에서 바로 다시 보낼 수는 없다. 풀이 화면으로
 * 돌려보내면 저장해 둔 코드가 그대로 열린다(SOLVE-11).
 *
 * 채점이 끝나지 않았으면 빈 배열이다 — 채점 중에 [다시 풀기]를 누르면 방금 보낸 제출의
 * 결과를 못 보게 된다.
 */
export function nextActions(result: SubmissionResult): NextAction[] {
  if (result.status === 'JUDGE_ERROR') {
    return [{ label: '다시 제출하기', to: `/problems/${result.problemId}` }]
  }
  if (result.verdict === null) return []

  if (result.verdict === 'ACCEPTED') {
    return [
      { label: 'AI 리뷰', pendingIssue: '#42' },
      { label: '다음 문제', pendingIssue: '#44' },
    ]
  }

  return [
    // 결과 화면의 제목 링크와 같은 주소를 쓴다 (solvePath).
    { label: '다시 풀기', to: solvePath(result.problemId, result.language) },
    { label: 'AI 분석', pendingIssue: '#41' },
  ]
}

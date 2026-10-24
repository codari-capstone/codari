import type { Verdict } from '@/api/types'

/**
 * 판정의 한글 이름 (RES-02).
 *
 * 백준 온라인 저지의 표기를 따른다 — 입문자가 다른 곳에서 본 이름과 같아야 검색이 된다
 * (`docs/AI_FEATURES.md` 10절).
 *
 * **쉬운 설명과 '먼저 확인해 볼 것'은 #32가 이 표에 더한다.** 문서에서 한 표인 것을
 * 파일 둘로 가르면 같은 키의 표가 두 벌이 되어 한쪽만 고쳐지는 날이 온다.
 */
export const VERDICT_LABEL: Record<Verdict, string> = {
  ACCEPTED: '맞았습니다!!',
  PRESENTATION_ERROR: '출력 형식이 잘못되었습니다',
  WRONG_ANSWER: '틀렸습니다',
  TIME_LIMIT_EXCEEDED: '시간 초과',
  MEMORY_LIMIT_EXCEEDED: '메모리 초과',
  OUTPUT_LIMIT_EXCEEDED: '출력 초과',
  RUNTIME_ERROR: '런타임 에러',
  COMPILE_ERROR: '컴파일 에러',
}

/**
 * 채점이 끝나기 전 상태 문구 (RES-01).
 *
 * `COMPLETED`는 여기 없다 — 그때는 판정이 자리를 차지한다. `JUDGE_ERROR`는 판정이 아니라
 * 서버 문제라서(계약: verdict가 null이고 시도 횟수에 넣지 않는다) 판정 표가 아니라 이쪽에
 * 둔다. 그 화면의 안내와 재제출 버튼은 #32(RES-06)가 붙인다.
 */
export const STATUS_LABEL = {
  QUEUED: '기다리는 중',
  COMPILING: '채점 준비 중',
  RUNNING: '채점 중',
  JUDGE_ERROR: '채점 불가',
} as const

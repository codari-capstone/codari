import type { Difficulty, SolveStatus } from '@/api/provisional'

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  EASY: '쉬움',
  MEDIUM: '보통',
  HARD: '어려움',
}

/** PR #61의 LIST-01 문구를 그대로 쓴다. 이슈 #21 본문의 '시도함'이 아니다. */
export const SOLVE_STATUS_LABEL: Record<SolveStatus, string> = {
  SOLVED: '맞음',
  WRONG: '틀림',
  UNSOLVED: '안 품',
}

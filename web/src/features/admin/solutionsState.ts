import type { AdminSolution, Language, SolutionInput } from '@/api/types'
import { utf8Bytes } from './testCasesSchema'

/** 정답 코드 하나의 한도. 계약의 `SOURCE_TOO_LONG`과 같은 값이다(UTF-8 64KB). */
export const MAX_SOURCE_BYTES = 64 * 1024

/** 화면에 두는 순서. 계약이 `GET .../solutions`의 순서를 Python → C++로 정했다. */
export const SOLUTION_LANGUAGES = ['PYTHON', 'CPP'] as const satisfies readonly Language[]

/** 언어별 코드 한 벌. 없는 언어는 빈 칸이다. */
export type Codes = Record<Language, string>

/**
 * 서버 목록을 언어별 칸으로 옮긴다.
 *
 * 계약이 "정답 코드가 없는 언어는 목록에 없다"로 정했다. 그래서 빠진 언어를 빈 칸으로
 * 채운다 — 화면은 늘 두 칸을 보여 준다.
 */
export function toCodes(solutions: AdminSolution[]): Codes {
  const codes: Codes = { PYTHON: '', CPP: '' }
  for (const solution of solutions) codes[solution.language] = solution.sourceCode
  return codes
}

/**
 * 보낼 본문.
 *
 * 빈 칸도 **빼지 않고** 빈 문자열로 보낸다 — 계약이 "코드가 비어 있으면 그 언어의 정답
 * 코드를 지운다"로 받는다. 목록에서 빼면 지우라는 뜻이 사라져 옛 코드가 서버에 남는다.
 */
export function toBody(codes: Codes): SolutionInput[] {
  return SOLUTION_LANGUAGES.map((language) => ({ language, sourceCode: codes[language] }))
}

/** 64KB를 넘은 언어. 서버도 400으로 막지만, 저장을 눌러 보고 알게 하지 않는다. */
export function tooLongLanguages(codes: Codes): Language[] {
  return SOLUTION_LANGUAGES.filter((language) => utf8Bytes(codes[language]) > MAX_SOURCE_BYTES)
}

/** 공백뿐인 칸은 빈 칸으로 본다 — 계약이 그걸 '지운다'로 받으므로 서버가 세는 방식과 같다. */
function blank(code: string): string {
  return code.trim() === '' ? '' : code
}

/**
 * 저장한 것과 다른 언어.
 *
 * 두 가지에 쓴다. (1) 바뀐 게 없는 저장을 '반영했어요'로 알리지 않는 데 — 계약이 "보낸
 * 코드가 최신 버전과 똑같으면 아무것도 바꾸지 않는다"로 정했다. (2) **고친 코드 옆의
 * 검증 표시가 거짓이 되지 않게** 하는 데. 통과한 코드를 고치면 'PASSED'는 더 이상 칸에
 * 든 코드의 상태가 아니다.
 */
export function changedLanguages(codes: Codes, saved: AdminSolution[]): Language[] {
  const savedCodes = toCodes(saved)
  return SOLUTION_LANGUAGES.filter(
    (language) => blank(codes[language]) !== blank(savedCodes[language]),
  )
}

/**
 * 보낸 것과 같은 칸만 덮어쓰기 층에서 걷어 낸다.
 *
 * 저장이 도는 동안 더 친 글자는 서버로 가지 않았다. 층을 통째로 비우면 그 입력이 안내도
 * 없이 사라지고, 화면은 방금 저장한 값으로 돌아간다.
 */
export function dropSubmitted(edited: Partial<Codes>, body: SolutionInput[]): Partial<Codes> {
  const next = { ...edited }
  for (const item of body) {
    if (next[item.language] === item.sourceCode) delete next[item.language]
  }
  return next
}

import type { Language } from '@/api/types'

/**
 * 문제·언어별 임시 저장 키 (SOLVE-11).
 *
 * 언어를 키에 넣는다. 같은 문제를 Python으로 쓰다 C++로 바꿔도 각각 남아 있어야 한다
 * (화면의 언어별 코드 보관과 같은 규칙).
 */
export function savedCodeKey(problemId: number, language: Language): string {
  return `solve:${problemId}:${language}`
}

/**
 * 저장된 코드. 없으면 null.
 *
 * 사생활 보호 모드나 사이트 데이터가 막힌 브라우저에서는 접근 자체가 던진다 — 그때는
 * 저장이 없던 것으로 보고 시작 코드로 연다 (theme.ts의 readStoredTheme과 같은 처리).
 */
export function readSavedCode(problemId: number, language: Language): string | null {
  try {
    return localStorage.getItem(savedCodeKey(problemId, language))
  } catch {
    return null
  }
}

export function storeSavedCode(problemId: number, language: Language, code: string): void {
  try {
    localStorage.setItem(savedCodeKey(problemId, language), code)
  } catch {
    // 저장이 안 되면 이 방문에만 남는다. 화면은 그대로 동작한다. 용량이 찼을 때도
    // 여기로 온다 — 다른 문제의 저장을 지우러 나서지 않는다. 지울 것을 고르는 규칙이
    // 틀리면 사용자가 쓰던 코드를 우리가 지우는 셈이 된다.
  }
}

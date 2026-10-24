import type { Language } from '@/api/types'

/** 이 기능이 쓰는 모든 키의 앞머리. 로그아웃이 이걸로 골라 지운다. */
const PREFIX = 'solve:'

/**
 * 사용자·문제·언어별 임시 저장 키 (SOLVE-11).
 *
 * **사용자가 키에 들어가야 한다.** 없으면 공용 PC에서 A가 쓴 코드가 B의 에디터에 열리고,
 * B가 한 글자만 쳐도 A의 저장본이 덮어써진다. 로그아웃은 react-query 캐시만 비우므로
 * (useLogout) 저장소는 그 경로로 정리되지 않고, 세션이 조용히 끊긴 경우에는 로그아웃을
 * 거치지도 않는다 — 지우는 것만으로는 부족하고 키가 갈려 있어야 한다.
 *
 * 언어도 키에 들어간다. 같은 문제를 Python으로 쓰다 C++로 바꿔도 각각 남아야 한다.
 */
export function savedCodeKey(userId: number, problemId: number, language: Language): string {
  return `${PREFIX}${userId}:${problemId}:${language}`
}

/**
 * 저장된 코드. 없으면 null.
 *
 * `userId`가 없으면(세션을 아직 모르거나 비로그인) 읽지 않는다. 누구의 것인지 모르는
 * 저장본을 여는 것이 바로 위 주석이 막으려는 유출이다.
 *
 * 사생활 보호 모드나 사이트 데이터가 막힌 브라우저에서는 접근 자체가 던진다 — 그때는
 * 저장이 없던 것으로 보고 시작 코드로 연다 (theme.ts의 readStoredTheme과 같은 처리).
 */
export function readSavedCode(
  userId: number | undefined,
  problemId: number,
  language: Language,
): string | null {
  if (userId === undefined) return null
  try {
    return localStorage.getItem(savedCodeKey(userId, problemId, language))
  } catch {
    return null
  }
}

export function storeSavedCode(
  userId: number | undefined,
  problemId: number,
  language: Language,
  code: string,
): void {
  if (userId === undefined) return
  try {
    localStorage.setItem(savedCodeKey(userId, problemId, language), code)
  } catch {
    // 저장이 안 되면 이 방문에만 남는다. 화면은 그대로 동작한다. 용량이 찼을 때도
    // 여기로 온다 — 다른 문제의 저장을 지우러 나서지 않는다. 지울 것을 고르는 규칙이
    // 틀리면 사용자가 쓰던 코드를 우리가 지우는 셈이 된다.
  }
}

/**
 * 저장된 코드를 전부 지운다. 로그아웃이 부른다.
 *
 * 키에 사용자가 들어가 있어 B가 A의 코드를 볼 일은 없지만, 로그아웃은 "이 사람의
 * 데이터를 전부 잊는다"는 뜻이다(useLogout 주석). 공용 컴퓨터에서 로그아웃한 사람의
 * 코드가 디스크에 남아 있으면 그 약속이 사실이 아니게 된다.
 *
 * 지우기 전에 키를 다 모은다. 지우면서 순회하면 인덱스가 밀려 건너뛰는 키가 생긴다.
 */
export function clearSavedCode(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(PREFIX)) keys.push(key)
    }
    for (const key of keys) localStorage.removeItem(key)
  } catch {
    // 저장소를 못 읽는 브라우저에는 지울 것도 없다.
  }
}

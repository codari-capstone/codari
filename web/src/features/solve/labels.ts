import type { Language } from '@/api/types'

export const LANGUAGE_LABEL: Record<Language, string> = {
  PYTHON: 'Python',
  CPP: 'C++',
}

/**
 * 시간 제한 문구. 1500ms는 '1.5초'다.
 *
 * 밀리초를 그대로 보여 주지 않는다 — 제한은 사용자가 체감하는 값이고, 입문자에게
 * '2000ms'는 '2초'보다 멀다. 나누어 떨어지지 않는 값은 소수점이 그대로 남는다.
 */
export function formatTimeLimit(timeLimitMs: number): string {
  return `${timeLimitMs / 1000}초`
}

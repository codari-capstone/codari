/**
 * 로그인 후 돌아갈 주소. 사이트 안 경로만 허용한다.
 *
 * state.from을 그대로 navigate에 넘기면 '//evil.com'이나 'https://evil.com'이
 * 외부로 보내는 통로(open redirect)가 된다. state에 무엇이 들어 있을지 이 함수는
 * 보장할 수 없으므로 값을 믿지 않고 모양을 검사한다.
 */
export function safeRedirect(from: unknown): string {
  if (typeof from !== 'string') return '/problems'
  if (!from.startsWith('/')) return '/problems'
  if (from.startsWith('//')) return '/problems'
  return from
}

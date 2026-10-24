/**
 * 주소에 든 번호. 1 이상의 안전 정수가 아니면 null이다.
 *
 * 문제 번호와 제출 번호가 같은 규칙을 쓴다. 각 화면에 한 벌씩 두었더니 본문이 같은 함수가
 * 둘이 되어, 한쪽의 상한이나 0 처리만 바뀌면 다른 주소는 옛 규칙으로 검사된다.
 *
 * 서버는 정수가 아닌 값에 400을, 없는 번호에 404를 준다. 사용자에게는 둘 다 "없는 것"과
 * 같은 일이므로, 보낼 필요가 없는 요청은 보내지 않고 화면이 바로 404 문구로 끝낸다.
 *
 * 위쪽도 막는다. `1e300`은 정수 검사를 통과하지만 서버의 `long id`가 바인딩하지 못해
 * 400이 되고, 화면에는 오류만 남는다. JS가 정확히 셀 수 있는 정수까지만 받는다.
 */
export function parsePathId(value: string | undefined): number | null {
  if (value === undefined) return null
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > Number.MAX_SAFE_INTEGER) return null
  return parsed
}

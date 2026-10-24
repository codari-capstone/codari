/**
 * 실패한 응답을 화면이 읽을 수 있는 모양으로 던진다.
 *
 * 본문을 펼쳐 code·detail을 그대로 싣고, status는 HTTP 상태로 덮는다. RFC 9457의 멤버는
 * 모두 선택이라 본문의 status가 빠져 올 수 있고, 그러면 화면이 상태로 가르는 분기를 잃는다.
 * 본문이 없거나 객체가 아니면 status만 올린다.
 *
 * 전에는 features/auth/authQuery.ts에 같은 코드가 한 벌 더 있었다. 임시 계약을 쓰는 쪽이라
 * 따로 두었는데, COM-04에서 세션 모델을 계약에 맞추며 이 모듈로 모았다 — 이제 한 벌뿐이다.
 */
export function fail(result: { error?: unknown; response: Response }): never {
  if (typeof result.error === 'object' && result.error !== null) {
    throw { ...result.error, status: result.response.status }
  }
  throw { status: result.response.status }
}

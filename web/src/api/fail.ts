/**
 * 실패한 응답을 화면이 읽을 수 있는 모양으로 던진다.
 *
 * 본문을 펼쳐 code·detail을 그대로 싣고, status는 HTTP 상태로 덮는다. RFC 9457의 멤버는
 * 모두 선택이라 본문의 status가 빠져 올 수 있고, 그러면 화면이 상태로 가르는 분기를 잃는다.
 * 본문이 없거나 객체가 아니면 status만 올린다.
 *
 * features/auth/authQuery.ts와 features/problems/problemsQuery.ts에 같은 코드가 한 벌씩
 * 더 있다. 그 둘은 임시 계약(provisionalApi)을 쓰는 쪽이라, 생성 타입으로 옮기는 COM-04
 * 작업에서 이 모듈로 함께 모은다. 지금 옮기면 이 PR의 범위를 넘는다.
 */
export function fail(result: { error?: unknown; response: Response }): never {
  if (typeof result.error === 'object' && result.error !== null) {
    throw { ...result.error, status: result.response.status }
  }
  throw { status: result.response.status }
}

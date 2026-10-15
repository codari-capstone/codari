import { toUserMessage, type ProblemDetail } from '@/constants/errors'

/**
 * 던져진 오류에서 RFC 9457의 code를 꺼낸다.
 *
 * authQuery.ts의 fail()이 본문을 펼쳐 던지므로 code가 그대로 실려 온다.
 * 네트워크 오류처럼 본문이 없는 경우도 있어 모든 단계를 확인한다.
 */
export function problemCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const code = (error as ProblemDetail).code
  return typeof code === 'string' ? code : undefined
}

/**
 * 화면에 보여 줄 문구. 서버의 detail을 그대로 쓴다.
 *
 * 가입·재설정의 오류 코드는 열두 가지이고 서버가 각각에 한국어 문구를 담아 준다
 * (contracts/openapi.yaml: "detail은 화면에 그대로 보여 줄 문구다"). 그 문구를 화면에도
 * 적으면 같은 문장이 두 곳이 되어 서버가 다듬는 날 갈라진다.
 *
 * detail이 없거나 비어 있으면 toUserMessage의 상태별 문구로 떨어진다.
 */
export function problemMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const detail = (error as ProblemDetail).detail
    if (typeof detail === 'string' && detail.trim().length > 0) return detail
  }
  return toUserMessage(error).description
}

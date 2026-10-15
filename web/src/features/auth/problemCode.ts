import { toUserMessage, type ProblemDetail } from '@/constants/errors'

/**
 * 던져진 오류에서 RFC 9457의 code를 꺼낸다.
 *
 * api/fail.ts의 fail()이 본문을 펼쳐 던지므로 code가 그대로 실려 온다
 * (authQuery.ts와 problemsQuery.ts에 같은 코드가 한 벌씩 남아 있다).
 * 네트워크 오류처럼 본문이 없는 경우도 있어 모든 단계를 확인한다.
 */
export function problemCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const code = (error as ProblemDetail).code
  return typeof code === 'string' ? code : undefined
}

/**
 * 화면에 보여 줄 문구. code가 있는 오류에서만 서버의 detail을 그대로 쓴다.
 *
 * 계약 오류는 항상 code를 달고 오고, code 없는 응답(특히 5xx)의 detail에는 예외 클래스명·SQL
 * 조각 같은 내부 정보가 담겨 올 수 있어 사용자에게 보이지 않는다. 상태가 아니라 code로 가르는
 * 까닭은 MAIL_FAILED가 503이면서 사용자용 문구를 담기 때문이다.
 *
 * 가입·재설정의 오류 코드마다 서버가 한국어 문구를 담아 준다
 * (contracts/openapi.yaml: "detail은 화면에 그대로 보여 줄 문구다"). 그 문구를 화면에도
 * 적으면 같은 문장이 두 곳이 되어 서버가 다듬는 날 갈라진다.
 *
 * code가 없거나 detail이 없거나 비어 있으면 toUserMessage의 상태별 문구로 떨어진다.
 */
export function problemMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const detail = (error as ProblemDetail).detail
    if (
      problemCode(error) !== undefined &&
      typeof detail === 'string' &&
      detail.trim().length > 0
    ) {
      return detail
    }
  }
  return toUserMessage(error).description
}

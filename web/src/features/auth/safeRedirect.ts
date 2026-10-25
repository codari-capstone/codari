/**
 * 로그인 후 돌아갈 주소. 사이트 안 경로만 허용한다.
 *
 * state.from에 '//evil.com'이나 'https://evil.com'이 들어 있을 수 있다. 이를 그대로
 * navigate에 넘기면 사이트 밖으로 향하는 주소(open redirect)가 된다. React Router가 막아
 * 주는지는 버전에 달려 있으므로 거기에 기대지 않는다. state에 무엇이 들어 있을지 이 함수는
 * 보장할 수 없으므로 값을 믿지 않고 검사한다.
 *
 * 앞부분의 모양을 먼저 거른다: 경로가 아닌 값, '//'(프로토콜 상대), 그리고 브라우저가 '/'처럼
 * 읽는 '/\'. 그러나 위험한 접두사를 하나하나 나열하는 방식은 믿을 것이 못 된다. URL 파서는
 * 탭·개행을 지우고('/\t/evil.com'은 'http://evil.com/'이 된다) 그 밖에도 예상 못 한 변형이
 * 있을 수 있다. 그래서 마지막에 현재 origin 기준으로 풀어 보고 origin이 그대로인 값만 통과시킨다.
 *
 * 사이트 안이어도 로그인 화면들은 거부한다. 헤더의 로그인 버튼이 지금 주소를 from에
 * 실으므로(AppHeader.tsx), 로그인 화면에서 그 버튼을 누르면 그 주소가 그대로 들어온다. 그
 * 값을 쓰면 로그인 화면이 자기 자신으로 이동한다.
 *
 * '/login' 하나만 거르면 안 된다 — COM-02가 '/login/github'를 형제로 더했다. 거기서 헤더의
 * 로그인을 누르면 from이 '/login/github?result=signup'이 되고, 로그인에 성공해도 그 콜백
 * 화면으로 되돌아간다. 그 화면은 새 왕복의 증명서와 짝이 맞지 않아 VERIFICATION_EXPIRED를
 * 받고, 그때는 이미 로그인 상태라 로그인 화면이 문구를 보여 주기 전에 다시 target으로
 * 넘겨 버린다 — 설명 없는 왕복이 된다. 그래서 '/login' 아래 전부를 거른다.
 */
export function safeRedirect(from: unknown): string {
  if (typeof from !== 'string') return '/problems'
  if (!from.startsWith('/')) return '/problems'
  if (from.startsWith('//') || from.startsWith('/\\')) return '/problems'
  if (!staysOnOrigin(from)) return '/problems'
  if (isLoginPath(from)) return '/problems'
  return from
}

function staysOnOrigin(path: string): boolean {
  try {
    return new URL(path, window.location.origin).origin === window.location.origin
  } catch {
    return false
  }
}

/** 쿼리·해시를 떼고 경로만 본다. '/login?x=1'과 '/login/github'도 로그인 화면이다. */
function isLoginPath(path: string): boolean {
  try {
    const { pathname } = new URL(path, window.location.origin)
    return pathname === '/login' || pathname.startsWith('/login/')
  } catch {
    return false
  }
}

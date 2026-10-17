import { http, HttpResponse, type RequestHandler } from 'msw'

import {
  DIFFICULTY_RANK,
  type Difficulty,
  type LoginRequest,
  type SolveStatus,
} from '@/api/provisional'
import { EMAIL_PATTERN, isValidNickname, isValidPassword } from '@/features/auth/accountRules'
import {
  invalidateToken,
  isSignedUp,
  markCodeSent,
  markSignedUp,
  tokenEmail,
  verifyMockCode,
  type VerifyResult,
} from './fixtures/emailCodes'
import { conceptTags, problems } from './fixtures/problems'
import { mockAccounts, SESSION_COOKIE } from './fixtures/users'

/** 인증번호 오류의 문구. 실제 서버(EmailCodeService.java)의 문구와 같게 맞춘다. */
const CODE_DETAIL: Record<Extract<VerifyResult, { ok: false }>['code'], string> = {
  CODE_EXPIRED: '인증번호가 만료됐어요. 인증번호를 다시 받아 주세요',
  CODE_MISMATCH: '인증번호가 맞지 않아요',
  CODE_ATTEMPTS_EXCEEDED: '입력 횟수를 초과했어요. 인증번호를 다시 받아 주세요',
}

/** 오류 응답. 실제 서버의 RFC 9457 본문과 같은 자리에 code와 detail을 둔다. */
function problem(status: number, code: string, detail: string) {
  return HttpResponse.json({ status, code, detail }, { status })
}

/**
 * 잘못된 쿼리 응답. 서버는 ResponseStatusException으로 주므로 code 없이 detail만 있다
 * (ProblemController.badRequest) — code를 붙이면 목에만 있는 분기가 생긴다.
 */
function badRequest(detail: string) {
  return HttpResponse.json({ status: 400, title: 'Bad Request', detail }, { status: 400 })
}

/** 한 페이지의 최대 개수. 서버 ProblemController.MAX_PAGE_SIZE와 같은 값이다. */
const MAX_PAGE_SIZE = 20

/** 비로그인·인증 실패 응답. ErrorState가 읽는 RFC 9457 모양으로 맞춘다. */
function unauthorized() {
  return HttpResponse.json({ status: 401, title: 'Unauthorized' }, { status: 401 })
}

/**
 * MSW 가짜 응답. 명세(#2)가 확정되면 응답 형태를 실제 명세에 맞춘다.
 *
 * 걸러내기와 정렬을 여기서 한다. 실제 API(#25 PROBLEM-002)가 서버 측 검색·필터이므로
 * 화면이 받은 걸 그리기만 하게 두어야, API가 붙는 날 화면 코드를 고치지 않는다.
 *
 * 경로를 '*\/api/...'로 쓰는 이유: baseUrl이 window.location.origin이고 그 값이
 * 개발 서버와 jsdom에서 다르다. 와일드카드로 두면 양쪽에서 같은 핸들러가 걸린다.
 */
export const handlers: RequestHandler[] = [
  http.get('*/api/concept-tags', () => HttpResponse.json(conceptTags)),

  http.get('*/api/problems', ({ request }) => {
    const query = new URL(request.url).searchParams

    const keyword = query.get('keyword')?.trim() ?? ''
    const difficulties = query.getAll('difficulty') as Difficulty[]
    const tags = query.getAll('tag')
    const statuses = query.getAll('status') as SolveStatus[]
    const [field, direction] = (query.get('sort') ?? 'id,asc').split(',')

    const matched = problems.filter((problem) => {
      if (keyword && !problem.title.includes(keyword)) return false
      if (difficulties.length > 0 && !difficulties.includes(problem.difficulty)) return false
      if (tags.length > 0 && !problem.tags.some((tag) => tags.includes(tag.slug))) return false
      // 이 핸들러는 인증을 모른다(의도된 선택이다). 그래서 비로그인 요청에서도 status를
      // 그대로 걸러 낸다. contracts/problems-list-proposal.md는 실제 서버가 비로그인 요청의
      // status를 무시하고 전체 목록을 주도록 요청한다. 즉 이 동작은 그 점에서 명세가 아니다 —
      // mock을 근거로 "비로그인도 status로 걸러진다"고 읽지 말 것. 로그인 사용자의 동작만 모사한다.
      if (statuses.length > 0) {
        if (!problem.solveStatus || !statuses.includes(problem.solveStatus)) return false
      }
      return true
    })

    // 난이도는 DIFFICULTY_RANK로 정렬한다. 문자열 비교는 EASY, HARD, MEDIUM이 된다.
    const sorted = [...matched].sort((a, b) =>
      field === 'difficulty'
        ? DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty]
        : a.id - b.id,
    )
    if (direction === 'desc') sorted.reverse()

    // 계약대로 항상 페이지로 나눈다 — page 기본 0, size 기본 20(최대 20). 마지막 페이지를
    // 넘는 page는 오류가 아니라 빈 content이고, 화면이 그걸 보고 마지막 페이지로 되돌린다.
    // totalElements는 자르기 전 전체 개수다("페이지와 상관없이 조건에 맞는 문제 수").
    const page = Number(query.get('page') ?? 0)
    const size = Number(query.get('size') ?? MAX_PAGE_SIZE)
    // 서버(ProblemController)와 같은 자리에서 400을 준다. 여기서 받아 주면 size=100이나
    // size=abc로도 통과하는 테스트가 생기고, 그 테스트는 실제 서버에서 깨진다.
    if (
      !Number.isInteger(page) ||
      page < 0 ||
      !Number.isInteger(size) ||
      size < 1 ||
      size > MAX_PAGE_SIZE
    ) {
      return badRequest(`page는 0 이상, size는 1~${MAX_PAGE_SIZE}이다`)
    }

    return HttpResponse.json({
      content: sorted.slice(page * size, page * size + size),
      totalElements: sorted.length,
    })
  }),

  http.get('*/api/me', ({ cookies }) => {
    const account = mockAccounts.find((item) => String(item.user.id) === cookies[SESSION_COOKIE])
    return account ? HttpResponse.json(account.user) : unauthorized()
  }),

  // 목이 로그인 실패 횟수를 세지 않는다. 시도 제한(COM-07)은 서버가 센다(PR #87).
  // 429가 필요한 테스트는 server.use로 이 핸들러를 덮어쓴다.
  http.post('*/api/auth/login', async ({ request }) => {
    const { email, password } = (await request.json()) as LoginRequest
    const account = mockAccounts.find(
      (item) => item.email === email.trim() && item.password === password,
    )
    if (!account) return unauthorized()

    // HttpResponse(= msw의 클래스)여야 한다. 평범한 Response로는 쿠키가 저장되지 않는다 —
    // msw는 생성 시점에 init.headers의 set-cookie를 심볼로 옮겨 두고 그것만 항아리에 넣는다.
    return HttpResponse.json(account.user, {
      headers: { 'Set-Cookie': `${SESSION_COOKIE}=${account.user.id}; Path=/; SameSite=Lax` },
    })
  }),

  http.post('*/api/auth/logout', () => {
    return new HttpResponse(null, {
      status: 204,
      headers: { 'Set-Cookie': `${SESSION_COOKIE}=; Path=/; Max-Age=0` },
    })
  }),

  // --- 회원가입 (COM-06) ---

  http.post('*/api/auth/signup/email-code', async ({ request }) => {
    const email = ((await request.json()) as { email: string }).email.trim()
    if (!EMAIL_PATTERN.test(email)) {
      return problem(400, 'INVALID_EMAIL', '이메일 형식이 올바르지 않아요')
    }
    // 계약은 발송 단계에서 이미 가입된 이메일을 거른다. isSignedUp까지 봐야 목에서
    // 가입을 마친 주소가 다시 발송·인증·닉네임 확인을 통과한 뒤 마지막에야 409를 받는 일이 없다.
    if (isSignedUp(email) || mockAccounts.some((item) => item.email === email)) {
      return problem(409, 'EMAIL_TAKEN', '이미 가입된 이메일이에요')
    }
    markCodeSent('SIGNUP', email)
    return new HttpResponse(null, { status: 204 })
  }),

  http.post('*/api/auth/signup/email-code/verify', async ({ request }) => {
    const body = (await request.json()) as { email: string; code: string }
    const email = body.email.trim()
    const { code } = body
    if (!EMAIL_PATTERN.test(email)) {
      return problem(400, 'INVALID_EMAIL', '이메일 형식이 올바르지 않아요')
    }
    const result = verifyMockCode('SIGNUP', email, code)
    if (!result.ok) return problem(400, result.code, CODE_DETAIL[result.code])
    return HttpResponse.json({ verificationToken: result.token })
  }),

  http.get('*/api/auth/nickname-availability', ({ request }) => {
    const nickname = new URL(request.url).searchParams.get('nickname') ?? ''
    if (!isValidNickname(nickname)) {
      return problem(400, 'INVALID_NICKNAME', '닉네임은 2~16자의 한글·영문·숫자만 쓸 수 있어요')
    }
    // 대소문자를 구분하지 않는다 ('Alice'와 'alice'는 같은 닉네임).
    const taken = mockAccounts.some(
      (item) => item.user.nickname.toLowerCase() === nickname.toLowerCase(),
    )
    return HttpResponse.json({ available: !taken })
  }),

  http.post('*/api/auth/signup', async ({ request }) => {
    const body = (await request.json()) as {
      verificationToken?: unknown
      nickname?: string
      password?: string
      passwordConfirm?: string
    }
    const signupEmail = tokenEmail(body.verificationToken, 'SIGNUP')
    if (signupEmail === null) {
      return problem(
        400,
        'VERIFICATION_EXPIRED',
        '인증 시간이 지났어요. 이메일을 다시 인증해 주세요',
      )
    }
    if (!isValidNickname(body.nickname ?? '')) {
      return problem(400, 'INVALID_NICKNAME', '닉네임은 2~16자의 한글·영문·숫자만 쓸 수 있어요')
    }
    if (
      mockAccounts.some(
        (item) => item.user.nickname.toLowerCase() === (body.nickname ?? '').toLowerCase(),
      )
    ) {
      return problem(409, 'NICKNAME_TAKEN', '이미 사용 중인 닉네임이에요')
    }
    if (!isValidPassword(body.password ?? '')) {
      return problem(
        400,
        'INVALID_PASSWORD',
        '비밀번호는 10~20자이고 영문 대문자·소문자·숫자·특수문자를 각각 하나 이상 넣어야 해요',
      )
    }
    if (body.password !== body.passwordConfirm) {
      return problem(400, 'PASSWORD_MISMATCH', '비밀번호가 일치하지 않아요')
    }
    if (isSignedUp(signupEmail) || mockAccounts.some((item) => item.email === signupEmail)) {
      return problem(409, 'EMAIL_TAKEN', '이미 가입된 이메일이에요')
    }
    markSignedUp(signupEmail)
    // 토큰은 닳지 않는다(계약 #108). 가입시키지 않는다 — 계약이 204만 주고 토큰을 주지 않는다. 목도 계정을 늘리지 않는다.
    return new HttpResponse(null, { status: 204 })
  }),

  // --- 비밀번호 재설정 (COM-08) ---

  http.post('*/api/auth/password-reset/email-code', async ({ request }) => {
    const email = ((await request.json()) as { email: string }).email.trim()
    if (!EMAIL_PATTERN.test(email)) {
      return problem(400, 'INVALID_EMAIL', '이메일 형식이 올바르지 않아요')
    }
    if (!mockAccounts.some((item) => item.email === email)) {
      return problem(
        404,
        'EMAIL_NOT_FOUND',
        '가입되지 않은 이메일이에요. 이메일을 정확히 입력해 주세요',
      )
    }
    markCodeSent('RESET', email)
    return new HttpResponse(null, { status: 204 })
  }),

  http.post('*/api/auth/password-reset/email-code/verify', async ({ request }) => {
    const body = (await request.json()) as { email: string; code: string }
    const email = body.email.trim()
    const { code } = body
    if (!EMAIL_PATTERN.test(email)) {
      return problem(400, 'INVALID_EMAIL', '이메일 형식이 올바르지 않아요')
    }
    const result = verifyMockCode('RESET', email, code)
    if (!result.ok) return problem(400, result.code, CODE_DETAIL[result.code])
    return HttpResponse.json({ resetToken: result.token })
  }),

  http.post('*/api/auth/password-reset', async ({ request }) => {
    const body = (await request.json()) as {
      resetToken?: unknown
      password?: string
      passwordConfirm?: string
    }
    const resetToken = body.resetToken
    if (typeof resetToken !== 'string' || tokenEmail(resetToken, 'RESET') === null) {
      return problem(400, 'RESET_EXPIRED', '인증 시간이 지났어요. 인증번호를 다시 받아 주세요')
    }
    if (!isValidPassword(body.password ?? '')) {
      return problem(
        400,
        'INVALID_PASSWORD',
        '비밀번호는 10~20자이고 영문 대문자·소문자·숫자·특수문자를 각각 하나 이상 넣어야 해요',
      )
    }
    if (body.password !== body.passwordConfirm) {
      return problem(400, 'PASSWORD_MISMATCH', '비밀번호가 일치하지 않아요')
    }
    // 필드 오류에서는 토큰이 남는다. 성공해야 닳는다(서버는 token_version을 올린다).
    invalidateToken(resetToken)
    return new HttpResponse(null, { status: 204 })
  }),
]

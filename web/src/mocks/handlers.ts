import { http, HttpResponse, type RequestHandler } from 'msw'

import type { LoginRequest } from '@/api/provisional'
import { DIFFICULTY_RANK, type Difficulty, type SolveStatus } from '@/api/types'
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
import { problemDetails } from './fixtures/problemDetails'
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

/** 코드 길이 한도. 계약의 SOURCE_TOO_LONG과 같은 값이다(UTF-8 64KB). */
const MAX_SOURCE_BYTES = 64 * 1024

/** 제출 번호. */
let nextSubmissionId = 1

interface MockSubmission {
  problemId: number
  problemTitle: string
  language: 'PYTHON' | 'CPP'
  submittedAt: string
  /** 몇 번 조회됐는지. 조회할 때마다 채점이 한 걸음씩 나아간다 — 아래 핸들러 주석. */
  polls: number
  /** 끝났을 때 줄 판정. 제출할 때 정해 둔다. */
  verdict: 'ACCEPTED' | 'WRONG_ANSWER'
}

const mockSubmissions = new Map<number, MockSubmission>()

/** 테스트 사이에 채점 진행이 새지 않게 비운다. 가입·재설정의 resetEmailCodes와 같은 쓰임이다. */
export function resetSubmissions(): void {
  mockSubmissions.clear()
  nextSubmissionId = 1
}

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

  /**
   * 문제 상세 (SOLVE-01~04·06).
   *
   * 없는 번호와 공개된 버전이 없는 문제를 서버가 같은 404로 답한다(계약: 공개 전 문제가
   * 있는지 드러내지 않는다). 목에는 비공개 문제가 없으니 "없는 번호"만 재현한다.
   *
   * 이 핸들러도 인증을 모른다. 실제 서버는 비로그인에 401을 주지만(계약), 목이 세션을
   * 보지 않는 것은 목록 핸들러와 같은 선택이다 — 화면은 RequireAuth 뒤에 있다.
   */
  http.get('*/api/problems/:id', ({ params }) => {
    const id = Number(params.id)
    // 정수가 아니면 서버의 `long id` 바인딩이 실패해 400이다. 없는 번호는 404다.
    // `1e300`은 Number.isInteger를 통과하지만 서버는 바인딩하지 못한다 — 목이 더
    // 관대하면 목에서만 통과하는 테스트가 생긴다.
    if (!Number.isSafeInteger(id)) return badRequest('id는 정수여야 한다')

    const detail = problemDetails.find((item) => item.id === id)
    if (!detail) return problem(404, 'PROBLEM_NOT_FOUND', '문제를 찾을 수 없어요')
    return HttpResponse.json(detail)
  }),

  /**
   * 코드 제출 (SOLVE-09).
   *
   * 검사 순서를 `SubmissionController.submit`과 똑같이 맞춘다: 빈 코드 → 길이 →
   * (NUL·problemId·language) → 없는 문제 → 미지원 언어. 순서가 어긋나면 같은 요청에
   * 목과 서버가 다른 code를 주고, 화면은 목에만 있는 분기를 믿게 된다.
   *
   * 접수만 하고 채점은 하지 않는다 — 계약도 202로 접수만 답한다. 제출 번호는 1부터
   * 세어 돌려준다(실제 서버의 번호와 모양만 같으면 된다).
   *
   * 세션을 보지 않는 것은 목록·상세 핸들러와 같은 선택이다 — 화면이 RequireAuth 뒤에 있다.
   */
  http.post('*/api/submissions', async ({ request }) => {
    const body = (await request.json()) as {
      problemId?: number
      language?: string
      sourceCode?: string
    }

    const language = body.language
    // 모르는 언어는 서버가 JSON을 읽는 단계에서 걸러 code 없는 400이 된다
    // (SubmissionController.SubmitRequest 주석). null은 여기 걸리지 않는다 — 서버에서도
    // 역직렬화는 되고 아래 빈 코드·길이 검사 뒤에 걸린다.
    if (language != null && language !== 'PYTHON' && language !== 'CPP') {
      return badRequest('language는 PYTHON 또는 CPP여야 한다')
    }

    const source = body.sourceCode
    // 서버는 빈 코드와 길이를 **먼저** 본다. NUL이 섞이고 64KB를 넘는 코드에 서버는
    // SOURCE_TOO_LONG을 주므로, NUL을 먼저 보면 목만 code 없는 400을 준다.
    if (source == null || source.trim() === '') {
      return problem(400, 'SOURCE_EMPTY', '코드를 입력해 주세요')
    }
    // 64KB는 UTF-8 바이트 기준이다(계약). 글자 수로 재면 한글이 섞인 주석에서 어긋난다.
    if (new TextEncoder().encode(source).length > MAX_SOURCE_BYTES) {
      return problem(400, 'SOURCE_TOO_LONG', '코드는 64KB까지 제출할 수 있어요')
    }
    // 화면이 정상적으로는 보낼 수 없는 값이라 서버도 code 없이 답한다. problemId가 없는
    // 요청도 여기서 끝난다 — 아래 find로 흘려보내면 목만 404 PROBLEM_NOT_FOUND를 준다.
    if (source.includes('\0') || body.problemId == null || language == null) {
      return badRequest('problemId·language·sourceCode를 확인해 주세요')
    }

    const detail = problemDetails.find((item) => item.id === body.problemId)
    if (!detail) return problem(404, 'PROBLEM_NOT_FOUND', '문제를 찾을 수 없어요')
    // 지금 fixture의 문제는 모두 두 언어를 지원해서 이 분기에 닿을 수 없다. 그래도
    // 남겨 둔다 — 서버에 있는 분기를 목에서 빼면 목이 계약을 덜 지키게 된다. 화면 쪽
    // 테스트는 이 응답을 server.use로 직접 돌려준다.
    if (!detail.languages.some((it) => it.language === language)) {
      return problem(
        400,
        'LANGUAGE_NOT_SUPPORTED',
        '이 문제는 그 언어를 지원하지 않아요. 새로고침하고 언어를 다시 골라 주세요',
      )
    }

    const id = nextSubmissionId++
    const starter = detail.languages.find((it) => it.language === language)?.starterCode ?? ''
    mockSubmissions.set(id, {
      problemId: detail.id,
      problemTitle: detail.title,
      language,
      submittedAt: new Date().toISOString(),
      polls: 0,
      // 시작 코드를 그대로 낸 제출은 아무것도 풀지 않았으니 틀린다. 손을 댔으면 맞는다 —
      // 목이 실제로 채점할 수는 없고, 정답·오답 두 화면(RES-07)을 사람이 손으로
      // 둘 다 볼 수 있어야 한다. 다른 판정은 테스트가 server.use로 직접 돌려준다.
      verdict: source.trim() === starter.trim() ? 'WRONG_ANSWER' : 'ACCEPTED',
    })
    return HttpResponse.json(
      { id },
      { status: 202, headers: { Location: `/api/submissions/${id}` } },
    )
  }),

  /**
   * 채점 상태·결과 (RES-01·02).
   *
   * **조회할 때마다 한 걸음 나아간다.** 한 번에 COMPLETED를 주면 폴링 화면을 사람도
   * 테스트도 볼 수 없다. 시간으로 진행시키지 않는 이유는 테스트가 시계에 매이지 않게
   * 하려는 것이다 — 폴링 횟수는 테스트가 통제할 수 있다.
   *
   * 없는 제출은 404 `SUBMISSION_NOT_FOUND`다. 계약은 남의 제출·예제 실행도 같은 404로
   * 답하라고 정했는데, 목은 세션을 보지 않아(목록·상세 핸들러와 같은 선택) 그 둘을
   * 구분하지 않는다.
   */
  http.get('*/api/submissions/:id', ({ params }) => {
    const id = Number(params.id)
    if (!Number.isSafeInteger(id)) return badRequest('id는 정수여야 한다')

    const found = mockSubmissions.get(id)
    if (!found) return problem(404, 'SUBMISSION_NOT_FOUND', '제출을 찾을 수 없어요')

    const step = found.polls++
    const base = {
      id,
      problemId: found.problemId,
      problemTitle: found.problemTitle,
      language: found.language,
      submittedAt: found.submittedAt,
      runtimeErrorType: null,
      runtimeErrorMessage: null,
      compilerMessage: null,
    }
    if (step === 0) {
      return HttpResponse.json({
        ...base,
        status: 'QUEUED',
        progress: 0,
        verdict: null,
        executionTimeMs: null,
        memoryUsedKb: null,
        judgedAt: null,
      })
    }
    if (step === 1) {
      return HttpResponse.json({
        ...base,
        status: 'COMPILING',
        progress: 0,
        verdict: null,
        executionTimeMs: null,
        memoryUsedKb: null,
        judgedAt: null,
      })
    }
    if (step === 2) {
      return HttpResponse.json({
        ...base,
        status: 'RUNNING',
        progress: 60,
        verdict: null,
        executionTimeMs: null,
        memoryUsedKb: null,
        judgedAt: null,
      })
    }
    return HttpResponse.json({
      ...base,
      status: 'COMPLETED',
      progress: 100,
      verdict: found.verdict,
      executionTimeMs: 128,
      memoryUsedKb: 31_204,
      judgedAt: new Date().toISOString(),
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

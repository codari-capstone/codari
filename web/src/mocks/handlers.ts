import { http, HttpResponse, type RequestHandler } from 'msw'

import type {
  AdminSolution,
  AdminTestCase,
  Language,
  LoginRequest,
  ProblemInput,
  SolutionInput,
  TestCaseInput,
} from '@/api/types'
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
import {
  adminDetail,
  adminSummary,
  adminVersion,
  buildAdminProblems,
  clearValidation,
  countCases,
  latestVersion,
  unmetConditions,
  passedCaseValidation,
  brokenTextConditions,
  versionSummary,
  type MockProblemVersion,
} from './fixtures/adminProblems'
import { problemDetails } from './fixtures/problemDetails'
import { conceptTags, problems } from './fixtures/problems'
import { mockAccessToken, mockAccounts, REFRESH_COOKIE, userIdFromToken } from './fixtures/users'

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

/** 테스트케이스 한도 (ADM-04). 계약의 `replaceTestCases` 설명과 같은 값이다. */
const MAX_CASES = 10
const MAX_INPUT_BYTES = 2 * 1024 * 1024
const MAX_OUTPUT_BYTES = 1024 * 1024
const MAX_TOTAL_BYTES = 10 * 1024 * 1024

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length
}

/** ZIP을 읽었을 때 돌려주는 케이스. 공개 2개·비공개 1개로 섞인 것을 보여 준다. */
const ZIP_CASES: TestCaseInput[] = [
  { caseType: 'SAMPLE', input: '1 2\n', output: '3\n' },
  { caseType: 'SAMPLE', input: '10 20\n', output: '30\n' },
  { caseType: 'HIDDEN', input: '100 200\n', output: '300\n' },
]

/**
 * 케이스 저장 본문 검사 (ADM-04). 한도를 넘으면 400 `TEST_CASE_LIMIT_EXCEEDED`다(계약).
 *
 * 화면도 저장 전에 같은 값으로 막지만, 여기서도 센다 — 화면 검사를 지우면 아무 데서도
 * 걸리지 않는 목이 된다.
 */
function checkTestCases(body: TestCaseInput[]) {
  if (body.length > MAX_CASES) {
    return problem(400, 'TEST_CASE_LIMIT_EXCEEDED', `케이스는 ${MAX_CASES}개까지예요`)
  }

  let total = 0
  for (const [index, item] of body.entries()) {
    const inputBytes = utf8Bytes(item.input)
    const outputBytes = utf8Bytes(item.output)
    if (inputBytes > MAX_INPUT_BYTES) {
      return problem(400, 'TEST_CASE_LIMIT_EXCEEDED', `${index + 1}번 입력이 2MiB를 넘어요`)
    }
    if (outputBytes > MAX_OUTPUT_BYTES) {
      return problem(400, 'TEST_CASE_LIMIT_EXCEEDED', `${index + 1}번 기대 출력이 1MiB를 넘어요`)
    }
    total += inputBytes + outputBytes
  }
  if (total > MAX_TOTAL_BYTES) {
    return problem(400, 'TEST_CASE_LIMIT_EXCEEDED', '모든 케이스의 합이 10MiB를 넘어요')
  }

  return null
}

/** 불러올 때의 케이스 한 줄. 바이트 수를 서버가 세어 준다(계약) — 화면은 세지 않는다. */
function adminTestCase(
  item: TestCaseInput,
  index: number,
  validation: MockProblemVersion['caseValidation'],
): AdminTestCase {
  return {
    ...item,
    inputBytes: utf8Bytes(item.input),
    outputBytes: utf8Bytes(item.output),
    // 기록이 없으면 null이 계약의 모양이다 — 검증 전이거나, 컴파일 에러·채점 불가로 이
    // 케이스를 실행하지 않은 경우다.
    validation: {
      PYTHON: validation?.PYTHON[index] ?? null,
      CPP: validation?.CPP[index] ?? null,
    },
  }
}

/** 코드 길이 한도. 계약의 SOURCE_TOO_LONG과 같은 값이다(UTF-8 64KB). */
const MAX_SOURCE_BYTES = 64 * 1024

/** 정답 코드 하나의 한도 (ADM-05). 제출 코드와 값은 같지만 다른 계약의 다른 상한이다. */
const MAX_SOLUTION_BYTES = 64 * 1024

/** 저장한 코드를 비교할 때 보는 것. 검증 상태는 비교에 넣지 않는다. */
function sourceOf(solution: AdminSolution | SolutionInput) {
  return { language: solution.language, sourceCode: solution.sourceCode }
}

/** 막 저장한 정답 코드. 저장은 실행하지 않으므로 늘 검증 전이다(계약). */
function newSolution(input: SolutionInput): AdminSolution {
  return {
    language: input.language,
    sourceCode: input.sourceCode,
    verifiedAt: null,
    status: 'NOT_VALIDATED',
    progress: 0,
    verdict: null,
    compilerMessage: null,
  }
}

/**
 * 검증을 한 걸음 진행시킨다. `GET .../solutions`를 부를 때마다 불린다.
 *
 * **성공 경로 하나만 둔다.** `FAILED`·`JUDGE_ERROR`·컴파일 에러는 목에 분기를 넣지 않고
 * 테스트에서 `server.use`로 꽂는다 — 목이 계약에 없는 규칙("3번 문제는 실패한다")을
 * 가지면 그 거짓말을 믿는 테스트가 생기고, 서버와 갈라져도 아무도 모른다.
 */
function advanceValidation(version: MockProblemVersion) {
  const progress = Math.min(100, (version.solutions[0]?.progress ?? 0) + 50)
  if (progress < 100) {
    version.solutions = version.solutions.map((solution) => ({ ...solution, progress }))
    return
  }

  version.status = 'DRAFT'
  version.caseValidation = passedCaseValidation(
    version.cases,
    version.solutions.map((solution) => solution.language),
  )
  version.solutions = version.solutions.map((solution) => ({
    ...solution,
    status: 'PASSED' as const,
    progress: 100,
    verdict: 'ACCEPTED' as const,
    verifiedAt: new Date().toISOString(),
  }))
}

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

/**
 * 관리자 문제 상태. 등록·수정 핸들러가 이 배열과 그 안의 버전을 고친다.
 *
 * 사용자 쪽 fixture(`problems`·`problemDetails`)와 달리 상수가 아니다. 상수로 두면
 * 한 테스트가 만든 문제가 다음 테스트의 목록 개수를 바꾼다.
 */
let adminProblems = buildAdminProblems()

/** 테스트 사이에 만든 문제·고친 버전이 새지 않게 처음 모양으로 되돌린다. */
export function resetAdminProblems(): void {
  adminProblems = buildAdminProblems()
}

/**
 * 채점 서버가 받는 제한값의 상한. `judge/README.md`의 `MAX_CPU_TIME_LIMIT`(20초)과
 * `MAX_MEMORY_LIMIT`(512MB)이다. 넘으면 서버가 `LIMIT_OUT_OF_RANGE`로 거절한다(계약).
 */
const MAX_TIME_LIMIT_MS = 20_000
const MIN_MEMORY_LIMIT_MB = 2
const MAX_MEMORY_LIMIT_MB = 512

/**
 * 등록·수정 본문 검사. 맞으면 null, 틀리면 응답을 돌려준다.
 *
 * 계약이 가른 두 묶음을 그대로 나눈다. **앞쪽 넷은 `code` 없는 400이다** — "화면이
 * 막으므로"라고 적힌 규칙이라 서버가 사용자 문구를 담지 않는다. 그래도 목이 검사하는
 * 까닭은, 화면에 구멍이 생기면 목에서도 막혀야 하기 때문이다. 뒤쪽 둘은 화면이 알 수
 * 없는 것이라 `code`와 문구가 온다.
 */
function checkProblemInput(body: ProblemInput) {
  if (body.title.trim() === '') return badRequest('제목은 공백뿐이면 안 된다')
  if (body.tags.length > 3) return badRequest('태그는 3개까지다')
  if (new Set(body.tags).size !== body.tags.length)
    return badRequest('같은 태그를 두 번 보낼 수 없다')
  if (body.sourceUrl !== null && !/^https?:\/\//.test(body.sourceUrl)) {
    return badRequest('sourceUrl은 http:// 또는 https://로 시작해야 한다')
  }
  const languages = body.languages.map((entry) => entry.language)
  if (new Set(languages).size !== languages.length) {
    return badRequest('같은 언어를 두 번 보낼 수 없다')
  }

  const outOfRange = body.languages.some(
    (entry) =>
      !Number.isInteger(entry.timeLimitMs) ||
      entry.timeLimitMs < 1 ||
      entry.timeLimitMs > MAX_TIME_LIMIT_MS ||
      !Number.isInteger(entry.memoryLimitMb) ||
      entry.memoryLimitMb < MIN_MEMORY_LIMIT_MB ||
      entry.memoryLimitMb > MAX_MEMORY_LIMIT_MB,
  )
  if (outOfRange) {
    return problem(
      400,
      'LIMIT_OUT_OF_RANGE',
      `시간 제한은 1~${MAX_TIME_LIMIT_MS}ms, 메모리 제한은 ${MIN_MEMORY_LIMIT_MB}~${MAX_MEMORY_LIMIT_MB}MB로 정해 주세요`,
    )
  }

  const unknown = body.tags.find((slug) => !conceptTags.some((tag) => tag.slug === slug))
  if (unknown !== undefined) {
    return problem(400, 'TAG_NOT_FOUND', `없는 개념 태그예요: ${unknown}`)
  }

  return null
}

/** 주소의 문제. 정수가 아니면 400, 없으면 404 `PROBLEM_NOT_FOUND`다(계약). */
function findAdminProblem(raw: string | readonly string[] | undefined) {
  const id = Number(raw)
  if (!Number.isSafeInteger(id)) return badRequest('id는 정수여야 한다')

  const found = adminProblems.find((item) => item.id === id)
  if (!found) return problem(404, 'PROBLEM_NOT_FOUND', '문제를 찾을 수 없어요')
  return found
}

/**
 * 언어별 시간·메모리 제한이 모두 같은지. **언어 목록까지 같아야 한다**(계약).
 *
 * 이 판정이 "그 자리에서 고치기"와 "새 초안 만들기"를 가른다. 시작 코드와 글은 보지
 * 않는다 — 채점 기준이 아니라서 새 버전을 만들 이유가 아니다(#33).
 */
function sameLimits(a: ProblemInput['languages'], b: ProblemInput['languages']): boolean {
  if (a.length !== b.length) return false
  return a.every((entry) => {
    const other = b.find((item) => item.language === entry.language)
    return (
      other !== undefined &&
      other.timeLimitMs === entry.timeLimitMs &&
      other.memoryLimitMb === entry.memoryLimitMb
    )
  })
}

/** 예제 실행 번호. 제출과 따로 센다 — 계약이 서로 404로 가리는 다른 자원이다. */
let nextSampleRunId = 1

interface MockSampleRun {
  problemId: number
  language: 'PYTHON' | 'CPP'
  submittedAt: string
  /** 몇 번 조회됐는지. 조회할 때마다 한 걸음 나아간다 — 아래 핸들러 주석. */
  polls: number
  /** 이 문제의 공개 예제 기대 출력. 실제 출력을 만들 때 쓴다. */
  expected: string[]
  /** 전부 통과시킬지. 접수할 때 정해 둔다 — 아래 핸들러 주석. */
  allPass: boolean
}

const mockSampleRuns = new Map<number, MockSampleRun>()

/** 테스트 사이에 실행 진행이 새지 않게 비운다 (resetSubmissions와 같은 쓰임). */
export function resetSampleRuns(): void {
  mockSampleRuns.clear()
  nextSampleRunId = 1
}

/**
 * 제출·예제 실행의 공용 요청 검사.
 *
 * 계약이 "예제 실행의 요청 본문과 오류는 코드 제출과 같다"고 정했다. 그래서 검사도 한
 * 벌만 둔다 — 두 벌이 되면 한쪽만 고쳐지는 날이 오고, 화면은 목에만 있는 분기를 믿게 된다.
 *
 * 순서를 `SubmissionController.submit`과 똑같이 맞춘다: 빈 코드 → 길이 →
 * (NUL·problemId·language) → 없는 문제 → 미지원 언어. 순서가 어긋나면 같은 요청에
 * 목과 서버가 다른 code를 준다.
 *
 * 통과하면 풀린 값을, 아니면 그대로 돌려줄 오류 응답을 준다.
 */
async function checkSourceBody(request: Request) {
  const body = (await request.json()) as {
    problemId?: number
    language?: string
    sourceCode?: string
  }

  const raw = body.language
  // 아는 언어만 추려 둔다. 타입을 적어 두는 것은 추론에 맡기면 돌려줄 때 string으로
  // 넓어지기 때문이다 — 함수 밖에서는 아래 검사들의 조합을 TS가 따라오지 못한다.
  const language: Language | undefined = raw === 'PYTHON' || raw === 'CPP' ? raw : undefined
  // 모르는 언어는 서버가 JSON을 읽는 단계에서 걸러 code 없는 400이 된다
  // (SubmissionController.SubmitRequest 주석). null은 여기 걸리지 않는다 — 서버에서도
  // 역직렬화는 되고 아래 빈 코드·길이 검사 뒤에 걸린다.
  if (raw != null && language === undefined) {
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

  return { detail, language, source }
}

/**
 * 예제 하나의 결과 한 칸.
 *
 * 아직 실행되지 않은 예제는 결과 값이 모두 null이다(계약: "실행 전인 예제도 있고 결과
 * 값이 null이다").
 */
function sampleCase(ordinal: number, expected: string, state: 'pending' | 'pass' | 'fail') {
  if (state === 'pending') {
    return {
      ordinal,
      actualOutput: null,
      verdict: null,
      errorMessage: null,
      executionTimeMs: null,
      memoryUsedKb: null,
    }
  }
  return {
    ordinal,
    // 틀린 출력은 기대와 **다르기만** 하면 된다. 사람이 두 상자를 나란히 보고 다르다는
    // 것을 알 수 있어야 해서 눈에 띄는 값을 쓴다.
    actualOutput: state === 'pass' ? expected : '0\n',
    verdict: state === 'pass' ? 'ACCEPTED' : 'WRONG_ANSWER',
    errorMessage: null,
    executionTimeMs: 8 + ordinal,
    memoryUsedKb: 3_200 + ordinal,
  }
}

/** `Authorization: Bearer <token>`에서 토큰만. 없으면 undefined. */
function bearer(request: Request): string | undefined {
  const header = request.headers.get('Authorization')
  return header?.startsWith('Bearer ') === true ? header.slice('Bearer '.length) : undefined
}

/**
 * 사용자별 access token 발급 번호. 갱신할 때마다 올라간다.
 *
 * 테스트 사이에 남으면 다음 테스트가 2번째 토큰부터 받는다 — resetSubmissions처럼 비운다.
 */
const issued = new Map<number, number>()

/** 테스트 사이에 세션 상태가 새지 않게 비운다. */
export function resetSessions(): void {
  issued.clear()
}

/**
 * 콜백이 심어 주는 가입 증명서 쿠키. 이름·path를 실제 서버와 같게 맞춘다
 * (GitHubLoginController.SIGNUP_COOKIE).
 */
const GITHUB_SIGNUP_COOKIE = 'github_signup'

/** 목의 증명서 값. 서버는 서명한 JWT를 주지만 목이 볼 것은 "있나 없나"뿐이다. */
const GITHUB_CERTIFICATE = 'mock-github-signup'

/** 목의 GitHub 계정이 가입을 마쳤는지. 가입 전에는 signup, 뒤에는 success로 갈린다. */
let githubRegistered = false

/** 테스트 사이에 GitHub 가입 여부가 새지 않게 되돌린다. */
export function resetGitHub(): void {
  githubRegistered = false
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
   * 관리자 문제 목록·검색 (ADM-01).
   *
   * 공개 전·비공개 문제까지 모두 주고 번호 오름차순이다(계약). 상태 문구는 담지 않는다 —
   * 계약이 "화면이 `latestStatus`와 `publishedVersionNo`로 정한다"로 정했다.
   *
   * 검색은 **최신 버전 제목**의 부분 일치다. 목록에 보이는 제목이 최신 버전의 것이므로
   * (adminSummary), 보이는 글자로 찾을 수 있어야 한다. `%`·`_`를 글자로 찾는 것은 저절로
   * 된다 — 여기는 SQL이 아니다.
   *
   * 세션을 보지 않는 것은 다른 핸들러와 같은 선택이다 — 화면이 RequireAdmin 뒤에 있다.
   * 그래서 이 목으로는 403을 재현할 수 없다.
   */
  http.get('*/api/admin/problems', ({ request }) => {
    const query = new URL(request.url).searchParams
    const keyword = query.get('keyword')?.trim().toLowerCase() ?? ''

    const matched = adminProblems.filter(
      (item) => keyword === '' || latestVersion(item).input.title.toLowerCase().includes(keyword),
    )

    const page = Number(query.get('page') ?? 0)
    const size = Number(query.get('size') ?? MAX_PAGE_SIZE)
    // 사용자 목록과 같은 자리에서 400을 준다. 받아 주면 목에서만 통과하는 테스트가 생긴다.
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
      content: matched.slice(page * size, page * size + size).map(adminSummary),
      totalElements: matched.length,
    })
  }),

  /**
   * 문제 등록 (ADM-02·03).
   *
   * 문제와 1번 버전을 초안으로 만든다. `slug`는 서버가 만든다(`p-{id}`) — 계약이 그 모양을
   * 적어 뒀다. 케이스는 없이 시작하므로 공개 조건 두 개(`SAMPLE_COUNT`·`HIDDEN_COUNT`)가
   * 비어 있고, 채우는 API는 #34다.
   */
  http.post('*/api/admin/problems', async ({ request }) => {
    const body = (await request.json()) as ProblemInput
    const invalid = checkProblemInput(body)
    if (invalid) return invalid

    // 번호를 세어 두지 않고 그때그때 구한다. 세어 두면 resetAdminProblems가 되돌릴
    // 상태가 둘이 되고, 한쪽만 되돌리면 새 문제가 기존 번호를 덮는다.
    const id = Math.max(0, ...adminProblems.map((item) => item.id)) + 1

    adminProblems.push({
      id,
      slug: `p-${id}`,
      versions: [
        {
          versionNo: 1,
          status: 'DRAFT',
          createdAt: new Date().toISOString(),
          publishedAt: null,
          input: body,
          // 케이스와 정답 코드는 없이 시작한다. 등록 본문(`ProblemInput`)에 둘 다 없고,
          // 넣는 길은 `PUT .../test-cases`·`PUT .../solutions`뿐이다(계약).
          cases: [],
          solutions: [],
          caseValidation: null,
        },
      ],
    })

    return HttpResponse.json(
      { id },
      { status: 201, headers: { Location: `/api/admin/problems/${id}` } },
    )
  }),

  /** 관리자 문제 상세 (ADM-02·03·06). 최신 버전 + 못 채운 공개 조건. */
  http.get('*/api/admin/problems/:id', ({ params }) => {
    const found = findAdminProblem(params.id)
    if (found instanceof HttpResponse) return found

    return HttpResponse.json(adminDetail(found))
  }),

  /**
   * 문제 수정 (ADM-02·03·07).
   *
   * **어느 버전에 저장할지는 서버가 정한다**(계약). 분기를 계약 문장 순서대로 옮겼다:
   *   1. 검증 중이면 409 `PROBLEM_VALIDATING` — 진행 중인 채점을 취소하지 않는다
   *   2. 초안이 있으면 초안을 고친다
   *   3. 초안이 없고 제한·언어가 모두 같으면 최신 버전을 그 자리에서 고친다.
   *      공개 중이면 사용자 화면에 바로 반영된다
   *   4. 제한·언어가 다르면 최신 버전을 복사해 새 초안(+1)을 만들어 거기 저장한다
   *
   * 3에서 공개 조건이 깨지면(태그를 모두 빼거나 출처를 비움) 409
   * `PUBLISH_CONDITIONS_NOT_MET`이다 — 공개 중인 문제가 조건 미달로 남는 것을 막는다.
   */
  http.put('*/api/admin/problems/:id', async ({ params, request }) => {
    const found = findAdminProblem(params.id)
    if (found instanceof HttpResponse) return found

    const body = (await request.json()) as ProblemInput
    const invalid = checkProblemInput(body)
    if (invalid) return invalid

    const latest = latestVersion(found)
    if (latest.status === 'VALIDATING') {
      return problem(
        409,
        'PROBLEM_VALIDATING',
        '정답 코드를 검증하는 중이에요. 끝난 뒤 고쳐 주세요',
      )
    }

    if (latest.status === 'DRAFT' || sameLimits(body.languages, latest.input.languages)) {
      if (latest.status === 'PUBLISHED') {
        const unmet = brokenTextConditions(body)
        if (unmet.length > 0) {
          return HttpResponse.json(
            {
              status: 409,
              code: 'PUBLISH_CONDITIONS_NOT_MET',
              detail: '공개 중인 문제라 공개 조건을 비울 수 없어요',
              unmetConditions: unmet,
            },
            { status: 409 },
          )
        }
      }

      latest.input = body
      return HttpResponse.json({ versionNo: latest.versionNo, status: latest.status })
    }

    const created: MockProblemVersion = {
      versionNo: latest.versionNo + 1,
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
      publishedAt: null,
      input: body,
      // 계약: "최신 버전을 복사해 새 초안을 만든다." 케이스도 함께 복사한다 — 글을 고쳤다고
      // 케이스가 사라지면 공개 조건이 뒤로 간다.
      cases: latest.cases.map((item) => ({ ...item })),
      // 계약: "예제·테스트케이스와 정답 코드도 복사하고, 정답 코드는 다시 검증해야 한다."
      // 제한이 달라져 새 초안이 생긴 경우라, 통과 기록을 그대로 물려주면 안 된다.
      solutions: clearValidation(latest.solutions),
      caseValidation: null,
    }
    found.versions.push(created)

    return HttpResponse.json({ versionNo: created.versionNo, status: created.status })
  }),

  /**
   * 정답 코드와 검증 상태 (ADM-05).
   *
   * 검증 중이면 부를 때마다 진행률을 올린다 — 폴링이 도는 화면을 `npm run dev`에서
   * 손으로 볼 수 있어야 한다. 두 번 부르면 끝난다(0 → 50 → 100).
   */
  http.get('*/api/admin/problems/:id/solutions', ({ params }) => {
    const found = findAdminProblem(params.id)
    if (found instanceof HttpResponse) return found

    const version = latestVersion(found)
    if (version.status === 'VALIDATING') advanceValidation(version)
    return HttpResponse.json(version.solutions)
  }),

  /**
   * 정답 코드 저장 (ADM-05·07).
   *
   * 저장 자리 규칙은 테스트케이스와 **같다**(계약). 코드가 하나라도 바뀌면 두 언어 모두
   * 검증 전으로 돌아간다 — 고치지 않은 언어도 그렇다.
   */
  http.put('*/api/admin/problems/:id/solutions', async ({ params, request }) => {
    const found = findAdminProblem(params.id)
    if (found instanceof HttpResponse) return found

    const body = (await request.json()) as SolutionInput[]
    const tooLong = body.find((item) => utf8Bytes(item.sourceCode) > MAX_SOLUTION_BYTES)
    if (tooLong) {
      return problem(400, 'SOURCE_TOO_LONG', `${tooLong.language} 코드가 64KB를 넘어요`)
    }

    const latest = latestVersion(found)
    if (latest.status === 'VALIDATING') {
      return problem(409, 'PROBLEM_VALIDATING', '검증하는 중이에요. 끝난 뒤 고쳐 주세요')
    }

    // 계약: "코드가 비어 있으면(공백뿐 포함) 그 언어의 정답 코드를 지운다."
    const saved = body
      .filter((item) => item.sourceCode.trim() !== '')
      .map((item) => newSolution(item))
    // 계약: "보낸 코드가 최신 버전과 똑같으면 아무것도 바꾸지 않는다."
    const unchanged =
      JSON.stringify(saved.map(sourceOf)) === JSON.stringify(latest.solutions.map(sourceOf))

    if (unchanged || latest.status === 'DRAFT') {
      if (!unchanged) {
        latest.solutions = saved
        latest.caseValidation = null
      }
      return HttpResponse.json({ versionNo: latest.versionNo, status: latest.status })
    }

    const created: MockProblemVersion = {
      versionNo: latest.versionNo + 1,
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
      publishedAt: null,
      input: { ...latest.input },
      cases: latest.cases.map((item) => ({ ...item })),
      solutions: saved,
      caseValidation: null,
    }
    found.versions.push(created)
    return HttpResponse.json({ versionNo: created.versionNo, status: created.status })
  }),

  /**
   * 검증 시작 (ADM-05).
   *
   * 409 다섯 가지 중 화면이 막을 수 없는 것만 둔다. `LANGUAGE_NOT_CONFIGURED`와
   * `JUDGE_UNAVAILABLE`은 목에 분기를 넣지 않고 테스트에서 `server.use`로 꽂는다 —
   * 목이 계약에 없는 조건을 지어내면 그 거짓말을 믿는 테스트가 생긴다.
   */
  http.post('*/api/admin/problems/:id/validate', ({ params }) => {
    const found = findAdminProblem(params.id)
    if (found instanceof HttpResponse) return found

    const latest = latestVersion(found)
    if (latest.status === 'VALIDATING') {
      return problem(409, 'PROBLEM_VALIDATING', '이미 검증하는 중이에요')
    }
    if (latest.status !== 'DRAFT') {
      return problem(409, 'NOT_DRAFT', '이미 검증을 통과한 버전이에요')
    }
    if (latest.solutions.length === 0) {
      return problem(409, 'NO_SOLUTION', '정답 코드가 없어요')
    }
    if (countCases(latest.cases, 'SAMPLE') === 0) {
      return problem(409, 'NO_TEST_CASES', '공개 예제가 없어요')
    }

    // 계약: "시작하면 이전 검증 기록을 지우고 ... 버전을 VALIDATING으로 바꾼다."
    latest.status = 'VALIDATING'
    latest.caseValidation = null
    latest.solutions = clearValidation(latest.solutions).map((solution) => ({
      ...solution,
      status: 'VALIDATING' as const,
    }))
    return new HttpResponse(null, { status: 202 })
  }),

  /**
   * 공개 (ADM-06).
   *
   * 계약의 순서를 지킨다 — 검증 중이면 **공개 조건을 보기 전에** 409다. 조건을 먼저
   * 보면 검증 중에는 정답 코드가 아직 통과가 아니라서, 엉뚱하게
   * `PUBLISH_CONDITIONS_NOT_MET`을 주게 된다.
   */
  http.post('*/api/admin/problems/:id/publish', ({ params }) => {
    const found = findAdminProblem(params.id)
    if (found instanceof HttpResponse) return found

    const latest = latestVersion(found)
    if (latest.status === 'VALIDATING') {
      return problem(409, 'PROBLEM_VALIDATING', '정답 코드를 검증하는 중이에요')
    }

    // 이미 공개 중이면 아무것도 바꾸지 않고 204다(계약).
    if (latest.status === 'PUBLISHED') return new HttpResponse(null, { status: 204 })

    const unmet = unmetConditions(latest)
    if (unmet.length > 0) {
      return HttpResponse.json(
        {
          status: 409,
          code: 'PUBLISH_CONDITIONS_NOT_MET',
          detail: '공개 조건을 채우지 못했어요',
          unmetConditions: unmet,
        },
        { status: 409 },
      )
    }

    // 공개하던 버전은 지난 버전이 된다(계약). 내려간 버전의 `publishedAt`은 그대로 둔다 —
    // '마지막으로 공개한 시각'이라 내려도 남는다.
    for (const version of found.versions) {
      if (version.status === 'PUBLISHED') version.status = 'RETIRED'
    }
    latest.status = 'PUBLISHED'
    latest.publishedAt = new Date().toISOString()
    return new HttpResponse(null, { status: 204 })
  }),

  /** 비공개 (ADM-06). 공개 중인 버전이 없어도 204다(계약). 초안은 그대로 둔다. */
  http.post('*/api/admin/problems/:id/unpublish', ({ params }) => {
    const found = findAdminProblem(params.id)
    if (found instanceof HttpResponse) return found

    for (const version of found.versions) {
      if (version.status === 'PUBLISHED') version.status = 'RETIRED'
    }
    return new HttpResponse(null, { status: 204 })
  }),

  /**
   * 테스트케이스 목록 (ADM-04). 최신 버전의 케이스를 순서대로 준다.
   *
   * `validation`은 두 언어 모두 null이다 — 정답 코드와 검증은 PR B(#37)에서 담는다.
   * 계약이 "그 언어의 검증 기록이 없으면 null"로 정해 둔 모양 그대로다.
   */
  http.get('*/api/admin/problems/:id/test-cases', ({ params }) => {
    const found = findAdminProblem(params.id)
    if (found instanceof HttpResponse) return found

    const version = latestVersion(found)
    return HttpResponse.json(
      version.cases.map((item, index) => adminTestCase(item, index, version.caseValidation)),
    )
  }),

  /**
   * 테스트케이스 저장 (ADM-04·07). 버전 분기는 문제 수정(`PUT /api/admin/problems/:id`)과 같다.
   *
   * 계약이 정한 순서대로 본다: 검증 중이면 409 → 한도를 넘으면 400 → 같은 목록이면 그대로 →
   * 초안이면 그 자리 → 공개·비공개면 새 초안(+1). 정답 코드 검증 기록을 지우는 것은 PR B에서
   * 정답 코드를 담은 뒤 더한다(지금은 지울 기록이 없다).
   */
  http.put('*/api/admin/problems/:id/test-cases', async ({ params, request }) => {
    const found = findAdminProblem(params.id)
    if (found instanceof HttpResponse) return found

    const body = (await request.json()) as TestCaseInput[]
    const invalid = checkTestCases(body)
    if (invalid) return invalid

    const latest = latestVersion(found)
    if (latest.status === 'VALIDATING') {
      return problem(
        409,
        'PROBLEM_VALIDATING',
        '정답 코드를 검증하는 중이에요. 끝난 뒤 고쳐 주세요',
      )
    }

    // 계약: "보낸 목록이 최신 버전의 케이스와 똑같으면 아무것도 바꾸지 않는다."
    const unchanged = JSON.stringify(body) === JSON.stringify(latest.cases)
    if (unchanged || latest.status === 'DRAFT') {
      if (!unchanged) {
        latest.cases = body
        // 계약: "정답 코드 검증 기록을 지우므로 다시 검증해야 한다." 채점 기준이 바뀌었으니
        // 고치지 않은 언어도 통과 표시를 잃는다.
        latest.solutions = clearValidation(latest.solutions)
        latest.caseValidation = null
      }
      return HttpResponse.json({ versionNo: latest.versionNo, status: latest.status })
    }

    const created: MockProblemVersion = {
      versionNo: latest.versionNo + 1,
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
      publishedAt: null,
      input: { ...latest.input },
      cases: body,
      // 계약: "정답 코드도 복사하고, 정답 코드는 다시 검증해야 한다."
      solutions: clearValidation(latest.solutions),
      caseValidation: null,
    }
    found.versions.push(created)

    return HttpResponse.json({ versionNo: created.versionNo, status: created.status })
  }),

  /**
   * 테스트케이스 ZIP 읽기 (ADM-04). **저장하지 않는다** — 읽은 목록만 준다(계약).
   *
   * 파일을 풀지 않고 정해진 목록을 돌려준다. `jszip`을 더해도 화면 코드가 더 맞아지지
   * 않는다 — 화면은 `TestCaseInput[]`을 받기만 하고, ZIP 규칙은 서버(#152)가 지킨다.
   * `ZIP_INVALID`·`TEST_CASE_LIMIT_EXCEEDED`·413은 **여기에 분기를 두지 않고** 테스트에서
   * `server.use`로 꽂는다. 목에 계약에 없는 규칙을 넣으면 그 규칙을 믿는 테스트가 생긴다.
   *
   * shortcut: 목이 ZIP을 풀지 않는다. 실제 파싱은 배포 서버에서 확인한다
   */
  http.post('*/api/admin/problems/:id/test-cases/zip', ({ params }) => {
    const found = findAdminProblem(params.id)
    if (found instanceof HttpResponse) return found

    // 본문을 읽지 않는다. 볼 이유가 없고(목은 ZIP을 풀지 않는다), 읽으면 테스트가 깨진다
    // — jsdom의 File은 undici의 File이 아니라 `request.formData()`가 거기서 터진다.
    return HttpResponse.json(ZIP_CASES)
  }),

  /** 버전 목록 (ADM-07). 최신 버전부터 준다(계약). */
  http.get('*/api/admin/problems/:id/versions', ({ params }) => {
    const found = findAdminProblem(params.id)
    if (found instanceof HttpResponse) return found

    return HttpResponse.json([...found.versions].reverse().map(versionSummary))
  }),

  /** 고른 버전의 내용 (ADM-07). 없는 버전도 404 `PROBLEM_NOT_FOUND`다(계약). */
  http.get('*/api/admin/problems/:id/versions/:versionNo', ({ params }) => {
    const found = findAdminProblem(params.id)
    if (found instanceof HttpResponse) return found

    const versionNo = Number(params.versionNo)
    if (!Number.isSafeInteger(versionNo)) return badRequest('versionNo는 정수여야 한다')

    const version = found.versions.find((item) => item.versionNo === versionNo)
    if (!version) return problem(404, 'PROBLEM_NOT_FOUND', '그 버전을 찾을 수 없어요')

    return HttpResponse.json(adminVersion(found, version))
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
    const checked = await checkSourceBody(request)
    if (checked instanceof HttpResponse) return checked
    const { detail, language, source } = checked

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

  /**
   * 로그인한 사용자 (COM-01·COM-05). `Authorization` 헤더의 access token으로 가린다.
   *
   * 쿠키가 아니라 헤더를 보는 것이 계약이다. 목이 쿠키로 흉내 내면 실서버에서만 깨지는
   * 차이가 남는다 — 전에 그랬다.
   */
  http.get('*/api/users/me', ({ request }) => {
    const id = userIdFromToken(bearer(request))
    const account = mockAccounts.find((item) => item.user.id === id)
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

    // 계약의 TokensIssued: access token은 본문, refresh token은 쿠키다.
    // HttpResponse(= msw의 클래스)여야 한다. 평범한 Response로는 쿠키가 저장되지 않는다 —
    // msw는 생성 시점에 init.headers의 set-cookie를 심볼로 옮겨 두고 그것만 항아리에 넣는다.
    issued.set(account.user.id, 1)
    return HttpResponse.json(
      { accessToken: mockAccessToken(account.user.id, 1) },
      { headers: { 'Set-Cookie': `${REFRESH_COOKIE}=${account.user.id}; Path=/; SameSite=Lax` } },
    )
  }),

  /**
   * access token 갱신 (COM-04).
   *
   * refresh token은 쿠키로 온다(계약의 `in: cookie`). 발급 번호를 올려 **값이 다른** 토큰을
   * 주는 이유는, 화면이 새 토큰으로 바꿔 끼웠는지를 테스트가 볼 수 있게 하려는 것이다.
   *
   * 재사용 유예(10초)와 탈취 감지는 목에 넣지 않는다 — 시간에 매인 규칙이라 목이 흉내 내면
   * 테스트가 시계에 매이고, 화면이 하는 일은 어느 쪽이든 "401이면 로그인으로"로 같다.
   */
  http.post('*/api/auth/refresh', ({ cookies }) => {
    const id = Number(cookies[REFRESH_COOKIE])
    const account = mockAccounts.find((item) => item.user.id === id)
    if (!account) return unauthorized()

    const next = (issued.get(id) ?? 1) + 1
    issued.set(id, next)
    return HttpResponse.json(
      { accessToken: mockAccessToken(id, next) },
      { headers: { 'Set-Cookie': `${REFRESH_COOKIE}=${id}; Path=/; SameSite=Lax` } },
    )
  }),

  // 쿠키가 없거나 모르는 토큰이어도 204다(계약).
  http.post('*/api/auth/logout', () => {
    return new HttpResponse(null, {
      status: 204,
      headers: { 'Set-Cookie': `${REFRESH_COOKIE}=; Path=/; Max-Age=0` },
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
  // --- GitHub 로그인 (COM-02) ---

  /**
   * GitHub 로그인 시작. **화면은 이 핸들러에 닿지 않는다.**
   *
   * 계약이 "브라우저를 이 주소로 이동시킨다(fetch가 아님)"고 정했고, MSW의 서비스 워커는
   * 네비게이션 요청을 그냥 통과시킨다(public/mockServiceWorker.js의 "Bypass navigation
   * requests"). 그래서 브라우저에서 이 왕복은 목으로 흉내 낼 수 없다 — 손으로 확인할 때는
   * /login/github?result=... 를 직접 연다.
   *
   * 그래도 핸들러를 두는 이유: **테스트가 증명서를 얻는 자리**다. GitHub를 다녀온 것처럼
   * 한 번 fetch하면 콜백이 심어 줄 쿠키가 msw의 쿠키 항아리에 들어간다. 지어낸 값을
   * 테스트가 직접 심는 것보다 실제 흐름에 가깝다.
   */
  http.get('*/api/auth/github', () => {
    if (githubRegistered) {
      // 이미 가입한 계정이다. 계약대로 refresh 쿠키만 심고 토큰은 주지 않는다 —
      // 웹이 돌아와서 /api/auth/refresh로 받는다.
      const id = mockAccounts[0]!.user.id
      issued.set(id, 1)
      return new HttpResponse(null, {
        status: 302,
        headers: {
          Location: '/login/github?result=success',
          'Set-Cookie': `${REFRESH_COOKIE}=${id}; Path=/; SameSite=Lax`,
        },
      })
    }
    return new HttpResponse(null, {
      status: 302,
      headers: {
        Location: '/login/github?result=signup',
        'Set-Cookie': `${GITHUB_SIGNUP_COOKIE}=${GITHUB_CERTIFICATE}; Path=/api/auth/github; SameSite=Lax`,
      },
    })
  }),

  /**
   * GitHub 가입 완료. 검사 순서를 실제 서버와 같게 맞춘다
   * (GitHubLoginService.signUp: 증명서 → 닉네임 규칙 → 이미 가입 → 닉네임 선점).
   *
   * 순서가 중요하다 — 증명서가 죽은 사람에게 닉네임 오류를 먼저 보여 주면, 고쳐 봐야
   * 안 되는 칸을 고치게 한다.
   */
  http.post('*/api/auth/github/signup', async ({ request, cookies }) => {
    const certificate = cookies[GITHUB_SIGNUP_COOKIE]
    if (certificate !== GITHUB_CERTIFICATE) {
      return problem(
        400,
        'VERIFICATION_EXPIRED',
        '인증 시간이 지났어요. GitHub 로그인을 다시 해 주세요',
      )
    }
    const nickname = ((await request.json()) as { nickname?: string }).nickname ?? ''
    if (!isValidNickname(nickname)) {
      return problem(400, 'INVALID_NICKNAME', '닉네임은 2~16자의 한글·영문·숫자만 쓸 수 있어요')
    }
    if (githubRegistered) {
      return problem(
        409,
        'ALREADY_REGISTERED',
        '이미 가입한 GitHub 계정이에요. GitHub 로그인을 다시 해 주세요',
      )
    }
    // 대소문자를 구분하지 않는다 (닉네임 확인과 같은 규칙).
    if (mockAccounts.some((item) => item.user.nickname.toLowerCase() === nickname.toLowerCase())) {
      return problem(409, 'NICKNAME_TAKEN', '이미 사용 중인 닉네임이에요')
    }
    githubRegistered = true
    // 목은 계정을 늘리지 않는다 — 이메일 가입(/api/auth/signup)과 같은 선택이다. 다음
    // GitHub 로그인이 mockAccounts[0]으로 들어간다.
    return new HttpResponse(null, {
      status: 204,
      headers: { 'Set-Cookie': `${GITHUB_SIGNUP_COOKIE}=; Path=/api/auth/github; Max-Age=0` },
    })
  }),
  /**
   * 예제 실행 접수 (SOLVE-08).
   *
   * 요청 검사는 제출과 **같은 함수**가 한다(계약: "요청 본문과 오류는 코드 제출과 같다").
   *
   * 접수만 하고 실행하지 않는다 — 계약도 202로 접수만 답한다. 시작 코드를 그대로 돌린
   * 실행은 첫 예제를 틀리고, 손을 댔으면 전부 통과한다. 목이 실제로 실행할 수는 없고,
   * **통과·실패가 섞인 표**가 사람이 손으로 확인해야 하는 화면이라 그렇게 정했다
   * (제출 목의 판정 규칙과 같은 선택이다). 다른 판정은 테스트가 server.use로 돌려준다.
   */
  http.post('*/api/sample-runs', async ({ request }) => {
    const checked = await checkSourceBody(request)
    if (checked instanceof HttpResponse) return checked
    const { detail, language, source } = checked

    const id = nextSampleRunId++
    const starter = detail.languages.find((it) => it.language === language)?.starterCode ?? ''
    mockSampleRuns.set(id, {
      problemId: detail.id,
      language,
      submittedAt: new Date().toISOString(),
      polls: 0,
      expected: detail.samples.map((it) => it.output),
      allPass: source.trim() !== starter.trim(),
    })
    return HttpResponse.json(
      { id },
      { status: 202, headers: { Location: `/api/sample-runs/${id}` } },
    )
  }),

  /**
   * 예제 실행 상태·예제별 결과 (SOLVE-08).
   *
   * **조회할 때마다 한 걸음 나아간다.** 한 번에 COMPLETED를 주면 폴링 화면을 사람도
   * 테스트도 볼 수 없다. 시간이 아니라 횟수로 진행시키는 이유는 테스트가 시계에 매이지
   * 않게 하려는 것이다(제출 핸들러와 같다).
   *
   * 중간 단계에서 첫 예제만 채워 보낸다 — 계약이 "실행 전인 예제도 있고 결과 값이
   * null이다"라고 한 그 상태를 화면이 실제로 받아 보게 한다.
   *
   * 없는 실행은 404 `SAMPLE_RUN_NOT_FOUND`다. 계약은 남의 실행·채점 제출도 같은 404로
   * 답하라고 정했는데, 목은 세션을 보지 않아(다른 핸들러와 같은 선택) 그 둘을 구분하지 않는다.
   */
  http.get('*/api/sample-runs/:id', ({ params }) => {
    const id = Number(params.id)
    if (!Number.isSafeInteger(id)) return badRequest('id는 정수여야 한다')

    const found = mockSampleRuns.get(id)
    if (!found) return problem(404, 'SAMPLE_RUN_NOT_FOUND', '예제 실행을 찾을 수 없어요')

    const step = found.polls++
    const base = {
      id,
      problemId: found.problemId,
      language: found.language,
      submittedAt: found.submittedAt,
      runtimeErrorType: null,
      compilerMessage: null,
    }
    // 이 실행에서 각 예제가 어떻게 끝날지. 시작 코드 그대로면 첫 예제만 틀린다.
    const outcome = (ordinal: number): 'pass' | 'fail' =>
      found.allPass || ordinal > 1 ? 'pass' : 'fail'

    if (step === 0) {
      return HttpResponse.json({
        ...base,
        status: 'QUEUED',
        progress: 0,
        verdict: null,
        judgedAt: null,
        cases: found.expected.map((it, index) => sampleCase(index + 1, it, 'pending')),
      })
    }
    if (step === 1) {
      return HttpResponse.json({
        ...base,
        status: 'RUNNING',
        progress: Math.round(100 / Math.max(found.expected.length, 1)),
        verdict: null,
        judgedAt: null,
        cases: found.expected.map((it, index) =>
          sampleCase(index + 1, it, index === 0 ? outcome(1) : 'pending'),
        ),
      })
    }
    return HttpResponse.json({
      ...base,
      status: 'COMPLETED',
      progress: 100,
      // 계약: 모두 맞으면 ACCEPTED, 아니면 처음 틀린 예제의 판정.
      verdict: found.allPass ? 'ACCEPTED' : 'WRONG_ANSWER',
      judgedAt: new Date().toISOString(),
      cases: found.expected.map((it, index) => sampleCase(index + 1, it, outcome(index + 1))),
    })
  }),
]

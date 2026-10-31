import type {
  AdminProblemDetail,
  AdminProblemSummary,
  AdminProblemVersion,
  AdminSolution,
  CaseType,
  CaseValidation,
  Language,
  ProblemDetailView,
  ProblemInput,
  ProblemVersionStatus,
  ProblemVersionSummary,
  PublishCondition,
  TestCaseInput,
} from '@/api/types'
import { SOLUTION_LANGUAGES } from '@/features/admin/solutionsState'
import { problemDetails } from './problemDetails'

export interface MockProblemVersion {
  versionNo: number
  status: ProblemVersionStatus
  createdAt: string
  publishedAt: string | null
  input: ProblemInput
  /**
   * 그 버전의 테스트케이스 (ADM-04). 계약이 케이스를 **버전에** 달아 뒀다 — 공개 버전에
   * 케이스를 저장하면 새 초안이 생기고, 기존 버전의 케이스는 그대로 남는다.
   */
  cases: TestCaseInput[]
  /** 그 버전의 정답 코드 (ADM-05). 케이스와 같은 이유로 버전에 달려 있다. */
  solutions: AdminSolution[]
  /**
   * 케이스별 검증 결과 (ADM-05 결과 표). `cases`와 **같은 순서**의 배열이다.
   *
   * `cases`에 섞지 않는 까닭: `cases`는 `TestCaseInput[]`로 PUT 본문과 같은 모양이어야
   * 한다. 섞으면 저장 핸들러가 본문과 상태를 같은 타입으로 다루게 되고, 보낸 것과 서버가
   * 아는 것의 경계가 사라진다.
   */
  caseValidation: Record<Language, CaseValidation[]> | null
}

export interface MockAdminProblem {
  id: number
  slug: string
  /** 번호 오름차순. 1번이 맨 앞이다. */
  versions: MockProblemVersion[]
}

/** 상세 fixture를 등록·수정 본문 모양으로 옮긴다. 태그는 계약대로 `slug`만 보낸다. */
function inputFrom(detail: ProblemDetailView): ProblemInput {
  return {
    title: detail.title,
    difficulty: detail.difficulty,
    statementMarkdown: detail.statementMarkdown,
    inputDescription: detail.inputDescription,
    outputDescription: detail.outputDescription,
    constraintsMarkdown: detail.constraintsMarkdown,
    sourceName: detail.sourceName,
    sourceUrl: detail.sourceUrl,
    license: detail.license,
    tags: detail.tags.map((tag) => tag.slug),
    languages: detail.languages.map((entry) => ({ ...entry })),
  }
}

/**
 * 문제마다 버전을 어떤 상태로 둘지. 적지 않은 문제는 1번 버전이 공개 중이다.
 *
 * ADM-01이 보여 줘야 하는 상태 네 가지와, 계약이 예시로 든 "공개 버전 위에 초안"까지
 * 사람이 한 화면에서 볼 수 있게 섞었다. 번호를 9~12에서 고른 것은 1~8번에 걸린
 * 목록·필터 테스트가 그 문제들의 값을 하나하나 단언하기 때문이다(problems.ts의 같은 이유).
 *
 * **공개 목록 핸들러는 이 상태를 보지 않는다.** `GET /api/problems`는 fixture의 25개를
 * 모두 주므로, 여기서 '작성 중'인 문제도 사용자 목록에 보인다. 목의 알려진 단순화다 —
 * 공개 여부로 사용자 목록을 가리는 것은 서버 몫이고 화면이 할 일이 없다.
 */
const VERSION_STATES: Record<number, ProblemVersionStatus[]> = {
  9: ['PUBLISHED', 'DRAFT'],
  10: ['DRAFT'],
  11: ['VALIDATING'],
  12: ['RETIRED'],
}

/**
 * 공개 조건을 채운 케이스 묶음 — 공개 예제 2개·비공개 5개 (`SAMPLE_COUNT`·`HIDDEN_COUNT`).
 *
 * 공개 예제는 문제 상세의 `samples`를 그대로 쓴다. 두 곳이 어긋나면 "문제 화면에 보이는
 * 예제"와 "관리자가 보는 공개 예제"가 달라져, 어느 쪽이 진짜인지 알 수 없는 목이 된다.
 * 예제가 하나뿐인 문제는 그 하나를 복제해 둘로 맞춘다.
 */
function filledCases(detail: ProblemDetailView): TestCaseInput[] {
  const samples =
    detail.samples.length >= 2 ? detail.samples.slice(0, 2) : [...detail.samples, ...detail.samples]

  return [
    ...samples.map((sample) => ({ caseType: 'SAMPLE' as const, ...sample })),
    // 비공개는 내용을 보여 줄 이유가 없어 번호만 다른 줄로 채운다.
    ...Array.from({ length: 5 }, (_, index) => ({
      caseType: 'HIDDEN' as const,
      input: `${index + 1}\n`,
      output: `${index + 1}\n`,
    })),
  ]
}

/** 검증을 통과한 정답 코드 한 쌍. 공개한 적 있는 버전은 이 상태여야 공개 조건이 채워진다. */
function verifiedSolutions(detail: ProblemDetailView): AdminSolution[] {
  // 언어 순서는 계약이 정했다 — Python 먼저, C++ 다음.
  return SOLUTION_LANGUAGES.map((language) => ({
    language,
    sourceCode: detail.languages.find((entry) => entry.language === language)?.starterCode ?? '',
    verifiedAt: '2026-10-12T09:00:00Z',
    status: 'PASSED' as const,
    progress: 100,
    verdict: 'ACCEPTED' as const,
    compilerMessage: null,
  }))
}

/**
 * 모든 케이스를 통과한 기록. 표가 판정·시간·메모리를 그린다.
 *
 * **정답 코드가 있는 언어만 채운다.** 계약은 정답 코드가 없는 언어의 결과를 null로 정했다 —
 * 둘 다 채우면 Python만 저장한 초안에서 C++ 칸이 '정답 코드가 없어요'와 통과 결과표를 함께
 * 보여 주고, 케이스 탭은 '검증 2/2 통과'가 된다. 목을 믿는 테스트가 서버와 갈라진다.
 */
export function passedCaseValidation(
  cases: TestCaseInput[],
  languages: readonly Language[],
): Record<Language, CaseValidation[]> {
  const passed = cases.map((_, index) => ({
    verdict: 'ACCEPTED' as const,
    // 번호마다 조금씩 다르게 둬서 표의 칸이 한 값으로 뭉치지 않게 한다.
    executionTimeMs: 10 + index * 3,
    memoryUsedKb: 1024 + index * 32,
    runtimeErrorType: null,
  }))
  // 빈 배열이면 핸들러가 케이스마다 null을 준다 — 계약의 '기록 없음'과 같은 모양이다.
  return {
    PYTHON: languages.includes('PYTHON') ? passed : [],
    CPP: languages.includes('CPP') ? passed.map((item) => ({ ...item })) : [],
  }
}

/** 검증이 도는 중인 정답 코드. `npm run dev`에서 폴링 화면을 볼 수 있어야 한다. */
export function validatingSolutions(detail: ProblemDetailView): AdminSolution[] {
  return verifiedSolutions(detail).map((solution) => ({
    ...solution,
    verifiedAt: null,
    status: 'VALIDATING' as const,
    progress: 0,
    verdict: null,
  }))
}

/** 검증 전 상태로 돌린 정답 코드. 코드는 남고 기록만 지워진다(계약). */
export function clearValidation(solutions: AdminSolution[]): AdminSolution[] {
  return solutions.map((solution) => ({
    ...solution,
    verifiedAt: null,
    status: 'NOT_VALIDATED' as const,
    progress: 0,
    verdict: null,
    compilerMessage: null,
  }))
}

/**
 * 공개한 적이 있는 버전인지. `RETIRED`도 한 번은 공개했던 버전이라 시각이 있다
 * (계약: "마지막으로 공개한 시각. 공개한 적이 없으면 null").
 */
function publishedAt(status: ProblemVersionStatus, versionNo: number): string | null {
  if (status !== 'PUBLISHED' && status !== 'RETIRED') return null
  return `2026-10-${String(10 + versionNo).padStart(2, '0')}T09:00:00Z`
}

/**
 * 목 상태를 처음 모양으로 만든다.
 *
 * 등록·수정 핸들러가 이 배열을 고치므로 **테스트 사이에 다시 만들어야 한다**
 * (`resetAdminProblems`). 모듈 수준 상수로 두면 한 테스트가 만든 문제가 다음 테스트의
 * 목록 개수를 바꾼다.
 */
export function buildAdminProblems(): MockAdminProblem[] {
  return problemDetails.map((detail) => {
    const states = VERSION_STATES[detail.id] ?? ['PUBLISHED']
    return {
      id: detail.id,
      slug: detail.slug,
      versions: states.map((status, index) => {
        const versionNo = index + 1
        const filled =
          status === 'PUBLISHED' || status === 'RETIRED' || states.includes('PUBLISHED')
        // 검증 중인 버전은 케이스와 정답 코드가 **있어야 한다** — 둘 중 하나라도 없으면
        // 서버가 검증을 시작하지 않는다(409 `NO_SOLUTION`·`NO_TEST_CASES`). 목이 그
        // 상태를 만들면 있을 수 없는 문제를 화면이 그리게 된다.
        const validating = status === 'VALIDATING'
        return {
          versionNo,
          status,
          createdAt: `2026-10-${String(5 + versionNo).padStart(2, '0')}T09:00:00Z`,
          publishedAt: publishedAt(status, versionNo),
          // 버전마다 같은 내용으로 둔다. 버전끼리 글이 다른 것을 보여 줄 이유가 생기면
          // 그때 손본다 — ADM-07 화면은 어느 버전을 고르느냐만 보면 된다.
          input: inputFrom(detail),
          cases: filled || validating ? filledCases(detail) : [],
          // 공개한 적이 있는 버전만 검증까지 끝난 것으로 둔다. 초안만 있는 문제(10~12번)는
          // 비어 있어야 ADM-05 빈 화면과 ADM-06 체크리스트가 볼 거리가 된다.
          solutions: filled
            ? verifiedSolutions(detail)
            : validating
              ? validatingSolutions(detail)
              : [],
          caseValidation: filled
            ? passedCaseValidation(filledCases(detail), SOLUTION_LANGUAGES)
            : null,
        }
      }),
    }
  })
}

/**
 * 계약이 말하는 "최신 버전": 초안이 있으면 초안, 없으면 가장 최근 버전.
 *
 * fixture는 초안을 늘 맨 뒤에 두므로 마지막 원소만 봐도 같은 답이 나온다. 그래도 계약
 * 문장을 그대로 옮겨 둔다 — 목에서만 맞는 규칙을 화면이 믿게 두지 않는다.
 */
export function latestVersion(problem: MockAdminProblem): MockProblemVersion {
  const draft = problem.versions.find((version) => version.status === 'DRAFT')
  // 버전이 없는 문제는 만들 수 없다(등록이 1번 버전을 함께 만든다).
  return draft ?? problem.versions[problem.versions.length - 1]!
}

/** 공개 중인 버전 번호. 없으면 null. 문제마다 하나뿐이다(계약). */
export function publishedVersionNo(problem: MockAdminProblem): number | null {
  return problem.versions.find((version) => version.status === 'PUBLISHED')?.versionNo ?? null
}

/** 목록 한 줄. 상태 문구는 담지 않는다 — 화면이 두 값으로 만든다(labels.ts). */
export function adminSummary(problem: MockAdminProblem): AdminProblemSummary {
  const latest = latestVersion(problem)

  return {
    id: problem.id,
    slug: problem.slug,
    title: latest.input.title,
    difficulty: latest.input.difficulty,
    latestVersionNo: latest.versionNo,
    latestStatus: latest.status,
    publishedVersionNo: publishedVersionNo(problem),
  }
}

/** 종류별 케이스 수. 공개 조건과 ADM-04 표 머리글이 같은 수를 봐야 한다. */
export function countCases(cases: TestCaseInput[], caseType: CaseType): number {
  return cases.filter((item) => item.caseType === caseType).length
}

/**
 * 못 채운 공개 조건 (ADM-06). 비어 있으면 공개할 수 있다(계약).
 *
 * 수치는 계약의 `PublishCondition` 설명에서 그대로 가져왔다 — 공개 예제 2개 이상,
 * 비공개 5개 이상, 태그 1~3개, 출처(`sourceName`) 입력, 두 언어 설정.
 *
 * **버전 하나만 본다.** 케이스도 정답 코드도 버전에 달려 있어, 공개 버전 위에 초안이
 * 있으면 둘의 조건이 다르다.
 */
export function unmetConditions(version: MockProblemVersion): PublishCondition[] {
  const unmet: PublishCondition[] = []
  const input = version.input

  if (countCases(version.cases, 'SAMPLE') < 2) unmet.push('SAMPLE_COUNT')
  if (countCases(version.cases, 'HIDDEN') < 5) unmet.push('HIDDEN_COUNT')
  if (input.tags.length < 1 || input.tags.length > 3) unmet.push('TAG_COUNT')
  // 빈 문자열도 '안 넣은 것'으로 센다. 계약은 null을 받지만 공백만 든 이름은 출처가 아니다.
  if (input.sourceName === null || input.sourceName.trim() === '') unmet.push('SOURCE')

  const languages = input.languages.map((entry) => entry.language)
  if (!languages.includes('PYTHON') || !languages.includes('CPP')) unmet.push('LANGUAGES')

  // 두 언어가 다 검증을 통과해야 채워진다. 한쪽만 통과한 문제를 공개하면 그 언어로 푼
  // 사람이 틀린 채점을 받는다.
  const verified = version.solutions.filter((solution) => solution.status === 'PASSED')
  if (verified.length < 2) unmet.push('SOLUTIONS_VERIFIED')

  return unmet
}

export function versionSummary(version: MockProblemVersion): ProblemVersionSummary {
  return {
    versionNo: version.versionNo,
    status: version.status,
    createdAt: version.createdAt,
    publishedAt: version.publishedAt,
  }
}

/** 버전 하나의 내용 + 요약. 계약의 `AdminProblemVersion`이다. */
export function adminVersion(
  problem: MockAdminProblem,
  version: MockProblemVersion,
): AdminProblemVersion {
  return {
    ...version.input,
    ...versionSummary(version),
    id: problem.id,
    slug: problem.slug,
  }
}

/** 상세 = 최신 버전의 내용 + 공개 중인 버전 번호 + 못 채운 공개 조건 (계약). */
export function adminDetail(problem: MockAdminProblem): AdminProblemDetail {
  const latest = latestVersion(problem)

  return {
    ...adminVersion(problem, latest),
    publishedVersionNo: publishedVersionNo(problem),
    unmetConditions: unmetConditions(latest),
  }
}

/**
 * 공개 중인 버전을 **그 자리에서 고칠 때** 다시 보는 조건.
 *
 * 전체 공개 조건이 아니다 — 서버는 이 요청이 바꿀 수 있는 것만 본다
 * (`AdminProblemRepository.textConditions`). 케이스 수는 이 요청으로 바뀌지 않고,
 * 언어는 제한이 같아야 이 경로를 타므로 늘 둘 다 있다. 전체를 다시 보면, 이미 조건이
 * 덜 찬 채 공개된 문제는 글자 하나 못 고치게 된다.
 */
export function brokenTextConditions(input: ProblemInput): PublishCondition[] {
  const broken: PublishCondition[] = []
  if (input.tags.length === 0) broken.push('TAG_COUNT')
  if (input.sourceName === null || input.sourceName.trim() === '') broken.push('SOURCE')
  return broken
}

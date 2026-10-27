import type {
  AdminProblemDetail,
  AdminProblemSummary,
  AdminProblemVersion,
  ProblemDetailView,
  ProblemInput,
  ProblemVersionStatus,
  ProblemVersionSummary,
  PublishCondition,
} from '@/api/types'
import { problemDetails } from './problemDetails'

export interface MockProblemVersion {
  versionNo: number
  status: ProblemVersionStatus
  createdAt: string
  publishedAt: string | null
  input: ProblemInput
}

export interface MockAdminProblem {
  id: number
  slug: string
  /** 번호 오름차순. 1번이 맨 앞이다. */
  versions: MockProblemVersion[]
  /**
   * 공개 조건을 세는 데만 쓰는 케이스 수 (`SAMPLE_COUNT`·`HIDDEN_COUNT`).
   *
   * 케이스 자체는 담지 않는다 — 등록·수정 본문(`ProblemInput`)에 케이스가 없고,
   * 케이스 관리 API는 #34다. 조건 계산에 필요한 개수만 들고 있는다.
   */
  sampleCount: number
  hiddenCount: number
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
        return {
          versionNo,
          status,
          createdAt: `2026-10-${String(5 + versionNo).padStart(2, '0')}T09:00:00Z`,
          publishedAt: publishedAt(status, versionNo),
          // 버전마다 같은 내용으로 둔다. 버전끼리 글이 다른 것을 보여 줄 이유가 생기면
          // 그때 손본다 — ADM-07 화면은 어느 버전을 고르느냐만 보면 된다.
          input: inputFrom(detail),
        }
      }),
      // 공개한 적이 있는 문제만 조건을 채운 것으로 둔다. 초안만 있는 문제(10~12번)는
      // 공개 조건이 비어 있어야 ADM-06 체크리스트(#37)가 볼 거리가 생긴다.
      sampleCount: states.includes('PUBLISHED') || states.includes('RETIRED') ? 2 : 0,
      hiddenCount: states.includes('PUBLISHED') || states.includes('RETIRED') ? 5 : 0,
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

/**
 * 못 채운 공개 조건 (ADM-06). 비어 있으면 공개할 수 있다(계약).
 *
 * 수치는 계약의 `PublishCondition` 설명에서 그대로 가져왔다 — 공개 예제 2개 이상,
 * 비공개 5개 이상, 태그 1~3개, 출처(`sourceName`) 입력, 두 언어 설정.
 * "정답 코드 검증 통과"는 #35에서 더한다고 계약이 적어 뒀다.
 */
export function unmetConditions(
  problem: MockAdminProblem,
  input: ProblemInput,
): PublishCondition[] {
  const unmet: PublishCondition[] = []

  if (problem.sampleCount < 2) unmet.push('SAMPLE_COUNT')
  if (problem.hiddenCount < 5) unmet.push('HIDDEN_COUNT')
  if (input.tags.length < 1 || input.tags.length > 3) unmet.push('TAG_COUNT')
  // 빈 문자열도 '안 넣은 것'으로 센다. 계약은 null을 받지만 공백만 든 이름은 출처가 아니다.
  if (input.sourceName === null || input.sourceName.trim() === '') unmet.push('SOURCE')

  const languages = input.languages.map((entry) => entry.language)
  if (!languages.includes('PYTHON') || !languages.includes('CPP')) unmet.push('LANGUAGES')

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
    unmetConditions: unmetConditions(problem, latest.input),
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

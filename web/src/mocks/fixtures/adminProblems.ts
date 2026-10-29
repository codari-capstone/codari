import type {
  AdminProblemSummary,
  ProblemDetailView,
  ProblemInput,
  ProblemVersionStatus,
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

export const adminProblems: MockAdminProblem[] = problemDetails.map((detail) => ({
  id: detail.id,
  slug: detail.slug,
  versions: (VERSION_STATES[detail.id] ?? ['PUBLISHED']).map((status, index) => {
    const versionNo = index + 1
    return {
      versionNo,
      status,
      createdAt: `2026-10-${String(5 + versionNo).padStart(2, '0')}T09:00:00Z`,
      publishedAt: publishedAt(status, versionNo),
      // 버전마다 같은 내용으로 둔다. 버전별로 다른 글을 넣는 것은 ADM-07 화면을
      // 만들 때(#36 뒤 PR) 필요해지면 그때 손본다.
      input: inputFrom(detail),
    }
  }),
}))

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

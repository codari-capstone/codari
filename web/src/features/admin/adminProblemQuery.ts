import { queryOptions } from '@tanstack/react-query'

import { api } from '@/api/client'
import { fail } from '@/api/fail'
import type {
  AdminProblemDetail,
  AdminProblemVersion,
  AdminSolution,
  AdminTestCase,
  ProblemInput,
  ProblemVersionStatus,
  ProblemVersionSummary,
  SolutionInput,
  TestCaseInput,
} from '@/api/types'
import { POLL_INTERVAL_MS } from '@/app/queryClient'

/**
 * 한 페이지에 보여 주는 문제 수 (ADM-01).
 *
 * 계약이 `size`의 최대·기본값을 20으로 정했다. 사용자 목록의 `PAGE_SIZE`와 값이 같지만
 * 거기서 가져오지 않는다 — 다른 계약의 다른 상한이고, 한쪽이 바뀌는 날 조용히 따라가면
 * 400을 받는다.
 */
export const ADMIN_PAGE_SIZE = 20

export interface AdminProblemListParams {
  keyword: string
  /** 보고 있는 페이지. 1부터 센다(계약의 `page`는 0부터라 보낼 때 1을 뺀다). */
  page: number
}

/**
 * 관리자 문제 목록 (ADM-01). 공개 전·비공개 문제까지 모두 온다.
 *
 * 사용자 목록(`problemsQuery`)과 달리 주소에 조건을 싣지 않는다. 관리자 목록은 공유하거나
 * 북마크할 화면이 아니고, 조건도 검색어 하나뿐이다 — URL 동기화는 필터 다섯 개를 가진
 * LIST-01~05 때문에 생긴 기계다(problemListParams.ts). 새로고침하면 검색어가 풀린다.
 */
export function adminProblemListQuery({ keyword, page }: AdminProblemListParams) {
  const query = {
    page: page - 1,
    size: ADMIN_PAGE_SIZE,
    ...(keyword ? { keyword } : {}),
  }

  return queryOptions({
    queryKey: ['admin-problems', query] as const,
    queryFn: async () => {
      const result = await api.GET('/api/admin/problems', { params: { query } })
      if (result.data === undefined) fail(result)
      return result.data
    },
  })
}

/**
 * 관리자 문제 상세 (ADM-02·03). 최신 버전의 내용과 못 채운 공개 조건이 온다.
 *
 * 계약: "화면은 저장할 때마다 이 API를 다시 불러 공개 조건 체크리스트를 갱신한다."
 * 그래서 저장 뒤 이 키를 무효화한다 (`useSaveProblem`).
 */
export function adminProblemQuery(id: number) {
  return queryOptions({
    queryKey: ['admin-problem', id] as const,
    queryFn: async (): Promise<AdminProblemDetail> => {
      const result = await api.GET('/api/admin/problems/{id}', { params: { path: { id } } })
      if (result.data === undefined) fail(result)
      return result.data
    },
  })
}

/** 버전 목록 (ADM-07). 최신 버전부터 온다(계약). */
export function adminProblemVersionsQuery(id: number) {
  return queryOptions({
    queryKey: ['admin-problem', id, 'versions'] as const,
    queryFn: async (): Promise<ProblemVersionSummary[]> => {
      const result = await api.GET('/api/admin/problems/{id}/versions', {
        params: { path: { id } },
      })
      if (result.data === undefined) fail(result)
      return result.data
    },
  })
}

/** 고른 버전의 내용 (ADM-07). 읽기 전용이다. */
export function adminProblemVersionQuery(id: number, versionNo: number) {
  return queryOptions({
    queryKey: ['admin-problem', id, 'versions', versionNo] as const,
    queryFn: async (): Promise<AdminProblemVersion> => {
      const result = await api.GET('/api/admin/problems/{id}/versions/{versionNo}', {
        params: { path: { id, versionNo } },
      })
      if (result.data === undefined) fail(result)
      return result.data
    },
  })
}

/** 문제 등록 (ADM-02·03). 문제와 1번 버전을 초안으로 만들고 번호를 돌려준다. */
async function createProblem(body: ProblemInput): Promise<number> {
  const result = await api.POST('/api/admin/problems', { body })
  if (result.data === undefined) fail(result)
  return result.data.id
}

/** 어느 버전에 저장됐는지. 저장 뒤 사용자에게 알릴 문구를 이 값으로 가른다 (ADM-07). */
export interface SavedVersion {
  versionNo: number
  status: ProblemVersionStatus
}

/** 문제 수정 (ADM-02·03·07). 폼 전체를 보낸다(계약). */
async function updateProblem(id: number, body: ProblemInput): Promise<SavedVersion> {
  const result = await api.PUT('/api/admin/problems/{id}', { params: { path: { id } }, body })
  if (result.data === undefined) fail(result)
  return result.data
}

/**
 * 저장. 새 문제면 등록하고, 있는 문제면 수정한다.
 *
 * 등록은 번호가 없으니 `SavedVersion`을 만들어 돌려준다 — 계약이 1번 버전을 초안으로
 * 만든다고 정했다. 호출부가 두 경우를 가르지 않게 해, 저장 뒤 안내 문구를 한 곳에서 만든다.
 */
export function saveProblem(id: number | null, body: ProblemInput) {
  if (id === null) {
    return createProblem(body).then((newId) => ({
      id: newId,
      saved: { versionNo: 1, status: 'DRAFT' as const },
    }))
  }
  return updateProblem(id, body).then((saved) => ({ id, saved }))
}

/**
 * 테스트케이스 목록 (ADM-04). 비공개 케이스도 그대로 온다 — 관리자 API에만 있다.
 *
 * 계약: "케이스마다 정답 코드 검증 결과(`validation`)를 함께 준다." 검증 중에는 이 API를
 * 다시 부르지 않고 `GET .../solutions`로 진행을 본다(#37 PR B).
 */
export function adminTestCasesQuery(id: number) {
  return queryOptions({
    queryKey: ['admin-problem', id, 'test-cases'] as const,
    queryFn: async (): Promise<AdminTestCase[]> => {
      const result = await api.GET('/api/admin/problems/{id}/test-cases', {
        params: { path: { id } },
      })
      if (result.data === undefined) fail(result)
      return result.data
    },
  })
}

/**
 * 테스트케이스 저장 (ADM-04·07). 표 전체를 보낸다(계약).
 *
 * 저장하면 **정답 코드 검증 기록이 지워진다**. 고치지 않은 언어도 다시 검증해야 한다.
 * 공개·비공개 버전이 최신이면 새 초안(+1)이 생기고, 응답이 그 번호와 상태를 준다.
 */
export function saveTestCases(id: number, body: TestCaseInput[]): Promise<SavedVersion> {
  return api
    .PUT('/api/admin/problems/{id}/test-cases', { params: { path: { id } }, body })
    .then((result) => {
      if (result.data === undefined) fail(result)
      return result.data
    })
}

/**
 * ZIP 읽기 (ADM-04). **저장하지 않는다** — 읽은 목록을 표에 채우고 저장은 따로 누른다(계약).
 *
 * `multipart/form-data`라 본문을 `FormData`로 보낸다. openapi-fetch는 FormData를 보면
 * Content-Type을 직접 넣지 않고 브라우저가 boundary까지 붙이게 둔다 — 직접 넣으면 깨진다.
 */
export function readTestCaseZip(id: number, file: File): Promise<TestCaseInput[]> {
  const form = new FormData()
  form.append('file', file)

  return api
    .POST('/api/admin/problems/{id}/test-cases/zip', {
      params: { path: { id } },
      body: form as unknown as { file: string },
    })
    .then((result) => {
      if (result.data === undefined) fail(result)
      return result.data
    })
}

/**
 * 정답 코드와 검증 상태 (ADM-05).
 *
 * 계약: "검증 중에는 화면이 이 API만 다시 불러 진행을 보여 주고, 끝나면
 * `GET .../test-cases`를 한 번 받아 케이스별 결과를 그린다." 그래서 폴링은 여기 하나만
 * 걸고, 케이스 목록은 끝나는 순간 한 번 무효화한다(`SolutionsTab`).
 *
 * 간격은 제출 채점과 같은 `POLL_INTERVAL_MS`를 쓴다 — e2e가 기다리는 시간을 줄이려고
 * `VITE_POLL_INTERVAL_MS`로 바꿀 수 있게 둔 값이다. 검증에만 쓰는 값을 따로 두면 그
 * 조절이 이 화면만 비껴간다.
 */
export function adminSolutionsQuery(id: number) {
  return queryOptions({
    queryKey: ['admin-problem', id, 'solutions'] as const,
    queryFn: async (): Promise<AdminSolution[]> => {
      const result = await api.GET('/api/admin/problems/{id}/solutions', {
        params: { path: { id } },
      })
      if (result.data === undefined) fail(result)
      return result.data
    },
    refetchInterval: (query) =>
      query.state.data?.some((solution) => solution.status === 'VALIDATING')
        ? POLL_INTERVAL_MS
        : false,
  })
}

/**
 * 정답 코드 저장 (ADM-05·07). 탭 전체를 보낸다(계약).
 *
 * **저장만 하고 실행하지 않는다.** 검증은 `startValidation`이 따로 부른다.
 *
 * 코드가 하나라도 바뀌면 그 초안의 검증 기록이 지워지고 **두 언어 모두** 검증 전으로
 * 돌아간다 — 고치지 않은 언어도 다시 검증해야 한다(계약).
 */
export function saveSolutions(id: number, body: SolutionInput[]): Promise<SavedVersion> {
  return api
    .PUT('/api/admin/problems/{id}/solutions', { params: { path: { id } }, body })
    .then((result) => {
      if (result.data === undefined) fail(result)
      return result.data
    })
}

/**
 * 검증 시작 (ADM-05). 바로 202로 답하고, 진행은 `adminSolutionsQuery`로 본다.
 *
 * 계약: "'저장하고 검증'은 화면이 `PUT .../solutions` 다음에 이 API를 부른다. `PUT`
 * 응답의 `status`가 `DRAFT`일 때만 부른다." 공개·비공개 버전이 그대로면 이미 검증을
 * 통과한 버전이라, 부르면 409 `NOT_DRAFT`다.
 */
export async function startValidation(id: number): Promise<void> {
  const result = await api.POST('/api/admin/problems/{id}/validate', { params: { path: { id } } })
  if (result.error !== undefined) fail(result)
}

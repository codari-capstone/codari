import { DIFFICULTIES, SOLVE_STATUSES, type Difficulty, type SolveStatus } from '@/api/provisional'

export type SortField = 'id' | 'difficulty'
export type SortDirection = 'asc' | 'desc'

export interface ProblemListParams {
  keyword: string
  difficulty: Difficulty[]
  tag: string[]
  status: SolveStatus[]
  sortField: SortField
  sortDirection: SortDirection
  /** 보고 있는 페이지. 1부터 센다 (주소와 화면이 같은 번호를 쓴다). */
  page: number
}

/**
 * 한 페이지에 보여 주는 문제 수 (LIST-05).
 *
 * 기능명세가 20으로 정했고, 팀의 목록 조회 규칙(`docs/collaboration.md`의
 * `?page=0&size=20`)과 서버 기본값(#109)이 같은 값이다. 주소에는 쓰지 않는다 —
 * 사용자가 고를 수 있는 값이 아니다.
 */
export const PAGE_SIZE = 20

export const DEFAULT_PARAMS: ProblemListParams = {
  keyword: '',
  difficulty: [],
  tag: [],
  status: [],
  sortField: 'id',
  sortDirection: 'asc',
  page: 1,
}

const SORT_FIELDS: readonly SortField[] = ['id', 'difficulty']
const SORT_DIRECTIONS: readonly SortDirection[] = ['asc', 'desc']

function keepKnown<T extends string>(values: string[], allowed: readonly T[]): T[] {
  return values.filter((value): value is T => (allowed as readonly string[]).includes(value))
}

/**
 * URL을 필터 상태로 읽는다.
 *
 * URL은 사용자가 손으로 고칠 수 있고 옛 링크가 돌아다닐 수도 있다. 모르는 값은
 * 조용히 버린다. 그대로 쿼리로 내보내면 서버가 400을 주고 화면이 오류로 덮인다.
 */
export function parseParams(search: URLSearchParams): ProblemListParams {
  const [field, direction] = (search.get('sort') ?? '').split(',')
  const sortValid =
    SORT_FIELDS.includes(field as SortField) && SORT_DIRECTIONS.includes(direction as SortDirection)

  return {
    keyword: search.get('keyword')?.trim() ?? '',
    difficulty: keepKnown(search.getAll('difficulty'), DIFFICULTIES),
    // 태그 슬러그는 서버가 정하므로 허용 목록을 둘 수 없다. 빈 값만 버린다.
    // 없는 슬러그를 보내면 결과가 0건이 되고, 그건 EmptyState가 받는다.
    tag: search.getAll('tag').filter((slug) => slug.length > 0),
    status: keepKnown(search.getAll('status'), SOLVE_STATUSES),
    sortField: sortValid ? (field as SortField) : DEFAULT_PARAMS.sortField,
    sortDirection: sortValid ? (direction as SortDirection) : DEFAULT_PARAMS.sortDirection,
    page: parsePage(search.get('page')),
  }
}

/**
 * 주소의 페이지 번호. 1 이상의 정수가 아니면 1페이지로 본다.
 *
 * 결과 수를 모르는 시점이라 "결과보다 뒤인 페이지"는 여기서 가릴 수 없다. 그건 응답을
 * 받은 뒤 화면이 마지막 페이지로 되돌린다 (ProblemListPage). 다만 자가 치유는 200 빈
 * 응답에서만 도므로, 400으로 끝나는 값은 여기서 버려야 한다. 서버가 page를 `int`로
 * 받으니(ProblemController) 그 범위를 넘는 값은 바인딩 실패로 400이 되고 오류 화면만 남는다.
 */
const MAX_PAGE = 2_147_483_647

function parsePage(value: string | null): number {
  if (value === null) return DEFAULT_PARAMS.page
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_PAGE) return DEFAULT_PARAMS.page
  return parsed
}

/**
 * 필터 상태를 URL로 쓴다.
 *
 * 기본값은 쓰지 않는다. 주소가 짧아지고, 무엇보다 초기화 상태가 '/problems'와
 * 같아진다. EmptyState의 '필터 초기화'는 to="/problems" 링크라서 이 성질에 기댄다.
 */
export function serializeParams(params: ProblemListParams): URLSearchParams {
  const search = new URLSearchParams()

  if (params.keyword) search.set('keyword', params.keyword)
  for (const value of params.difficulty) search.append('difficulty', value)
  for (const value of params.tag) search.append('tag', value)
  for (const value of params.status) search.append('status', value)
  if (
    params.sortField !== DEFAULT_PARAMS.sortField ||
    params.sortDirection !== DEFAULT_PARAMS.sortDirection
  ) {
    search.set('sort', `${params.sortField},${params.sortDirection}`)
  }
  if (params.page !== DEFAULT_PARAMS.page) search.set('page', String(params.page))

  return search
}

/**
 * 파라미터를 바꾼 결과. **페이지만 바꾼 게 아니면 1페이지로 돌아간다.**
 *
 * 3페이지를 보다가 '어려움'을 체크하면 결과가 2개로 줄어 3페이지는 빈 표가 된다.
 * 되돌리는 책임을 호출부마다 두면(필터, 검색어, 정렬 — 지금 셋) 넷째를 더할 때
 * 잊고, 그 증상은 "필터를 걸면 가끔 빈 화면"이라 원인을 찾기 어렵다. 여기 한곳에 둔다.
 */
export function withChanges(
  params: ProblemListParams,
  next: Partial<ProblemListParams>,
): ProblemListParams {
  const merged = { ...params, ...next }
  const onlyPage = Object.keys(next).every((key) => key === 'page')
  return onlyPage ? merged : { ...merged, page: DEFAULT_PARAMS.page }
}

/** 전체 결과 수로 페이지 수를 센다. 결과가 없어도 1페이지는 있다. */
export function pageCount(totalElements: number): number {
  return Math.max(1, Math.ceil(totalElements / PAGE_SIZE))
}

/** 페이지 번호 버튼을 접을 때 현재 페이지 양옆으로 남기는 개수. */
const SIBLINGS = 1

/**
 * 보여 줄 페이지 번호. 양 끝(1, 마지막)은 늘 두고, 사이가 끊기면 null을 넣는다.
 *
 * 문제가 늘면 페이지도 늘어난다. 번호를 전부 그리면 어느 폭에서든 줄이 넘치므로
 * 처음부터 접어 둔다. null은 ProblemPagination이 '…'로 그린다. 컴포넌트가 아니라
 * 여기 두는 이유는 순수 계산이어서다 — 컴포넌트 파일에서 함수를 내보내면
 * react-refresh 경고가 붙고, 테스트도 렌더 없이 돌 수 있다.
 */
export function pageItems(page: number, pageCount: number): (number | null)[] {
  const pages = new Set<number>([1, pageCount])
  for (let near = page - SIBLINGS; near <= page + SIBLINGS; near += 1) {
    if (near >= 1 && near <= pageCount) pages.add(near)
  }

  const sorted = [...pages].sort((a, b) => a - b)
  const items: (number | null)[] = []
  for (const [index, value] of sorted.entries()) {
    const previous = sorted[index - 1]
    if (previous !== undefined && value - previous > 1) items.push(null)
    items.push(value)
  }
  return items
}

/**
 * 서버로 보내는 쿼리. 빈 값은 보내지 않는다. sort는 항상 보낸다.
 *
 * `page`는 **0부터** 센다(계약). 주소와 화면은 1부터 세므로 여기서 1을 뺀다.
 * `size`는 빼도 서버가 20으로 나눠 주지만(계약), 화면이 정한 값임을 드러내려고 보낸다.
 */
export function toQuery(params: ProblemListParams) {
  return {
    sort: `${params.sortField},${params.sortDirection}`,
    page: params.page - 1,
    size: PAGE_SIZE,
    ...(params.keyword ? { keyword: params.keyword } : {}),
    ...(params.difficulty.length > 0 ? { difficulty: params.difficulty } : {}),
    ...(params.tag.length > 0 ? { tag: params.tag } : {}),
    ...(params.status.length > 0 ? { status: params.status } : {}),
  }
}

/** 빈 상태 문구를 고르는 데 쓴다. 정렬은 결과를 줄이지 않으므로 필터가 아니다. */
export function hasActiveFilter(params: ProblemListParams): boolean {
  return (
    params.keyword.length > 0 ||
    params.difficulty.length > 0 ||
    params.tag.length > 0 ||
    params.status.length > 0
  )
}

/**
 * 열 머리를 눌렀을 때의 다음 정렬.
 *
 * 다른 열로 옮길 때 방향을 물려받지 않는다. 번호를 내림차순으로 보던 중
 * 난이도를 누르면 '어려움부터'가 되어 사용자가 놀란다.
 */
export function nextSort(
  params: ProblemListParams,
  field: SortField,
): Pick<ProblemListParams, 'sortField' | 'sortDirection'> {
  if (params.sortField !== field) return { sortField: field, sortDirection: 'asc' }
  return { sortField: field, sortDirection: params.sortDirection === 'asc' ? 'desc' : 'asc' }
}

/**
 * '필터 초기화' 링크가 이동할 때 싣는 location state.
 *
 * 초기화를 "쿼리가 비었는가"로 알아내면 안 된다. 마지막 남은 필터 체크를 푸는 일반 클릭도
 * 쿼리를 비우므로, 입력란에서 아직 URL에 안 쓴 검색어까지 같이 죽는다. 어느 쪽이든 도착
 * 주소는 똑같이 '/problems'라서 주소로는 둘을 가를 수 없고, 이동을 일으킨 쪽이 알려 줘야 한다.
 */
export const RESET_FILTERS_STATE = { resetFilters: true } as const

export function isResetFiltersNavigation(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'resetFilters' in state
}

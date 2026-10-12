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
}

export const DEFAULT_PARAMS: ProblemListParams = {
  keyword: '',
  difficulty: [],
  tag: [],
  status: [],
  sortField: 'id',
  sortDirection: 'asc',
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
  }
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

  return search
}

/** 서버로 보내는 쿼리. 빈 값은 보내지 않는다. sort는 항상 보낸다. */
export function toQuery(params: ProblemListParams) {
  return {
    sort: `${params.sortField},${params.sortDirection}`,
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

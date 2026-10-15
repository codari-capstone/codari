import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'

import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth/useAuth'
import {
  hasActiveFilter,
  isResetFiltersNavigation,
  nextSort,
  parseParams,
  RESET_FILTERS_STATE,
  serializeParams,
  type SortField,
} from './problemListParams'
import { problemListQuery } from './problemsQuery'
import { ProblemTable } from './ProblemTable'

/** 검색어를 URL에 반영하기까지 기다리는 시간. */
const SEARCH_DEBOUNCE_MS = 300

/** 문제 목록 (LIST-01~04). */
export function Component() {
  const [searchParams, setSearchParams] = useSearchParams()
  // parseParams는 렌더마다 새 객체를 만든다. 아래 디바운스 effect의 의존성에 draft도
  // 들어 있어 타이핑만으로는 메모 없이도 동작한다 — 메모가 실제로 막는 건 타이핑이
  // 멈춘 300ms 사이에 다른 이유로 리렌더가 일어나(예: isFetching 전환) params만 새로
  // 만들어지는 좁은 경우다. 그 경우를 테스트로 재현하지는 못했으니, 정합성 보장이 아니라
  // 참조 안정성을 위한 방어로 읽으면 된다.
  const params = useMemo(() => parseParams(searchParams), [searchParams])
  // 세션을 아직 모르는 동안은 비로그인으로 그리지 않는다. 이 PR 전에는 useAuth가
  // 비로그인으로 고정이어서 이 구간이 없었다. 지금은 로그인한 사람이 이 화면을 새로
  // 열면 /api/me가 오기 전까지 아래 안내가 보이고, 풀이 상태 열과 필터가 없는 표가
  // 그려진 뒤 열이 하나 늘며 표가 움직인다.
  const { isAuthenticated, isLoading: isSessionLoading } = useAuth()

  const { data, isPending, isFetching, error, refetch } = useQuery({
    ...problemListQuery(params),
    // 필터를 바꾸는 동안 이전 표를 유지한다. 스켈레톤으로 갈아끼우면 표가
    // 사라졌다 나타나며 화면이 뛴다. v5에서는 keepPreviousData를 placeholderData에 넘긴다.
    placeholderData: keepPreviousData,
  })

  const [draft, setDraft] = useState(params.keyword)
  // 내가 URL에 쓴 값을 기억한다. 이게 없으면 아래 두 effect가 서로를 되돌린다.
  const lastWritten = useRef(params.keyword)

  // 뒤로가기처럼 URL이 바깥에서 바뀌면 입력란을 맞춘다.
  useEffect(() => {
    if (params.keyword !== lastWritten.current) {
      lastWritten.current = params.keyword
      setDraft(params.keyword)
    }
  }, [params.keyword])

  // '필터 초기화'를 누르면 아직 URL에 안 쓴 검색어도 버린다. 위 effect는 keyword가 URL에서
  // 그대로 ''인 경우(필터만 걸려 있던 때)를 "안 바뀌었다"고 보고 draft를 두는데, 그러면
  // 디바운스가 곧 그 검색어를 다시 URL에 써서 사용자가 지운 필터 중 하나가 되살아난다.
  // 쿼리가 비었는지로 초기화를 가리면 마지막 필터를 체크 해제하는 일반 클릭에서도
  // 입력 중인 검색어가 죽으므로, 초기화 링크가 싣는 location state로 가른다.
  const location = useLocation()
  const [seenLocationKey, setSeenLocationKey] = useState(location.key)
  // effect가 아니라 렌더 중에 맞춘다(React 문서의 "props 변화에 state 조정" 방식).
  // lastWritten은 건드리지 않아도 된다 — 초기화로 keyword가 바뀌면 위 effect가 ''로 맞추고,
  // 안 바뀌었으면 lastWritten이 이미 ''이다.
  if (seenLocationKey !== location.key) {
    setSeenLocationKey(location.key)
    if (isResetFiltersNavigation(location.state)) setDraft('')
  }

  // 입력이 멈추면 URL에 반영한다. replace를 쓰지 않으면 글자마다 히스토리가 쌓여
  // 뒤로가기를 눌러도 한 글자씩만 지워진다.
  // 비교와 기록 모두 trim한 값으로 한다. parseParams가 keyword를 trim해서 돌려주므로
  // (params.keyword는 항상 trim된 값), draft 그대로를 lastWritten에 적으면 뒤쪽 공백이
  // 있는 동안 params.keyword와 영영 안 맞아 위 effect가 "밖에서 바뀌었다"고 오판해
  // setDraft로 입력란의 공백을 지워 버린다. trim해서 맞춰야 타이핑 중 공백이 보존된다.
  useEffect(() => {
    if (draft.trim() === params.keyword) return

    const timer = setTimeout(() => {
      lastWritten.current = draft.trim()
      setSearchParams(serializeParams({ ...params, keyword: draft.trim() }), { replace: true })
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [draft, params, setSearchParams])

  function handleSort(field: SortField) {
    setSearchParams(serializeParams({ ...params, ...nextSort(params, field) }))
  }

  const filtered = hasActiveFilter(params)

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">문제 목록</h1>

      <div className="relative">
        <Search
          aria-hidden="true"
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <Input
          type="search"
          aria-label="제목으로 검색"
          placeholder="제목으로 검색"
          className="pl-9"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </div>

      {/*
        비로그인에게 풀이 상태는 없는 데이터다. 열과 필터를 숨기는 대신
        왜 안 보이는지 한 줄로 알려 준다 (COM-05).
      */}
      {!isAuthenticated && !isSessionLoading ? (
        <p className="text-muted-foreground text-sm">
          <Link to="/login" className="text-primary hover:underline">
            로그인
          </Link>
          하면 내 풀이 상태가 함께 보입니다.
        </p>
      ) : null}

      {isPending || isSessionLoading ? <ListSkeleton rows={8} /> : null}

      {error ? <ErrorState problem={error} onRetry={() => void refetch()} /> : null}

      {data && !error && !isSessionLoading ? (
        data.content.length === 0 ? (
          filtered ? (
            <EmptyState
              title="조건에 맞는 문제가 없습니다"
              description="검색어나 필터를 바꿔 보세요."
              action={{ label: '필터 초기화', to: '/problems', state: RESET_FILTERS_STATE }}
            />
          ) : (
            <EmptyState
              title="아직 등록된 문제가 없습니다"
              description="관리자가 문제를 공개하면 여기에 보입니다."
            />
          )
        ) : (
          <>
            <p className="text-muted-foreground text-sm" aria-live="polite">
              {filtered ? '조건에 맞는 문제' : '문제'} {data.totalElements}개
            </p>
            <div aria-busy={isFetching} className={isFetching ? 'opacity-60' : undefined}>
              <ProblemTable
                problems={data.content}
                showSolveStatus={isAuthenticated}
                sortField={params.sortField}
                sortDirection={params.sortDirection}
                onSort={handleSort}
              />
            </div>
          </>
        )
      ) : null}
    </section>
  )
}

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
  PAGE_SIZE,
  pageCount,
  parseParams,
  RESET_FILTERS_STATE,
  serializeParams,
  withChanges,
  type SortField,
} from './problemListParams'
import { problemListQuery } from './problemsQuery'
import { ProblemPagination } from './ProblemPagination'
import { ProblemTable } from './ProblemTable'

/** 검색어를 URL에 반영하기까지 기다리는 시간. */
const SEARCH_DEBOUNCE_MS = 300

/** 문제 목록 (LIST-01~05). */
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
  // 열면 /api/users/me가 오기 전까지 아래 안내가 보이고, 풀이 상태 열과 필터가 없는 표가
  // 그려진 뒤 열이 하나 늘며 표가 움직인다.
  const { isAuthenticated, isLoading: isSessionLoading } = useAuth()

  const { data, isPending, isFetching, isPlaceholderData, error, refetch } = useQuery({
    ...problemListQuery(params),
    /*
      세션을 알기 전에는 받지 않는다 (COM-05).

      이 응답은 **누가 묻느냐에 따라 달라진다** — 서버는 비로그인에게 `solveStatus`를
      주지 않고 상태 필터도 무시한다. 그런데 이 경로는 permitAll이라 토큰 없이 물어도
      200이고, 그러면 401이 없어 갱신도 일어나지 않는다. 새로고침하면 access token이
      메모리에서 사라지므로(api/session.ts), 세션을 알기 전에 받아 둔 비로그인 목록이
      staleTime 동안 남아 '풀이 상태' 열이 전부 '—'로 보였다. 무효화할 곳도 없다 —
      로그인 경로만 이 캐시를 지운다(LoginPage).

      한 번 더 받는 대신 한 번을 늦춘다. 세션 조회는 이미 같은 화면에서 돌고 있다.
    */
    enabled: !isSessionLoading,
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
      setSearchParams(serializeParams(withChanges(params, { keyword: draft.trim() })), {
        replace: true,
      })
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [draft, params, setSearchParams])

  function handleSort(field: SortField) {
    setSearchParams(serializeParams(withChanges(params, nextSort(params, field))))
  }

  function handlePageChange(page: number) {
    // 지금 페이지의 번호 버튼을 누른 경우다. 그대로 올리면 내용은 그대로인데 scrollTo만 돌아
    // 화면이 맨 위로 튄다. 이전·다음은 disabled가 막으므로 막을 곳은 번호 버튼뿐이다.
    if (page === params.page) return
    setSearchParams(serializeParams(withChanges(params, { page })))
    // 페이지를 넘기면 표의 처음부터 읽는다. 아래쪽 버튼을 눌렀으므로 그대로 두면
    // 새 페이지의 첫 줄이 화면 위로 지나가 있다.
    window.scrollTo({ top: 0 })
  }

  const filtered = hasActiveFilter(params)
  // 범위 밖 판정은 지금 조건의 응답으로만 한다. keepPreviousData가 넘겨 주는
  // 묵은 응답으로 판단하면, 예를 들어 결과가 2건이던 필터에서 뒤로가기로 page=2(유효한
  // 페이지)에 들어올 때 옛 totalElements로 범위 밖이라 보고 1페이지로 끌어가며
  // 히스토리 항목까지 지운다.
  const fresh = isPlaceholderData ? undefined : data
  // 그리는 쪽은 반대로 묵은 응답의 페이지 수라도 쓴다. 응답을 기다리는 동안 1로 떨어뜨리면
  // 아래 `pages > 1`이 꺼져 이동 nav가 언마운트된다 — '다음'에 있던 키보드 포커스가 body로
  // 떨어지고, 표는 opacity-60으로 남은 채 그 아래 버튼 줄만 사라졌다 나타나 화면이 뛴다.
  // fresh가 있을 때는 data와 같은 객체라 위 판정과 어긋나지 않는다.
  const pages = data ? pageCount(data.totalElements) : 1
  // 주소에 적힌 페이지가 결과보다 뒤인 경우다 (손으로 고친 주소, 또는 문제가 지워진
  // 옛 링크). 서버는 오류가 아니라 빈 표를 준다(#109: offset이 행을 지나친다).
  // 결과가 있다는 것은 아는 상태이므로 마지막 페이지로 되돌린다.
  const outOfRange = fresh !== undefined && fresh.totalElements > 0 && params.page > pages
  // 묵은 응답이 빈 표인 구간(치유 직후가 그렇다)은 로딩으로 본다. 그대로 그리면
  // "아직 등록된 문제가 없습니다"가 깜빡인다.
  const waiting =
    isPending || isSessionLoading || outOfRange || (isPlaceholderData && data?.content.length === 0)

  useEffect(() => {
    if (!outOfRange) return
    // replace로 바꾼다. push하면 뒤로가기가 없는 페이지로 되돌아가 무한 왕복이 된다.
    setSearchParams(serializeParams(withChanges(params, { page: pages })), { replace: true })
  }, [outOfRange, pages, params, setSearchParams])

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
          {/* 헤더의 로그인 버튼과 같은 이유로 지금 주소를 싣는다 (AppHeader.tsx). */}
          <Link
            to="/login"
            state={{ from: `${location.pathname}${location.search}` }}
            className="text-primary hover:underline"
          >
            로그인
          </Link>
          하면 내 풀이 상태가 함께 보입니다.
        </p>
      ) : null}

      {/*
        error와 함께 켜지지 않게 막는다. isPending만 보던 때는 둘이 동시에 참일 수 없었지만,
        세션 확인이 조건에 들어오면서 "목록은 오류로 끝났는데 /api/users/me는 아직"인 구간이
        생겨 스켈레톤과 오류가 나란히 그려진다.
      */}
      {waiting && !error ? <ListSkeleton rows={PAGE_SIZE} /> : null}

      {error ? <ErrorState problem={error} onRetry={() => void refetch()} /> : null}

      {data && !error && !waiting ? (
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
            {/* 한 페이지로 끝나면 이동할 곳이 없다. 꺼진 버튼만 둘 띄우지 않는다. */}
            {pages > 1 ? (
              <ProblemPagination
                page={params.page}
                pageCount={pages}
                onPageChange={handlePageChange}
              />
            ) : null}
          </>
        )
      ) : null}
    </section>
  )
}

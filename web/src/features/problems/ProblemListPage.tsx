import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth/useAuth'
import {
  hasActiveFilter,
  nextSort,
  parseParams,
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
  // parseParams는 매번 새 객체를 만든다. 메모하지 않으면 아래 디바운스 effect의
  // 의존성이 렌더마다 바뀌어 타이머가 계속 초기화된다.
  const params = useMemo(() => parseParams(searchParams), [searchParams])
  const { isAuthenticated } = useAuth()

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

  // 입력이 멈추면 URL에 반영한다. replace를 쓰지 않으면 글자마다 히스토리가 쌓여
  // 뒤로가기를 눌러도 한 글자씩만 지워진다.
  useEffect(() => {
    if (draft === params.keyword) return

    const timer = setTimeout(() => {
      lastWritten.current = draft
      setSearchParams(serializeParams({ ...params, keyword: draft }), { replace: true })
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
      {!isAuthenticated ? (
        <p className="text-muted-foreground text-sm">
          <Link to="/login" className="text-primary hover:underline">
            로그인
          </Link>
          하면 내 풀이 상태가 함께 보입니다.
        </p>
      ) : null}

      {isPending ? <ListSkeleton rows={8} /> : null}

      {error ? <ErrorState problem={error} onRetry={() => void refetch()} /> : null}

      {data && !error ? (
        data.content.length === 0 ? (
          filtered ? (
            <EmptyState
              title="조건에 맞는 문제가 없습니다"
              description="검색어나 필터를 바꿔 보세요."
              action={{ label: '필터 초기화', to: '/problems' }}
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

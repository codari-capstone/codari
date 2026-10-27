import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'

import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DIFFICULTY_LABEL } from '@/features/problems/labels'
import { ProblemPagination } from '@/features/problems/ProblemPagination'
import { ADMIN_PAGE_SIZE, adminProblemListQuery } from './adminProblemQuery'
import { problemStateLabel } from './labels'

/** 검색어를 조회에 반영하기까지 기다리는 시간. 사용자 목록과 같은 값이다. */
const SEARCH_DEBOUNCE_MS = 300

/** 입력이 멈춘 뒤의 값. 글자마다 요청을 보내지 않으려고 둔다. */
function useDebounced(value: string, delay: number): string {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return settled
}

/**
 * 관리자 문제 관리 목록 (ADM-01, COM-05).
 *
 * 제목에 링크가 없다. 기본 정보·지문 탭(ADM-02·03)이 바로 뒤 PR이라 아직 갈 곳이 없다.
 */
export function Component() {
  const [draft, setDraft] = useState('')
  const [page, setPage] = useState(1)
  const keyword = useDebounced(draft, SEARCH_DEBOUNCE_MS)

  const { data, isPending, isFetching, error, refetch } = useQuery({
    ...adminProblemListQuery({ keyword, page }),
    // 검색어를 고치는 동안 이전 표를 유지한다. 스켈레톤으로 갈아끼우면 표가
    // 사라졌다 나타나며 화면이 뛴다 (사용자 목록과 같은 선택).
    placeholderData: keepPreviousData,
  })

  const pages = data ? Math.max(1, Math.ceil(data.totalElements / ADMIN_PAGE_SIZE)) : 1

  function handleSearch(next: string) {
    setDraft(next)
    // 3페이지를 보다가 검색어를 넣으면 결과가 줄어 그 페이지는 빈 표가 된다.
    // 여기서 되돌리므로 "결과보다 뒤인 페이지"를 응답을 받은 뒤 치유할 일이 없다.
    setPage(1)
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">문제 관리</h1>

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
          onChange={(event) => handleSearch(event.target.value)}
        />
      </div>

      {isPending && !error ? <ListSkeleton rows={ADMIN_PAGE_SIZE} /> : null}

      {error ? <ErrorState problem={error} onRetry={() => void refetch()} /> : null}

      {data && !error && !isPending ? (
        data.content.length === 0 ? (
          keyword ? (
            <EmptyState title="조건에 맞는 문제가 없습니다" description="검색어를 바꿔 보세요." />
          ) : (
            <EmptyState
              title="아직 만든 문제가 없습니다"
              description="새 문제를 등록하면 여기에 보입니다."
            />
          )
        ) : (
          <>
            <p className="text-muted-foreground text-sm" aria-live="polite">
              {keyword ? '조건에 맞는 문제' : '문제'} {data.totalElements}개
            </p>
            <div aria-busy={isFetching} className={isFetching ? 'opacity-60' : undefined}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">번호</TableHead>
                    <TableHead>제목</TableHead>
                    <TableHead className="w-28">난이도</TableHead>
                    <TableHead className="w-44">상태</TableHead>
                    <TableHead className="w-28">최신 버전</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.content.map((problem) => (
                    <TableRow key={problem.id}>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {problem.id}
                      </TableCell>
                      <TableCell className="font-medium">{problem.title}</TableCell>
                      <TableCell>{DIFFICULTY_LABEL[problem.difficulty]}</TableCell>
                      <TableCell>
                        {problemStateLabel(problem.latestStatus, problem.publishedVersionNo)}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        v{problem.latestVersionNo}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* 한 페이지로 끝나면 이동할 곳이 없다. 꺼진 버튼만 둘 띄우지 않는다. */}
            {pages > 1 ? (
              <ProblemPagination page={page} pageCount={pages} onPageChange={setPage} />
            ) : null}
          </>
        )
      ) : null}
    </section>
  )
}

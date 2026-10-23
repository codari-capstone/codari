import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { Link } from 'react-router'

import type { ProblemSummary } from '@/api/types'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DIFFICULTY_LABEL, SOLVE_STATUS_LABEL } from './labels'
import type { SortDirection, SortField } from './problemListParams'

interface ProblemTableProps {
  problems: ProblemSummary[]
  /** 비로그인이면 false. 열과 셀을 아예 만들지 않는다 (COM-05). */
  showSolveStatus: boolean
  sortField: SortField
  sortDirection: SortDirection
  onSort: (field: SortField) => void
}

function ariaSort(active: boolean, direction: SortDirection) {
  if (!active) return 'none' as const
  return direction === 'asc' ? ('ascending' as const) : ('descending' as const)
}

export function ProblemTable({
  problems,
  showSolveStatus,
  sortField,
  sortDirection,
  onSort,
}: ProblemTableProps) {
  function sortableHead(field: SortField, label: string, className?: string) {
    const active = sortField === field
    const Icon = !active ? ArrowUpDown : sortDirection === 'asc' ? ArrowUp : ArrowDown

    return (
      <TableHead aria-sort={ariaSort(active, sortDirection)} className={className}>
        <Button variant="ghost" size="sm" className="-ml-2.5" onClick={() => onSort(field)}>
          {label}
          <Icon aria-hidden="true" />
        </Button>
      </TableHead>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {sortableHead('id', '번호', 'w-20')}
          <TableHead>제목</TableHead>
          {sortableHead('difficulty', '난이도', 'w-28')}
          <TableHead>개념 태그</TableHead>
          {showSolveStatus ? <TableHead className="w-24">풀이 상태</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {problems.map((problem) => (
          <TableRow key={problem.id}>
            <TableCell className="text-muted-foreground tabular-nums">{problem.id}</TableCell>
            <TableCell className="font-medium">
              {/* 터치 영역을 44px로 띄우기보다 셀 전체를 누를 수 있게 둔다 */}
              <Link to={`/problems/${problem.id}`} className="hover:text-primary hover:underline">
                {problem.title}
              </Link>
            </TableCell>
            <TableCell>{DIFFICULTY_LABEL[problem.difficulty]}</TableCell>
            <TableCell>
              <span className="flex flex-wrap gap-1">
                {problem.tags.map((tag) => (
                  <span
                    key={tag.slug}
                    className="bg-muted text-muted-foreground rounded-md px-2 py-0.5 text-xs"
                  >
                    {tag.name}
                  </span>
                ))}
              </span>
            </TableCell>
            {showSolveStatus ? (
              <TableCell className="text-muted-foreground">
                {problem.solveStatus ? SOLVE_STATUS_LABEL[problem.solveStatus] : '—'}
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

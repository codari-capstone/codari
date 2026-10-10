import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import type { ProblemSummary } from '@/api/provisional'
import { DEFAULT_PARAMS } from './problemListParams'
import { ProblemTable } from './ProblemTable'

const rows: ProblemSummary[] = [
  {
    id: 1,
    slug: 'two-sum',
    title: '두 수의 합',
    difficulty: 'EASY',
    tags: [{ slug: 'array', name: '배열' }],
    solveStatus: 'SOLVED',
  },
  {
    id: 3,
    slug: 'valid-parentheses',
    title: '올바른 괄호',
    difficulty: 'MEDIUM',
    tags: [{ slug: 'string', name: '문자열' }],
    solveStatus: 'WRONG',
  },
]

function renderTable(props: Partial<React.ComponentProps<typeof ProblemTable>> = {}) {
  const onSort = props.onSort ?? vi.fn()
  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <ProblemTable
          problems={rows}
          showSolveStatus
          sortField={DEFAULT_PARAMS.sortField}
          sortDirection={DEFAULT_PARAMS.sortDirection}
          {...props}
          onSort={onSort}
        />
      ),
    },
  ])

  render(<RouterProvider router={router} />)
  return { onSort }
}

describe('ProblemTable', () => {
  it('난이도를 한국어로 보여 준다', () => {
    renderTable()

    expect(screen.getByText('쉬움')).toBeInTheDocument()
    expect(screen.getByText('보통')).toBeInTheDocument()
  })

  it('풀이 상태를 한국어로 보여 준다', () => {
    renderTable()

    expect(screen.getByText('맞음')).toBeInTheDocument()
    expect(screen.getByText('틀림')).toBeInTheDocument()
  })

  it('제목이 문제 풀이 화면 링크다', () => {
    renderTable()

    expect(screen.getByRole('link', { name: '두 수의 합' })).toHaveAttribute('href', '/problems/1')
  })

  it('개념 태그 이름을 보여 준다', () => {
    renderTable()

    expect(screen.getByText('배열')).toBeInTheDocument()
  })

  // 비로그인에게 풀이 상태는 없는 데이터다. 열을 남기면 빈 칸만 보인다.
  it('showSolveStatus가 false면 풀이 상태 열이 DOM에 없다', () => {
    renderTable({ showSolveStatus: false, problems: rows })

    expect(screen.queryByRole('columnheader', { name: '풀이 상태' })).not.toBeInTheDocument()
    expect(screen.queryByText('맞음')).not.toBeInTheDocument()
  })

  it('showSolveStatus가 true면 풀이 상태 열이 있다', () => {
    renderTable()

    expect(screen.getByRole('columnheader', { name: '풀이 상태' })).toBeInTheDocument()
  })

  it('정렬 중인 열에 aria-sort를 붙인다', () => {
    renderTable({ sortField: 'difficulty', sortDirection: 'desc' })

    expect(screen.getByRole('columnheader', { name: /난이도/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
    expect(screen.getByRole('columnheader', { name: /번호/ })).toHaveAttribute('aria-sort', 'none')
  })

  it('정렬하지 않는 열에는 버튼이 없다', () => {
    renderTable()

    expect(screen.queryByRole('button', { name: /제목/ })).not.toBeInTheDocument()
  })

  it('열 머리를 누르면 onSort에 그 열을 넘긴다', async () => {
    const user = userEvent.setup()
    const { onSort } = renderTable()

    await user.click(screen.getByRole('button', { name: /난이도/ }))

    expect(onSort).toHaveBeenCalledWith('difficulty')
  })
})

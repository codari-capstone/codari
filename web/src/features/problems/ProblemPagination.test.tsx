import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ProblemPagination } from './ProblemPagination'

describe('ProblemPagination', () => {
  function renderPagination(page: number, pageCount: number) {
    const onPageChange = vi.fn()
    render(<ProblemPagination page={page} pageCount={pageCount} onPageChange={onPageChange} />)
    return { onPageChange }
  }

  it('지금 페이지를 알린다', () => {
    renderPagination(2, 3)

    // 번호만으로는 무엇의 번호인지 읽히지 않는다.
    expect(screen.getByRole('button', { name: '2페이지' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: '1페이지' })).not.toHaveAttribute('aria-current')
  })

  it('첫 페이지에서는 이전을 누를 수 없다', () => {
    renderPagination(1, 3)

    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '다음' })).toBeEnabled()
  })

  it('마지막 페이지에서는 다음을 누를 수 없다', () => {
    renderPagination(3, 3)

    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '이전' })).toBeEnabled()
  })

  it('번호를 누르면 그 페이지를 올린다', async () => {
    const user = userEvent.setup()
    const { onPageChange } = renderPagination(1, 3)

    await user.click(screen.getByRole('button', { name: '3페이지' }))

    expect(onPageChange).toHaveBeenCalledWith(3)
  })

  it('다음을 누르면 한 페이지 뒤를 올린다', async () => {
    const user = userEvent.setup()
    const { onPageChange } = renderPagination(2, 3)

    await user.click(screen.getByRole('button', { name: '다음' }))

    expect(onPageChange).toHaveBeenCalledWith(3)
  })

  it('페이지 이동임을 이름으로 알린다', () => {
    renderPagination(1, 3)

    expect(screen.getByRole('navigation', { name: '페이지' })).toBeInTheDocument()
  })
})

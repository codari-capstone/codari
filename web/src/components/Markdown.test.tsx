import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Markdown } from './Markdown'

describe('Markdown', () => {
  it('마크다운을 그린다', () => {
    render(<Markdown>{'**굵게** 와 `코드`'}</Markdown>)

    expect(screen.getByText('굵게').tagName).toBe('STRONG')
    expect(screen.getByText('코드').tagName).toBe('CODE')
  })

  it('수식을 KaTeX로 그린다', () => {
    const { container } = render(<Markdown>{'복잡도는 $O(n \\log n)$이다.'}</Markdown>)

    expect(container.querySelector('.katex')).not.toBeNull()
  })

  /**
   * rehype-raw를 넣지 않았다는 것을 고정한다 (Markdown.tsx 주석).
   *
   * 넣으면 지문에 <script>를 심을 길이 열리고, 관리자 계정이 넘어가면 그 지문을 여는
   * 모든 사용자에게 실행된다. 이 테스트가 없으면 "수식 플러그인 추가"처럼 보이는 PR에
   * rehype-raw가 섞여 들어와도 아무것도 깨지지 않는다.
   */
  it('지문 속 HTML을 실행 가능한 태그로 만들지 않는다', () => {
    const { container } = render(
      <Markdown>{'<img src="x" onerror="alert(1)">보이는 글자'}</Markdown>,
    )

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
    expect(screen.getByText(/보이는 글자/)).toBeInTheDocument()
  })
})

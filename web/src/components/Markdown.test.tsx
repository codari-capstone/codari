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
   * 제목을 한 단계씩 내린다 (Markdown.tsx의 SHIFTED 주석).
   *
   * h1만 내리면 지문의 `#`과 `##`이 둘 다 h2가 되어 하위 절이 상위 절과 같은 단계로
   * 합쳐진다. 스크린 리더의 제목 목록에서 지문 구조가 평평해진다.
   */
  it('지문의 제목 위계를 한 단계씩 내린다', () => {
    render(<Markdown>{'# 큰 제목\n\n## 작은 제목\n\n### 더 작은 제목'}</Markdown>)

    expect(screen.getByText('큰 제목').tagName).toBe('H2')
    expect(screen.getByText('작은 제목').tagName).toBe('H3')
    expect(screen.getByText('더 작은 제목').tagName).toBe('H4')
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

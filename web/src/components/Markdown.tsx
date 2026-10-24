import 'katex/dist/katex.min.css'

import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'

import { cn } from 'cn'

/**
 * 지문의 제목을 한 단계씩 내린다.
 *
 * 페이지의 h1은 문제 제목이다. 지문이 h1을 하나 더 만들면 위계가 겹쳐 스크린 리더에서
 * 어느 것이 화면 제목인지 알 수 없다. h1만 내리면 지문의 `#`과 `##`이 둘 다 h2가 되어
 * 하위 절이 상위 절과 같은 단계로 합쳐지므로, 다섯 단계를 함께 내린다. h6은 더 내릴
 * 곳이 없어 그대로 둔다 — 지문이 여섯 단계까지 쓰는 일은 없다.
 *
 * 모듈 바깥에 둔다. 렌더마다 새 객체를 만들면 react-markdown이 그때마다 다시 그린다.
 */
const SHIFTED = {
  h1: ({ node: _node, ...props }: { node?: unknown }) => <h2 {...props} />,
  h2: ({ node: _node, ...props }: { node?: unknown }) => <h3 {...props} />,
  h3: ({ node: _node, ...props }: { node?: unknown }) => <h4 {...props} />,
  h4: ({ node: _node, ...props }: { node?: unknown }) => <h5 {...props} />,
  h5: ({ node: _node, ...props }: { node?: unknown }) => <h6 {...props} />,
}

/**
 * 마크다운과 수식을 그린다 (SOLVE-01). 관리자 지문 미리보기(ADM-03)도 이 컴포넌트를 쓴다.
 *
 * `rehype-raw`를 넣지 않는다. 지문을 쓰는 사람은 관리자지만, 넣으면 지문에 `<script>`를
 * 심을 길이 열린다 — 관리자 계정이 넘어가면 그 지문을 여는 모든 사용자에게 실행된다.
 * 지문에 HTML이 필요해진다면 그때 허용 태그를 정해 `rehype-sanitize`와 함께 넣는다.
 *
 * `@tailwindcss/typography`를 받지 않고 쓰는 태그만 직접 꾸민다. 지문에 나오는 것은
 * 문단·목록·강조·인라인 코드·코드 블록·표·링크뿐이고, 플러그인은 그보다 훨씬 넓은 CSS를
 * 싣는다.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
        'text-sm leading-relaxed',
        // 지문에는 긴 식별자·URL·입력 예시가 인라인 코드로 들어온다. 끊을 자리가 없는
        // 토큰 하나가 375px 화면에서 문서 전체를 가로로 밀어낸다(측정: 494 vs 375).
        // pre는 overflow-x-auto로 자기 안에서 흐르지만 인라인 코드와 평문은 그렇지 않다.
        // break-words(overflow-wrap: break-word)가 아니라 anywhere여야 한다 — break-word는
        // 요소의 min-content 폭을 줄이지 못해 grid·flex 자식이 그대로 늘어난다.
        '[overflow-wrap:anywhere]',
        '[&_p]:my-3 [&_strong]:font-semibold',
        '[&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold',
        // h2 아래는 한 덩어리로 꾸민다. 지문이 세 단계보다 깊이 들어가는 일은 없고,
        // 들어가도 위계는 태그가 들고 있다(components 주석).
        '[&_:is(h3,h4,h5,h6)]:mt-4 [&_:is(h3,h4,h5,h6)]:mb-2',
        '[&_:is(h3,h4,h5,h6)]:text-sm [&_:is(h3,h4,h5,h6)]:font-semibold',
        '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5',
        '[&_li]:my-1',
        '[&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]',
        // 코드 블록 안의 인라인 code 배경은 지운다. 겹치면 블록보다 진한 네모가 생긴다.
        '[&_pre]:bg-muted [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:p-3',
        // 디스플레이 수식($$...$$)은 한 줄로 그려져 꺾이지 않는다. 긴 식 하나가 375px
        // 화면에서 화면 전체를 가로로 민다 — pre와 같은 방식으로 자기 안에서 흐르게 한다.
        // overflow-wrap:anywhere는 여기에 듣지 않는다(KaTeX가 표로 배치한다).
        '[&_.katex-display]:overflow-x-auto [&_.katex-display]:py-1',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
        '[&_a]:text-primary [&_a]:underline',
        '[&_table]:my-3 [&_table]:w-full [&_table]:text-left',
        '[&_th]:border-border [&_th]:border-b [&_th]:py-1 [&_th]:font-medium',
        '[&_td]:border-border/60 [&_td]:border-b [&_td]:py-1',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={SHIFTED}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

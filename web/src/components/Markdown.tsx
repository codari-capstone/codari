import 'katex/dist/katex.min.css'

import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'

import { cn } from 'cn'

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
        '[&_p]:my-3 [&_strong]:font-semibold',
        '[&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold',
        '[&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold',
        '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5',
        '[&_li]:my-1',
        '[&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]',
        // 코드 블록 안의 인라인 code 배경은 지운다. 겹치면 블록보다 진한 네모가 생긴다.
        '[&_pre]:bg-muted [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:p-3',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
        '[&_a]:text-primary [&_a]:underline',
        '[&_table]:my-3 [&_table]:w-full [&_table]:text-left',
        '[&_th]:border-border [&_th]:border-b [&_th]:py-1 [&_th]:font-medium',
        '[&_td]:border-border/60 [&_td]:border-b [&_td]:py-1',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {children}
      </ReactMarkdown>
    </div>
  )
}

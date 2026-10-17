import type { ProblemDetailView } from '@/api/types'
import { Markdown } from '@/components/Markdown'

/**
 * 입출력 형식은 마크다운이 아니다 (SOLVE-01).
 *
 * 계약에서 `statementMarkdown`·`constraintsMarkdown`만 이름에 Markdown이 붙고
 * `inputDescription`·`outputDescription`은 안 붙는다 (DB 컬럼도 `input_description`이다).
 * 그래서 마크다운으로 그리지 않는다 — 평문을 마크다운으로 넘기면 `*`가 기울임이 되고
 * `$1 \le N$`은 수식이 아니라 글자로 남는다. 줄바꿈만 살린다.
 */
function PlainText({ children }: { children: string }) {
  // overflow-wrap은 Markdown과 같은 이유다 (Markdown.tsx 주석).
  return (
    <p className="text-sm leading-relaxed whitespace-pre-line [overflow-wrap:anywhere]">
      {children}
    </p>
  )
}

/** 지문 하단의 출처·라이선스·버전 (SOLVE-03). */
function Source({ problem }: { problem: ProblemDetailView }) {
  const { sourceName, sourceUrl, license, versionNo } = problem

  return (
    <footer className="text-muted-foreground border-border/60 flex flex-col gap-1 border-t pt-4 text-xs">
      {/* 세 값 모두 null일 수 있다(계약). 없는 줄은 라벨만 남지 않게 아예 뺀다. */}
      {sourceName ? (
        <p>
          출처:{' '}
          {sourceUrl ? (
            // 출처는 외부 사이트다. 새 탭으로 열고 referrer를 보내지 않는다.
            <a href={sourceUrl} target="_blank" rel="noreferrer" className="text-primary underline">
              {sourceName}
            </a>
          ) : (
            sourceName
          )}
        </p>
      ) : null}
      {license ? <p>라이선스: {license}</p> : null}
      {/* 버전은 늘 있다. 어느 지문을 보고 풀었는지가 제출 기록과 맞아야 한다 */}
      <p>문제 버전: v{versionNo}</p>
    </footer>
  )
}

/** 지문·입출력 형식·제약·출처 (SOLVE-01·03). */
export function Statement({ problem }: { problem: ProblemDetailView }) {
  return (
    <div className="flex flex-col gap-6">
      <Markdown>{problem.statementMarkdown}</Markdown>

      <section>
        <h2 className="mb-2 text-base font-semibold">입력</h2>
        <PlainText>{problem.inputDescription}</PlainText>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">출력</h2>
        <PlainText>{problem.outputDescription}</PlainText>
      </section>

      {/* 제약은 없으면 빈 문자열로 온다(계약). 빈 제목만 남기지 않는다. */}
      {problem.constraintsMarkdown.trim() ? (
        <section>
          <h2 className="mb-2 text-base font-semibold">제약</h2>
          <Markdown>{problem.constraintsMarkdown}</Markdown>
        </section>
      ) : null}

      <Source problem={problem} />
    </div>
  )
}

import type { ProblemDetailView } from '@/api/types'
import { Markdown } from '@/components/Markdown'

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

/**
 * 지문·입출력 형식·제약·출처 (SOLVE-01·03).
 *
 * 네 본문 모두 같은 렌더러를 쓴다. 계약에서 `inputDescription`·`outputDescription`만
 * 이름에 Markdown이 없어 처음에는 평문으로 그렸는데, #121이 "입력 형식. Markdown과 수식"
 * 으로 계약을 고쳤다 — 입력 범위를 `$2 \le N \le 10^5$`처럼 쓸 수 있어야 해서다.
 */
export function Statement({ problem }: { problem: ProblemDetailView }) {
  return (
    <div className="flex flex-col gap-6">
      <Markdown>{problem.statementMarkdown}</Markdown>

      <section>
        <h2 className="mb-2 text-base font-semibold">입력</h2>
        <Markdown>{problem.inputDescription}</Markdown>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">출력</h2>
        <Markdown>{problem.outputDescription}</Markdown>
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

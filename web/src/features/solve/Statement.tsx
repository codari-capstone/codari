import type { ProblemDetailView } from '@/api/types'
import { Markdown } from '@/components/Markdown'

/** 지문 하단의 출처·라이선스·버전 (SOLVE-03). */
function Source({ problem }: { problem: ProblemDetailView }) {
  const { sourceName, sourceUrl, license, versionNo } = problem

  // 지문 안 링크는 react-markdown이 scheme을 걸러 주지만(기본 urlTransform) 이 링크는
  // 우리가 직접 만든다. rehype-raw를 거절한 것과 같은 이유로 scheme을 본다
  // (Markdown.tsx 주석) — `javascript:` 출처 하나로 그 지문을 여는 모두가 당한다.
  // 계약의 `sourceName`은 길이 제한이 없는 문자열이다. 빈 문자열이면 없는 것으로 본다 —
  // `??`로 흘려보내면 '출처: ' 뒤에 글자 없는 링크만 남아, 눈으로도 스크린 리더로도
  // 가리킬 것이 없다.
  const name = sourceName?.trim() ? sourceName : null
  const href =
    sourceUrl && (sourceUrl.startsWith('https://') || sourceUrl.startsWith('http://'))
      ? sourceUrl
      : null

  return (
    <footer className="text-muted-foreground border-border/60 flex flex-col gap-1 border-t pt-4 text-xs [overflow-wrap:anywhere]">
      {/*
        세 값 모두 **따로** null일 수 있다(계약). 없는 줄은 라벨만 남지 않게 아예 뺀다.
        이름이 없고 주소만 있으면 주소를 글자로 쓴다 — 출처를 아예 숨기면 라이선스 표기
        의무를 지킬 수 없다.
      */}
      {name || sourceUrl ? (
        <p>
          출처:{' '}
          {href ? (
            // 출처는 외부 사이트다. 새 탭으로 열고 referrer를 보내지 않는다.
            <a href={href} target="_blank" rel="noreferrer" className="text-primary underline">
              {name ?? href}
            </a>
          ) : (
            (name ?? sourceUrl)
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

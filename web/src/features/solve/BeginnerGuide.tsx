import type { Language } from '@/api/types'
import { Markdown } from '@/components/Markdown'
import { BEGINNER_GUIDE } from '@/constants/beginnerGuide'
import { LANGUAGE_LABEL } from './labels'

/**
 * 입문자 안내 (SOLVE-07).
 *
 * 네이티브 `<details>`로 접는다. 펼치기·접기 상태와 키보드 조작이 전부 따라오고,
 * 꾸미기만 하면 된다 (ErrorState의 "서버 응답 원문"과 같은 방식).
 *
 * 처음에는 접어 둔다. 아는 사람에게는 화면을 가리는 덩어리이고, 모르는 사람은
 * 제목만 보고 열면 된다.
 */
export function BeginnerGuide({ language }: { language: Language }) {
  const guide = BEGINNER_GUIDE[language]

  return (
    <details className="border-border/60 rounded-lg border px-3 text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center font-medium">
        {`처음이신가요? ${LANGUAGE_LABEL[language]}로 표준 입력 읽는 법`}
      </summary>

      <div className="flex flex-col gap-3 pb-3">
        {/* pre의 꾸밈은 Markdown과 같은 값을 쓴다. 긴 줄은 자기 안에서 가로로 흐른다 */}
        <pre className="bg-muted overflow-x-auto rounded-lg p-3 text-xs leading-relaxed">
          {guide.readingExample}
        </pre>

        <dl className="flex flex-col gap-2">
          {guide.terms.map(({ term, meaning }) => (
            <div key={term}>
              {/* 용어 이름에 `cin`처럼 코드가 섞인다. 지문과 같은 렌더러로 그린다 */}
              <dt className="font-medium">
                <Markdown className="[&_p]:my-0">{term}</Markdown>
              </dt>
              <dd className="text-muted-foreground">
                <Markdown className="[&_p]:my-0">{meaning}</Markdown>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  )
}

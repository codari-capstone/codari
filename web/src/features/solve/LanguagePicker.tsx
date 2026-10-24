import type { Language, ProblemDetailView } from '@/api/types'
import { LANGUAGE_LABEL } from './labels'

/**
 * 언어 선택 (SOLVE-04).
 *
 * 네이티브 라디오를 쓴다. 두 가지 중 하나를 고르는 일에 역할·상태·방향키 이동이 전부
 * 따라오고, 꾸미기만 하면 된다 (ProblemFilters의 체크박스와 같은 이유).
 *
 * 문제가 주는 언어만 띄운다. 계약의 `languages`는 그 버전이 지원하는 목록이고, 지원하지
 * 않는 언어로 제출하면 서버가 `LANGUAGE_NOT_SUPPORTED`로 거절한다.
 */
export function LanguagePicker({
  languages,
  value,
  onChange,
}: {
  languages: ProblemDetailView['languages']
  value: Language
  onChange: (next: Language) => void
}) {
  return (
    <fieldset className="flex items-center gap-4">
      <legend className="sr-only">언어</legend>
      {languages.map(({ language }) => (
        // 44px 터치 영역(2.5.5)을 라벨 전체로 확보한다
        <label key={language} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <input
            type="radio"
            name="solve-language"
            value={language}
            checked={language === value}
            onChange={() => onChange(language)}
            className="accent-primary size-4"
          />
          {LANGUAGE_LABEL[language]}
        </label>
      ))}
    </fieldset>
  )
}

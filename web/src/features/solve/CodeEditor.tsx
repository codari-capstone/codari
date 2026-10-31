import { cpp } from '@codemirror/lang-cpp'
import { python } from '@codemirror/lang-python'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { useMemo } from 'react'

import type { Language } from '@/api/types'
import { useTheme } from '@/app/useTheme'

/** 언어별 문법. 줄 번호·자동 들여쓰기·괄호 짝은 basicSetup 기본값이 준다 (SOLVE-05). */
const SYNTAX = { PYTHON: python, CPP: cpp } satisfies Record<Language, unknown>

/**
 * 코드 에디터 (SOLVE-05).
 *
 * 테마는 앱 테마를 그대로 받는다. 이 줄이 없으면 다크 모드에서 화면은 어두운데
 * 에디터만 하얗다 — 기본값이 라이트다.
 */
export function CodeEditor({
  language,
  value,
  onChange,
  label = '코드 편집기',
  readOnly = false,
}: {
  language: Language
  value: string
  onChange: (next: string) => void
  /**
   * 편집 영역의 이름. 한 화면에 에디터가 둘 이상이면 넘겨야 한다 (ADM-05는 Python·C++를
   * 나란히 둔다) — 같은 이름이 둘이면 스크린 리더로는 어느 칸이 어느 언어인지 알 수 없다.
   */
  label?: string
  /**
   * 편집을 막는다. 보내는 중에 더 친 글자는 서버로 가지 않으므로, 그 사이 입력을 받으면
   * 안내도 없이 사라지거나 방금 보낸 것과 어긋난다 (ADM-05 저장·검증).
   *
   * `disabled` 대신 이 prop을 두는 까닭: CodeMirror의 편집 영역은 contenteditable이라
   * 바깥 `fieldset`의 `disabled`가 닿지 않는다.
   */
  readOnly?: boolean
}) {
  const { theme } = useTheme()

  // 배열이 매 렌더 새로 생기면 확장을 그때마다 다시 설정한다 — 글자를 칠 때마다다.
  // aria-label은 편집 영역(contenteditable)에 붙어야 한다. 바깥 div에 붙이면
  // 스크린 리더가 textbox의 이름으로 읽지 않는다.
  const extensions = useMemo(
    () => [SYNTAX[language](), EditorView.contentAttributes.of({ 'aria-label': label })],
    [language, label],
  )

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      theme={theme}
      extensions={extensions}
      readOnly={readOnly}
      minHeight="24rem"
      className="overflow-hidden rounded-lg border text-sm"
    />
  )
}

import { useMutation } from '@tanstack/react-query'

import { api } from '@/api/client'
import { fail } from '@/api/fail'
import type { Language } from '@/api/types'

export interface SubmitInput {
  problemId: number
  language: Language
  sourceCode: string
}

/**
 * 코드 제출 (SOLVE-09).
 *
 * 202로 접수만 되고 채점은 나중이다 — 판정은 결과 화면(#31)이 폴링해서 받는다.
 * 돌려주는 것은 제출 번호 하나다.
 *
 * 오류 `code`: `SOURCE_EMPTY`, `SOURCE_TOO_LONG`(UTF-8 64KB), `PROBLEM_NOT_FOUND`,
 * `LANGUAGE_NOT_SUPPORTED`(열어 둔 화면 사이에 새 버전이 공개된 경우). 모르는 언어와
 * NUL이 든 코드는 code 없는 400이고, 본문이 512KB를 넘으면 413이다.
 */
export async function submitCode(input: SubmitInput): Promise<number> {
  const result = await api.POST('/api/submissions', { body: input })
  if (result.data === undefined) fail(result)
  return result.data.id
}

/**
 * 제출 mutation.
 *
 * 중복 클릭 방지(SOLVE-09)는 버튼의 `disabled`가 맡는다(SubmitButton 주석). 여기에
 * 가드를 또 두지 않는다 — 같은 검사가 두 벌이 되면 둘이 갈라지는 날 어느 쪽이 진짜
 * 규칙인지 알 수 없다.
 */
export function useSubmit() {
  return useMutation({
    mutationFn: submitCode,
    // 제출은 돈이 드는 쪽이다(채점 큐에 들어간다). 실패하면 사람이 다시 누르게 한다.
    retry: false,
  })
}

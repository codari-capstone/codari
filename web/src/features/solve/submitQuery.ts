import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'

import { api } from '@/api/client'
import { fail } from '@/api/fail'
import type { Language } from '@/api/types'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'

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
 * **반응형 분기 바깥에서 불러야 한다.** 에디터 칸은 넓은 화면의 grid와 좁은 화면의 Tabs라는
 * 서로 다른 트리에 들어가므로, 제출이 떠 있는 동안 폭이 64rem을 넘나들면(창 크기 조절·기기
 * 회전) 그 안의 컴포넌트가 새로 마운트된다. mutation이 거기 있으면 idle로 되살아나 이동이
 * 일어나지 않고 버튼만 다시 열린다 — 서버는 접수했는데 사용자는 실패한 줄 알고 다시 눌러
 * 시도 횟수가 두 번 오른다. `Workspace`가 그 분기 위에 있어서 거기서 부른다.
 *
 * 이동도 여기서 한다. mutate에 콜백을 붙이면 그 호출에 매이는데, observer가 사라지면
 * 콜백도 실행되지 않는다. 계약이 주는 `id`로 우리가 아는 라우트를 만든다 — 202의
 * `Location` 헤더를 따라가면 "서버 경로와 화면 경로가 같다"는 가정이 코드에 숨는다.
 *
 * 중복 클릭 방지(SOLVE-09)는 버튼의 `disabled`가 맡는다(SubmitButton 주석). 여기에
 * 가드를 또 두지 않는다 — 같은 검사가 두 벌이 되면 둘이 갈라지는 날 어느 쪽이 진짜
 * 규칙인지 알 수 없다.
 */
export function useSubmit() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: submitCode,
    // 제출은 되돌릴 수 없다(시도 횟수가 오른다). 실패하면 사람이 다시 누르게 한다.
    retry: false,
    onSuccess: (id) => void navigate(`/submissions/${id}`),
    // 세션이 끊겼으면 로그인 화면으로 보낸다(session.ts). 쓰던 코드는 localStorage에
    // 남아 있어(SOLVE-11) 다시 로그인하면 그대로 열린다.
    onError: (error) => forgetSessionIfUnauthorized(queryClient, error),
  })
}

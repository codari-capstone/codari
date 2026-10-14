import { z } from 'zod'

import { toUserMessage } from '@/constants/errors'

/**
 * 로그인 입력 검사. 형식만 본다.
 *
 * 비밀번호 길이·문자 종류 규칙(docs/feature-spec.md '계정 규칙')을 여기 걸지 않는다.
 * 규칙이 바뀐 뒤 가입한 계정이 자기 비밀번호를 넣을 수 없게 되고, 길이로 거부하면
 * 그 자체가 비밀번호 길이를 알려 주는 단서가 된다 — COM-07이 실패 이유를 구분해
 * 주지 않기로 한 것과 어긋난다. 그 규칙은 가입·재설정 폼에서 쓴다.
 *
 * trim을 먼저 하는 이유: .min(1)만 걸면 공백 한 칸이 통과해 공백 자격 증명이
 * 서버로 나가 실패로 집계될 수 있다.
 */
export const loginSchema = z.object({
  email: z.string().trim().min(1, '이메일을 입력해 주세요').pipe(z.email('이메일 형식이 아닙니다')),
  password: z.string().trim().min(1, '비밀번호를 입력해 주세요'),
})

export type LoginForm = z.infer<typeof loginSchema>

/**
 * 로그인 실패 문구. 문구는 docs/feature-spec.md의 COM-07이 정했다.
 *
 * toUserMessage를 쓰지 않고 따로 두는 이유: 그쪽은 ErrorState용 {title, description}
 * 쌍을 돌려주는데, COM-07은 폼 아래 한 문장을 지정한다. 모양이 다르다.
 * 401·429 외의 오류는 toUserMessage로 넘겨 그 쪽 일반 문구를 쓴다.
 */
export function loginErrorMessage(error: unknown): string {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? (error as { status?: unknown }).status
      : undefined

  if (status === 401) {
    return '이메일 또는 비밀번호가 맞지 않아요. GitHub로 가입했다면 GitHub 로그인을 이용해 주세요'
  }
  if (status === 429) {
    return '로그인 시도가 너무 많아요. 5분 후 다시 시도해 주세요'
  }

  return toUserMessage(error).description
}

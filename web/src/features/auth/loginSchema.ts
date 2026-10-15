import { z } from 'zod'

import { toUserMessage } from '@/constants/errors'

/**
 * 로그인 입력 검사. 형식만 본다.
 *
 * 비밀번호 길이·문자 종류 규칙은 여기 걸지 않는다. docs/feature-spec.md '계정 규칙'이
 * "로그인(COM-07)에서는 이 규칙을 검사하지 않는다"고 정했고, 그 규칙은 가입(COM-06)과
 * 재설정(COM-08)의 것이다. 서버도 같다 — contracts/openapi.yaml의 /api/auth/login 본문에는
 * 길이 제약이 없다.
 *
 * 이메일은 앞뒤 공백을 떼고 검사한다. 복사·붙여넣기에서 딸려 온 공백이 흔하다.
 * 비밀번호는 떼지 않는다. 비밀번호는 불투명한 비밀값이라, 앞뒤 공백이 실제 값의 일부인
 * 계정이 있다. 값을 조용히 바꾸면 그 사용자는 영원히 로그인할 수 없고, COM-07의
 * 단일 문구 때문에 이유를 알 방법도 없다. 그래서 공백만 있는지만 검사하고 값은 그대로 둔다.
 */
/**
 * 가입이 받아 주는 이메일 모양. 서버 `AccountRules.java`의 정규식과 같은 것이다.
 *
 * zod의 `z.email()`을 쓰지 않는다. 그쪽이 더 엄격해서, 로컬 파트의 `!`·`%`를 막고 TLD를
 * 두 글자 이상으로 본다. 서버가 가입시켜 준 `user!x@example.com`이나 `a@b.c` 같은 주소가
 * 로그인 폼에서 막혀, 그 계정의 주인이 자기 주소를 넣을 수 없게 된다. COM-07의 단일 문구
 * 때문에 이유도 알 수 없다. 로그인 검사가 가입 검사보다 엄격해서는 안 된다 — 바로 위
 * 비밀번호 규칙을 여기 걸지 않는 것과 같은 이유다.
 */
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, '이메일을 입력해 주세요')
    .regex(EMAIL_PATTERN, '이메일 형식이 아닙니다'),
  password: z.string().refine((v) => v.trim().length > 0, '비밀번호를 입력해 주세요'),
})

export type LoginForm = z.infer<typeof loginSchema>

/**
 * 로그인 실패 문구. 문구는 docs/feature-spec.md의 COM-07이 정했다.
 *
 * 401·429 문구는 여기서 직접 정한다. toUserMessage는 title·description·retryable 객체를
 * 돌려주고 COM-07은 폼 아래 한 문장만 지정하므로, 이 파일은 그중 description만 쓴다.
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

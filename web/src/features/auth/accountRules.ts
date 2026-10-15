/**
 * 계정 규칙. 값의 기준은 docs/feature-spec.md의 '계정 규칙' 절이다.
 *
 * 서버도 같은 규칙을 가지고 있다 (api/.../auth/AccountRules.java). 값이 두 곳에 있지만
 * 화면 쪽은 이 파일 하나이고, 어긋나면 서버가 400 INVALID_NICKNAME·INVALID_PASSWORD로
 * 막는다. 화면이 규칙을 미리 보는 이유: 규칙을 어긴 값으로는 계정이 만들어질 수 없으니,
 * 왕복을 돌기 전에 알려 주는 쪽이 친절하다. 서버가 여전히 권위다.
 *
 * 로그인(COM-07)은 비밀번호 규칙을 검사하지 않는다. 그 이유는 loginSchema.ts에 있다.
 */

/**
 * 가입이 받아 주는 이메일 모양. 서버 `AccountRules.java`의 정규식과 같은 것이다.
 *
 * zod의 `z.email()`을 쓰지 않는다. 그쪽이 더 엄격해서, 로컬 파트의 `!`·`%`를 막고 TLD를
 * 두 글자 이상으로 본다. 서버가 가입시켜 준 `user!x@example.com`이나 `a@b.c` 같은 주소가
 * 폼에서 막혀, 그 계정의 주인이 자기 주소를 넣을 수 없게 된다.
 */
export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** 인증번호 자릿수. 계약의 패턴은 ^[0-9]{6}$다. */
export const CODE_LENGTH = 6

export const NICKNAME_MIN = 2
export const NICKNAME_MAX = 16
export const PASSWORD_MIN = 10
export const PASSWORD_MAX = 20

// 길이는 위 상수에서 만든다. 상수만 고치고 검사가 따로 남는 일이 없게 한다.
const NICKNAME_PATTERN = new RegExp(`^[가-힣A-Za-z0-9]{${NICKNAME_MIN},${NICKNAME_MAX}}$`)
const CODE_PATTERN = new RegExp(`^[0-9]{${CODE_LENGTH}}$`)

// 특수문자는 ASCII 기호만 센다. 서버가 \p{Punct}로 세므로 공백·한글 기호는 들어가지 않는다.
const SPECIAL_PATTERN = /[!-/:-@[-`{-~]/

export function isValidNickname(value: string): boolean {
  return NICKNAME_PATTERN.test(value)
}

export function isValidPassword(value: string): boolean {
  return (
    value.length >= PASSWORD_MIN &&
    value.length <= PASSWORD_MAX &&
    /[A-Z]/.test(value) &&
    /[a-z]/.test(value) &&
    /[0-9]/.test(value) &&
    SPECIAL_PATTERN.test(value)
  )
}

export function isValidCode(value: string): boolean {
  return CODE_PATTERN.test(value)
}

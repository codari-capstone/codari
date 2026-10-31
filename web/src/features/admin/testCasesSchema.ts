import { z } from 'zod'

import type { AdminTestCase, TestCaseInput } from '@/api/types'

/** 케이스 한도 (ADM-04). 계약의 `replaceTestCases` 설명과 같은 값이다. */
export const MAX_CASES = 10
export const MAX_INPUT_BYTES = 2 * 1024 * 1024
export const MAX_OUTPUT_BYTES = 1024 * 1024
export const MAX_TOTAL_BYTES = 10 * 1024 * 1024
/** ZIP 파일 자체의 상한. 계약: "화면은 올리기 전에 파일 크기를 확인해 막는다." */
export const MAX_ZIP_BYTES = 10 * 1024 * 1024

export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length
}

/** 사람이 읽는 크기. 표의 칸이 좁아 소수점은 한 자리까지만 쓴다. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

/**
 * 케이스 표 한 줄 (ADM-04).
 *
 * **글을 다듬지 않는다.** 계약이 "받은 그대로 저장한다 — 앞뒤 공백·줄바꿈 포함"으로 정했다.
 * `trim()`을 걸면 기대 출력의 마지막 줄바꿈이 사라져 채점이 틀어진다.
 *
 * 바이트 상한은 행마다 검사한다 — 어느 행이 넘쳤는지 말해 주어야 고칠 수 있다.
 * 합(10MiB)은 행 하나로는 알 수 없어 저장 직전에 `totalBytesError`로 본다.
 */
/**
 * 서버가 그 케이스에 대해 알려 준 것.
 *
 * **행과 함께 들고 다닌다.** 표의 위치로 맞추면 행을 지우거나 ZIP으로 바꿀 때 밀려서
 * 다른 케이스의 크기와 검증 상태가 붙는다 — 검증 통과한 케이스를 지우면 그 아래 행이
 * '검증 통과'를 물려받는다.
 */
export type CaseMeta = Pick<AdminTestCase, 'inputBytes' | 'outputBytes' | 'validation'>

const caseSchema = z
  .object({
    caseType: z.enum(['SAMPLE', 'HIDDEN']),
    input: z
      .string()
      .refine((value) => utf8Bytes(value) <= MAX_INPUT_BYTES, '입력이 2MiB를 넘어요'),
    output: z
      .string()
      .refine((value) => utf8Bytes(value) <= MAX_OUTPUT_BYTES, '기대 출력이 1MiB를 넘어요'),
    // 화면만 쓰는 값이라 검사하지 않는다. 다만 빠뜨리면 거절되므로, 메타 없는 행을
    // 만들어 두고 다른 케이스의 크기를 보여 주는 일은 생기지 않는다.
    meta: z.custom<CaseMeta | null>(),
  })
  // 저장 본문에서 meta를 뺀다. 서버 `TestCaseInput`에 없는 칸이라 보내면 안 된다.
  .transform(({ caseType, input, output }) => ({ caseType, input, output }))

export const testCasesSchema = z.object({
  cases: z.array(caseSchema).max(MAX_CASES, `케이스는 ${MAX_CASES}개까지예요`),
})

/** 폼이 들고 있는 한 줄. 서버가 모르는 행(새로 더한 행·ZIP으로 읽은 행)은 `meta`가 null이다. */
export type CaseRow = z.input<typeof caseSchema>

/** 폼이 들고 있는 값. `meta`가 붙어 있다. */
export type TestCasesForm = z.input<typeof testCasesSchema>

/** 검사를 지난 저장 본문. transform이 `meta`를 떼어 낸 모양이다. */
export type TestCasesBody = z.output<typeof testCasesSchema>

/** 빈 행. 종류는 공개 예제가 먼저 필요해(공개 조건 2개·검증의 전제) 그쪽을 기본값으로 둔다. */
export const EMPTY_CASE: CaseRow = { caseType: 'SAMPLE', input: '', output: '', meta: null }

/**
 * 합계 상한을 넘겼는지. 넘겼으면 문구, 아니면 null.
 *
 * zod 스키마에 넣지 않은 까닭은 오류가 붙을 자리가 행이 아니라 표 전체라서다. 배열에
 * `superRefine`으로 달면 어느 행도 짚지 못하는 오류가 행 옆에 뜬다.
 */
export function totalBytesError(cases: TestCaseInput[]): string | null {
  const total = cases.reduce((sum, item) => sum + utf8Bytes(item.input) + utf8Bytes(item.output), 0)
  if (total <= MAX_TOTAL_BYTES) return null
  return `모든 케이스의 합이 10MiB를 넘어요 (지금 ${formatBytes(total)})`
}

/**
 * 보낼 목록이 서버가 준 목록과 같은지.
 *
 * 서버는 목록이 같으면 아무것도 바꾸지 않는다(계약). 그걸 '반영했어요'로 알리면 공개
 * 버전이 바뀐 줄 알고 쓸데없이 다시 검증하게 된다.
 *
 * 폼의 `isDirty`로는 알 수 없다. rhf는 값 전체를 깊게 비교하므로, 글을 고쳤다 되돌려도
 * 비워 둔 `meta` 때문에 계속 '고쳐진' 상태로 남는다. 저장할 때 한 번만 보는 비교라
 * 글자 비교 비용은 문제가 되지 않는다(합계 바이트는 이미 매번 센다).
 */
export function sameAsSaved(cases: TestCaseInput[], saved: AdminTestCase[]): boolean {
  return (
    cases.length === saved.length &&
    cases.every(
      (row, index) =>
        row.caseType === saved[index]?.caseType &&
        row.input === saved[index]?.input &&
        row.output === saved[index]?.output,
    )
  )
}

/** 불러온 케이스를 폼 모양으로. 서버가 세어 준 크기와 검증 상태를 행에 달아 둔다. */
export function toForm(cases: AdminTestCase[]): TestCasesForm {
  return {
    cases: cases.map((item) => ({
      caseType: item.caseType,
      input: item.input,
      output: item.output,
      meta: {
        inputBytes: item.inputBytes,
        outputBytes: item.outputBytes,
        validation: item.validation,
      },
    })),
  }
}

/** 서버가 아직 모르는 케이스를 행으로. ZIP에서 읽은 것이 여기로 온다. */
export function toRows(cases: TestCaseInput[]): CaseRow[] {
  return cases.map((item) => ({ ...item, meta: null }))
}

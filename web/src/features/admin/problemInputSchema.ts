import type { UseFormReturn } from 'react-hook-form'
import { z } from 'zod'

import {
  DIFFICULTIES,
  type AdminProblemVersion,
  type Language,
  type ProblemInput,
} from '@/api/types'

/**
 * 폼이 다루는 언어와 순서. 계약이 `languages`를 PYTHON, CPP 순서로 보장한다.
 *
 * 행을 더하거나 빼는 UI는 명세에 없다. 두 줄을 늘 보내므로 `LANGUAGES` 공개 조건은
 * 저절로 채워진다. 계약은 초안에 언어가 하나만 있어도 받아 주지만(#144), 비워 둘 이유가
 * 생기면 그때 행을 지우는 UI를 더할 자리다.
 */
export const FORM_LANGUAGES = ['PYTHON', 'CPP'] as const satisfies readonly Language[]

/**
 * C++ 기준 제한에서 Python 제한을 만든다.
 *
 * **#65 실측으로 확정된 배수다**(`docs/judge-verdict-mapping.md` 1절). 그 문서가
 * "문제를 등록할 때 Python 행의 값에 반영해 저장하므로, 요청을 만들 때 다시 곱하지
 * 않는다"고 적었다 — 즉 **이 폼이 채우지 않으면 아무도 채우지 않는다.** Python 칸이
 * C++과 같은 값으로 저장되면 그 문제의 Python 제출은 전부 시간 초과가 된다.
 */
export function pythonLimits(cpp: { timeLimitMs: number; memoryLimitMb: number }) {
  return { timeLimitMs: cpp.timeLimitMs * 3 + 2000, memoryLimitMb: cpp.memoryLimitMb * 2 }
}

/**
 * 비어 있는 문자열을 null로 바꾼다.
 *
 * 계약은 `sourceName`·`sourceUrl`·`license`를 `[string, 'null']`로 받고 "null은 그 칸을
 * 비운다"로 정했다. HTML 입력은 빈 문자열을 주므로 그대로 보내면 '빈 출처'가 저장되고,
 * 화면은 `sourceName !== null`을 보고 빈 출처 줄을 그린다(SOLVE-03에서 겪은 그 버그다).
 */
const emptyToNull = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))

const languageSchema = z.object({
  language: z.enum(FORM_LANGUAGES),
  // 계약의 상한(MAX_CPU_TIME_LIMIT 20초, MAX_MEMORY_LIMIT 512MB)은 걸지 않는다.
  // 서버가 `LIMIT_OUT_OF_RANGE`와 함께 범위를 detail에 담아 주므로(계약), 여기 적으면
  // judge0.conf가 바뀌는 날 두 곳이 갈라진다. 아래는 계약이 스키마로 못 박은 하한이다.
  timeLimitMs: z.coerce.number().int('정수로 입력해 주세요').min(1, '1 이상이어야 해요'),
  memoryLimitMb: z.coerce.number().int('정수로 입력해 주세요').min(2, '2 이상이어야 해요'),
  starterCode: z.string(),
})

/**
 * 등록·수정 본문 검사 (ADM-02·03).
 *
 * 계약이 "화면이 막는다"고 적은 것만 여기서 막는다 — 빈 제목, 태그 4개 이상,
 * `http(s)`가 아닌 URL이다. 그 셋은 서버가 `code` 없는 400으로 답해 사용자에게 보여 줄
 * 문구가 없으므로, 보내기 전에 어느 칸이 문제인지 알려 주어야 한다.
 */
export const problemInputSchema = z.object({
  title: z.string().trim().min(1, '제목을 입력해 주세요').max(200, '200자까지 쓸 수 있어요'),
  // 난이도 값은 api/types.ts의 한 벌에서 가져온다. 여기 다시 적으면 계약에 난이도가
  // 하나 늘 때 그쪽 Record는 타입 오류로 알려 주는데 이 목록만 조용히 뒤처진다.
  difficulty: z.enum(DIFFICULTIES),
  // 초안에서는 비어도 된다(계약). 공개 조건에도 지문은 없다.
  statementMarkdown: z.string(),
  inputDescription: z.string(),
  outputDescription: z.string(),
  constraintsMarkdown: z.string(),
  sourceName: emptyToNull.pipe(z.string().max(200, '200자까지 쓸 수 있어요').nullable()),
  sourceUrl: emptyToNull.pipe(
    z
      .string()
      .regex(/^https?:\/\//, 'http:// 또는 https://로 시작해야 해요')
      .nullable(),
  ),
  license: emptyToNull.pipe(z.string().max(120, '120자까지 쓸 수 있어요').nullable()),
  // 초안에서는 비어도 되고, 공개하려면 1개 이상이어야 한다(계약). 공개는 #37이 다룬다.
  tags: z.array(z.string()).max(3, '태그는 3개까지 고를 수 있어요'),
  languages: z.array(languageSchema).length(FORM_LANGUAGES.length),
})

/**
 * 폼이 들고 있는 값. 입력란은 모두 문자열이라 제한값은 `coerce`가 숫자로 바꾼다.
 *
 * `z.input`을 쓴다 — `z.infer`는 `transform` **뒤**의 모양이라 `sourceName`이
 * `string | null`이 되고, 입력란에 null을 넣을 수 없어 register가 타입에서 막힌다.
 */
export type ProblemForm = z.input<typeof problemInputSchema>

/** 서버로 보낼 본문. transform이 끝난 모양이다. */
export type ProblemInputBody = z.output<typeof problemInputSchema>

/**
 * 새 문제의 기본값.
 *
 * 제한값은 C++ 기준 1초·256MB로 두고 Python은 보정값으로 채운다 — fixture의 손으로 쓴
 * 문제들과 같은 값이다. 둘 다 0으로 두면 첫 저장이 하한 오류로 막히고, 관리자는 무엇을
 * 넣어야 하는지 모른 채 숫자를 찾아야 한다.
 */
const CPP_DEFAULT = { timeLimitMs: 1000, memoryLimitMb: 256 }

export const EMPTY_FORM: ProblemForm = {
  title: '',
  difficulty: 'EASY',
  statementMarkdown: '',
  inputDescription: '',
  outputDescription: '',
  constraintsMarkdown: '',
  sourceName: '',
  sourceUrl: '',
  license: '',
  tags: [],
  languages: [
    { language: 'PYTHON', ...pythonLimits(CPP_DEFAULT), starterCode: '' },
    { language: 'CPP', ...CPP_DEFAULT, starterCode: '' },
  ],
}

/**
 * 서버에서 받은 버전을 폼 값으로 옮긴다.
 *
 * null을 빈 문자열로 되돌린다(입력란은 null을 못 받는다). 언어는 폼의 순서로 다시 세운다 —
 * 서버가 한 언어만 준 초안도 두 줄로 열려야 한다.
 */
export function toForm(version: AdminProblemVersion): ProblemForm {
  return {
    title: version.title,
    difficulty: version.difficulty,
    statementMarkdown: version.statementMarkdown,
    inputDescription: version.inputDescription,
    outputDescription: version.outputDescription,
    constraintsMarkdown: version.constraintsMarkdown,
    sourceName: version.sourceName ?? '',
    sourceUrl: version.sourceUrl ?? '',
    license: version.license ?? '',
    tags: [...version.tags],
    languages: FORM_LANGUAGES.map((language) => {
      const saved = version.languages.find((entry) => entry.language === language)
      const fallback = EMPTY_FORM.languages.find((entry) => entry.language === language)!
      return saved ? { ...saved } : { ...fallback }
    }),
  }
}

/**
 * Python 제한이 C++ 기준 보정값과 같은지.
 *
 * 폼을 열 때 'Python 제한을 직접 입력' 체크 상태를 정하는 데 쓴다. 보정값과 다르면
 * 누군가 일부러 넣은 값이므로, 잠긴 칸이 그 값을 덮어쓰지 않게 체크를 켠 채로 연다.
 */
export function followsPythonFormula(languages: ProblemInput['languages']): boolean {
  const python = languages.find((entry) => entry.language === 'PYTHON')
  const cpp = languages.find((entry) => entry.language === 'CPP')
  // 한쪽이 없으면 계산할 근거가 없다. 직접 입력으로 열어 둔다.
  if (python === undefined || cpp === undefined) return false

  const derived = pythonLimits(cpp)
  return (
    python.timeLimitMs === derived.timeLimitMs && python.memoryLimitMb === derived.memoryLimitMb
  )
}

/**
 * 폼 객체의 타입. 탭 컴포넌트가 이걸 받는다.
 *
 * 제네릭이 셋이다 — 세 번째가 `handleSubmit`에 transform 뒤의 값을 준다. 한 벌로 두는
 * 까닭은 탭이 `UseFormReturn<ProblemForm>`만 적으면 세 번째가 달라 대입되지 않아서다.
 */
export type ProblemFormApi = UseFormReturn<ProblemForm, unknown, ProblemInputBody>

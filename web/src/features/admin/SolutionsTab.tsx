import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import type { AdminSolution, CaseValidation, SolutionInput } from '@/api/types'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { VERDICT_INFO } from '@/constants/verdicts'
import { problemCode, problemMessage } from '@/features/auth/problemCode'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { CodeEditor } from '@/features/solve/CodeEditor'
import { LANGUAGE_LABEL } from '@/features/solve/labels'
import {
  adminSolutionsQuery,
  adminTestCasesQuery,
  saveSolutions,
  startValidation,
  type SavedVersion,
} from './adminProblemQuery'
import { savedVersionNotice, SOLUTION_STATUS_LABEL } from './labels'
import {
  changedLanguages,
  MAX_SOURCE_BYTES,
  SOLUTION_LANGUAGES,
  toBody,
  toCodes,
  tooLongLanguages,
  type Codes,
} from './solutionsState'

/** 저장 뒤 검증이 어떻게 됐는지. 안내 문구를 가르는 데 쓴다. */
type Validation = 'started' | 'not-draft' | 'failed' | 'skipped'

interface SaveResult {
  version: SavedVersion
  validation: Validation
  /** 검증 시작이 실패한 오류. 저장은 끝났으므로 던지지 않고 값으로 들고 온다. */
  validateError: unknown
}

/**
 * 저장·검증 결과 한 줄.
 *
 * 저장과 검증은 요청이 둘이라 "저장은 됐지만 검증은 안 됐다"가 실제로 일어난다. 한 문장이
 * 둘 다 말해 주지 않으면, 검증이 거절된 사람은 코드가 저장됐는지 알 수 없어 다시 쓴다.
 */
function saveNotice(
  result: SaveResult,
  changed: boolean,
  before: { latestVersionNo: number; publishedVersionNo: number | null } | null,
): string {
  const where = changed
    ? savedVersionNotice(result.version, before)
    : // 서버는 코드가 같으면 아무것도 바꾸지 않는다(계약).
      '바뀐 내용이 없어 그대로예요'

  switch (result.validation) {
    case 'started':
      return `${where}. 검증을 시작했어요`
    case 'not-draft':
      // 계약: "바뀐 게 없어 공개·비공개 버전이 그대로면 이미 검증을 통과한 버전이라 부를
      // 필요가 없다." 눌렀는데 아무 일도 없는 것처럼 보이지 않게 그 이유를 적는다.
      return `${where}. 이미 검증을 통과한 버전이라 다시 검증할 필요가 없어요`
    case 'failed':
      // 왜 못 했는지는 아래 오류 줄이 서버 문구로 말한다.
      return `${where}. 검증은 시작하지 못했어요`
    case 'skipped':
      return changed ? `${where}. 검증을 눌러야 공개할 수 있어요` : where
  }
}

/**
 * 서버 문구에 더할 안내.
 *
 * 문구 자체는 서버의 `detail`을 그대로 쓴다(`problemMessage`). 여기 적는 것은 **화면만
 * 아는 것**뿐이다 — 어느 탭으로 가야 하는지, 다시 눌러도 되는지. 서버 문장을 화면에 또
 * 적으면 서버가 다듬는 날 두 벌이 갈라진다.
 */
function validateHint(error: unknown): string | null {
  switch (problemCode(error)) {
    case 'NO_TEST_CASES':
      return '테스트케이스 탭에서 공개 예제를 먼저 넣어 주세요.'
    case 'JUDGE_UNAVAILABLE':
      return '채점 서버 문제라 코드를 고칠 필요는 없어요. 잠시 뒤 다시 눌러 주세요.'
    default:
      return null
  }
}

/** 그 언어의 상태 한 줄. 진행률·판정·검증 시각까지 한 자리에서 읽게 둔다. */
function statusLine(solution: AdminSolution | undefined, changed: boolean): string {
  if (solution === undefined) return changed ? '아직 저장하지 않았어요' : '정답 코드가 없어요'

  const parts = [SOLUTION_STATUS_LABEL[solution.status]]
  if (solution.status === 'VALIDATING') parts.push(`${solution.progress}%`)
  // 계약: FAILED면 `verdict`가 처음 틀린 케이스의 판정이다. 그게 왜 틀렸는지를 말해 준다.
  if (solution.status === 'FAILED' && solution.verdict !== null) {
    parts.push(VERDICT_INFO[solution.verdict].label)
  }
  if (solution.status === 'JUDGE_ERROR') parts.push('채점 서버 문제예요. 다시 검증해 주세요')
  // 고친 코드 옆에 '검증 통과'만 떠 있으면, 통과한 것이 지금 칸에 든 코드인 줄 알게 된다.
  if (changed) parts.push('고친 코드는 저장 전')

  return parts.join(' · ')
}

/** 케이스 하나의 판정 이름. 기록은 있는데 판정이 없으면 채점이 끝나지 않은 것이다. */
function verdictLabel(result: CaseValidation): string {
  return result.verdict === null
    ? VERDICT_INFO.JUDGE_ERROR.label
    : VERDICT_INFO[result.verdict].label
}

/**
 * 정답 코드·검증 탭 (ADM-05).
 *
 * **폼 상태를 react-hook-form으로 두지 않는다.** 편집은 서버 값 위에 덮어쓰는 층(`edited`)
 * 하나이고, 화면은 `edited[언어] ?? 서버 값`을 보여 준다. 그래서 (1) 안 고친 언어는 배경
 * 재조회가 가져온 새 값이 그대로 비치고, (2) 저장이 끝나면 층을 걷어내는 것만으로 서버
 * 값이 드러난다 — 불러온 값을 폼에 맞추는 effect가 아예 없다. 테스트케이스 탭에서 그
 * effect 하나가 세 가지 덮어쓰기 버그를 만들었다(#168 리뷰 두 차례).
 *
 * 문제 폼과 다른 저장 API를 쓰므로 부모가 탭별로 폼을 나눠 둔다. 이 탭은 네이티브 입력이
 * 없어(CodeMirror는 contenteditable) `<form>`을 두지 않고 버튼이 직접 저장한다.
 */
export function SolutionsTab({
  problemId,
  locked,
  before,
}: {
  problemId: number
  /** 읽기 전용이거나 검증 중이면 저장이 409다(계약). 눌러 보고 알게 하지 않는다. */
  locked: boolean
  /** 저장 뒤 어느 버전에 갔는지 말하는 데 쓴다 (ADM-07). */
  before: { latestVersionNo: number; publishedVersionNo: number | null } | null
}) {
  const queryClient = useQueryClient()
  const solutions = useQuery(adminSolutionsQuery(problemId))
  // 케이스별 결과 표가 이 목록의 `validation`을 그린다(계약이 거기 담아 준다).
  const cases = useQuery(adminTestCasesQuery(problemId))
  const [edited, setEdited] = useState<Partial<Codes>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [sizeError, setSizeError] = useState<string | null>(null)
  const [validateError, setValidateError] = useState<unknown>(null)

  const saved = solutions.data ?? []
  const codes: Codes = { ...toCodes(saved), ...edited }
  const changed = changedLanguages(codes, saved)
  const validating = saved.some((solution) => solution.status === 'VALIDATING')

  /**
   * 검증이 끝나는 순간 케이스를 한 번 받는다.
   *
   * 계약: "검증 중에는 화면이 `GET .../solutions`로 진행을 보고, 끝나면
   * `GET .../test-cases`를 한 번 받아 케이스별 결과를 그린다." 폴링하는 동안 케이스를
   * 같이 부르지 않는 까닭이 그것이다 — 결과는 끝나야 채워진다.
   *
   * 접두사가 같아 상세(버전 상태·공개 조건)와 케이스가 함께 다시 불린다.
   */
  const wasValidating = useRef(false)
  useEffect(() => {
    if (wasValidating.current && !validating) {
      void queryClient.invalidateQueries({ queryKey: ['admin-problem', problemId] })
      void queryClient.invalidateQueries({ queryKey: ['admin-problems'] })
    }
    wasValidating.current = validating
  }, [validating, queryClient, problemId])

  useEffect(() => {
    forgetSessionIfUnauthorized(queryClient, solutions.error ?? cases.error)
  }, [queryClient, solutions.error, cases.error])

  const save = useMutation({
    mutationFn: async ({
      body,
      validate,
    }: {
      body: SolutionInput[]
      validate: boolean
      changed: boolean
    }): Promise<SaveResult> => {
      const version = await saveSolutions(problemId, body)
      if (!validate) return { version, validation: 'skipped', validateError: null }
      // 계약: "`PUT` 응답의 `status`가 `DRAFT`일 때만 부른다." 공개·비공개 버전이 그대로면
      // 이미 검증을 통과한 버전이라, 부르면 409 `NOT_DRAFT`를 받는다.
      if (version.status !== 'DRAFT')
        return { version, validation: 'not-draft', validateError: null }

      try {
        await startValidation(problemId)
        return { version, validation: 'started', validateError: null }
      } catch (error) {
        // 던지지 않는다. 저장은 이미 끝났고, 던지면 화면이 '저장 실패'로 보여 코드가 날아간
        // 줄 알고 다시 쓰게 된다.
        return { version, validation: 'failed', validateError: error }
      }
    },
    onMutate: () => {
      // 묵은 안내·오류를 먼저 지운다. 두면 새 결과 옆에 남아 어느 쪽이 지금 상태인지 모른다.
      setNotice(null)
      setSizeError(null)
      setValidateError(null)
    },
    onSuccess: async (result, { changed: didChange }) => {
      // 저장이 끝났으니 덮어쓰기 층을 걷는다. 서버가 아는 값이 그대로 비쳐 보인다.
      setEdited({})
      setNotice(saveNotice(result, didChange, before))
      setValidateError(result.validateError)
      forgetSessionIfUnauthorized(queryClient, result.validateError)
      await queryClient.invalidateQueries({ queryKey: ['admin-problem', problemId] })
      await queryClient.invalidateQueries({ queryKey: ['admin-problems'] })
    },
    onError: (error) => {
      forgetSessionIfUnauthorized(queryClient, error)
    },
  })

  function handleSave(validate: boolean) {
    const tooLong = tooLongLanguages(codes)
    if (tooLong.length > 0) {
      const names = tooLong.map((language) => LANGUAGE_LABEL[language]).join('·')
      setSizeError(`${names} 코드가 ${MAX_SOURCE_BYTES / 1024}KB를 넘어요`)
      return
    }
    save.mutate({ body: toBody(codes), validate, changed: changed.length > 0 })
  }

  if (solutions.error) {
    return <ErrorState problem={solutions.error} onRetry={() => void solutions.refetch()} />
  }
  if (solutions.isPending) return <ListSkeleton rows={4} />

  return (
    <section aria-label="정답 코드" className="flex flex-col gap-4">
      <p className="text-muted-foreground text-xs">
        {`언어마다 ${MAX_SOURCE_BYTES / 1024}KB까지예요. 칸을 비우고 저장하면 그 언어의 정답 코드를 지워요`}
      </p>

      {notice ? (
        <p role="status" className="text-sm">
          {notice}
        </p>
      ) : null}

      {sizeError ? (
        <p role="alert" className="text-destructive text-sm">
          {sizeError}
        </p>
      ) : null}

      {save.error ? (
        <p role="alert" className="text-destructive text-sm">
          {problemMessage(save.error)}
        </p>
      ) : null}

      {validateError ? (
        <p role="alert" className="text-destructive text-sm">
          {[problemMessage(validateError), validateHint(validateError)].filter(Boolean).join(' ')}
        </p>
      ) : null}

      {SOLUTION_LANGUAGES.map((language) => {
        const solution = saved.find((item) => item.language === language)
        const dirty = changed.includes(language)
        const results = (cases.data ?? [])
          .map((item, index) => ({
            no: index + 1,
            caseType: item.caseType,
            result: item.validation[language],
          }))
          .filter((row): row is typeof row & { result: CaseValidation } => row.result !== null)

        return (
          <div key={language} className="border-border flex flex-col gap-3 rounded-xl border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="font-medium">{LANGUAGE_LABEL[language]}</h3>
              <p className="text-muted-foreground text-xs">{statusLine(solution, dirty)}</p>
            </div>

            {/* 계약: "정답 코드가 그대로 들어간 문자열이라 글자 그대로 보여 준다(HTML로
                렌더링하지 않는다)." 그래서 Markdown 컴포넌트를 쓰지 않는다. */}
            {solution?.compilerMessage ? (
              <pre className="bg-muted max-h-48 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap">
                {solution.compilerMessage}
              </pre>
            ) : null}

            <CodeEditor
              language={language}
              label={`${LANGUAGE_LABEL[language]} 코드 편집기`}
              value={codes[language]}
              onChange={(next) => setEdited((prev) => ({ ...prev, [language]: next }))}
            />

            {results.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>번호</TableHead>
                    <TableHead>종류</TableHead>
                    <TableHead>판정</TableHead>
                    <TableHead>시간</TableHead>
                    <TableHead>메모리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((row) => (
                    <TableRow key={row.no}>
                      <TableCell>{row.no}</TableCell>
                      <TableCell>{row.caseType === 'SAMPLE' ? '공개 예제' : '비공개'}</TableCell>
                      <TableCell>{verdictLabel(row.result)}</TableCell>
                      <TableCell>
                        {row.result.executionTimeMs === null
                          ? '-'
                          : `${row.result.executionTimeMs}ms`}
                      </TableCell>
                      <TableCell>
                        {row.result.memoryUsedKb === null
                          ? '-'
                          : `${row.result.memoryUsedKb.toLocaleString('ko-KR')}KB`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </div>
        )
      })}

      {locked || validating ? null : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={save.isPending}
            onClick={() => handleSave(false)}
          >
            {save.isPending ? '저장 중…' : '정답 코드 저장'}
          </Button>
          <Button
            type="button"
            className="min-h-11"
            disabled={save.isPending}
            onClick={() => handleSave(true)}
          >
            저장하고 검증
          </Button>
        </div>
      )}
    </section>
  )
}

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'

import type { CaseType } from '@/api/types'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Button } from '@/components/ui/button'
import { problemMessage } from '@/features/auth/problemCode'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { adminTestCasesQuery, readTestCaseZip, saveTestCases } from './adminProblemQuery'
import { savedVersionNotice } from './labels'
import {
  EMPTY_CASE,
  formatBytes,
  MAX_CASES,
  MAX_ZIP_BYTES,
  testCasesSchema,
  toForm,
  toRows,
  totalBytesError,
  type CaseMeta,
  type TestCasesBody,
  type TestCasesForm,
} from './testCasesSchema'

const CASE_TYPE_LABEL: Record<CaseType, string> = {
  SAMPLE: '공개 예제',
  HIDDEN: '비공개',
}

/**
 * 그 케이스의 검증 상태 한 줄 (ADM-04 '상태 표시').
 *
 * 판정 내용은 보여 주지 않는다 — 케이스별 결과 표는 ADM-05 탭의 몫이고(계약이 그렇게
 * 나눠 뒀다), 여기서는 "검증했는지"만 알면 된다.
 */
function validationLabel(validation: CaseMeta['validation']): string {
  const entries = (['PYTHON', 'CPP'] as const).filter((language) => validation[language] !== null)
  if (entries.length === 0) return '검증 전'

  const passed = entries.filter((language) => validation[language]?.verdict === 'ACCEPTED').length
  return `검증 ${passed}/${entries.length} 통과`
}

/**
 * 테스트케이스 탭 (ADM-04).
 *
 * **표가 아니라 펼침 목록이다.** 입력이 2MiB까지 오므로 열 줄에 textarea를 스물 깔면
 * "열 개가 제대로 들어왔나"를 한눈에 볼 수 없다. 주 입력 경로가 ZIP이라(계약·#164) 이
 * 화면의 첫 일은 **올린 것을 확인하는 것**이고, 고칠 행만 펼친다. `<details>`는 상태도
 * 필요 없다.
 *
 * 문제 폼과 **다른 폼이다.** 저장이 다른 API(`PUT .../test-cases`)이고, 중첩된 `<form>`은
 * 쓸 수 없어 부모가 폼을 탭별로 나눠 둔다.
 */
export function TestCasesTab({
  problemId,
  locked,
  before,
}: {
  problemId: number
  /** 검증 중이면 저장이 409다(계약). 눌러 보고 알게 하지 않는다. */
  locked: boolean
  /** 저장 뒤 어느 버전에 갔는지 말하는 데 쓴다 (ADM-07). */
  before: { latestVersionNo: number; publishedVersionNo: number | null } | null
}) {
  const queryClient = useQueryClient()
  const cases = useQuery(adminTestCasesQuery(problemId))
  const [notice, setNotice] = useState<string | null>(null)
  const [zipError, setZipError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // 세 번째 제네릭이 handleSubmit에 **검사를 지난 값**을 준다 — 스키마에 `meta`가 없어
  // zod가 걸러 내므로, 표가 들고 있는 서버 메타데이터가 저장 본문에 섞이지 않는다.
  //
  // `reValidateMode`를 기본값(onChange)으로 두면 저장이 한 번 실패한 뒤로는 어느 칸에서든
  // 한 글자 칠 때마다 전체 케이스를 다시 인코딩한다. 입력이 2MiB까지 오는 폼이라 그만큼이
  // 매 타이핑마다 돌아간다.
  const form = useForm<TestCasesForm, unknown, TestCasesBody>({
    resolver: zodResolver(testCasesSchema),
    reValidateMode: 'onSubmit',
    defaultValues: { cases: [] },
  })
  const rows = useFieldArray({ control: form.control, name: 'cases' })

  useEffect(() => {
    if (cases.data === undefined) return
    form.reset(toForm(cases.data))
  }, [cases.data, form])

  useEffect(() => {
    forgetSessionIfUnauthorized(queryClient, cases.error)
  }, [queryClient, cases.error])

  const save = useMutation({
    mutationFn: (body: TestCasesBody) => saveTestCases(problemId, body.cases),
    onSuccess: async (saved) => {
      // 저장하면 검증 기록이 지워진다(계약). 그 말을 하지 않으면 공개 조건이 왜 뒤로
      // 갔는지 알 수 없다.
      setNotice(`${savedVersionNotice(saved, before)}. 정답 코드를 다시 검증해야 해요`)
      // 공개 조건(`unmetConditions`)이 케이스 수로 바뀐다. 접두사가 같아 케이스 목록도
      // 함께 무효화된다.
      await queryClient.invalidateQueries({ queryKey: ['admin-problem', problemId] })
      await queryClient.invalidateQueries({ queryKey: ['admin-problems'] })
    },
    onError: (error) => {
      setNotice(null)
      forgetSessionIfUnauthorized(queryClient, error)
    },
  })

  const readZip = useMutation({
    mutationFn: (file: File) => readTestCaseZip(problemId, file),
    onSuccess: (read) => {
      // 읽기만 한다 — 저장은 따로 누른다(계약). 표를 바꿨으니 저장해야 한다고 알린다.
      // 읽어 온 행은 `meta`가 null이라 크기·검증 자리에 '저장하면' 문구가 뜬다.
      form.reset({ cases: toRows(read) })
      setNotice(`ZIP에서 ${read.length}개를 읽었어요. 저장을 눌러야 저장돼요`)
    },
    onError: (error) => {
      // 직전 성공 안내를 지운다. 두면 '읽었어요'와 오류가 함께 남아 어느 쪽이 지금
      // 상태인지 알 수 없다. 읽기도 401로 끝날 수 있어 세션도 정리한다.
      setNotice(null)
      forgetSessionIfUnauthorized(queryClient, error)
    },
  })

  function handleZipChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // 같은 파일을 다시 고를 수 있게 비운다. 안 비우면 두 번째 선택에 change가 안 난다.
    event.target.value = ''
    if (!file) return

    setZipError(null)
    // 계약: "ZIP 파일 자체도 10MiB까지고, 넘으면 code 없는 413이다. 화면은 올리기 전에
    // 파일 크기를 확인해 막는다." 413에는 보여 줄 문구가 없어 여기서 막아야 한다.
    if (file.size > MAX_ZIP_BYTES) {
      setZipError(`ZIP 파일은 10MiB까지예요 (고른 파일 ${formatBytes(file.size)})`)
      return
    }
    readZip.mutate(file)
  }

  /**
   * 그 행의 글을 고치면, 서버가 세어 준 크기와 검증 기록은 더 이상 이 행의 것이 아니다.
   *
   * 폼의 `dirtyFields`로 판단하지 않는 까닭: useFieldArray의 append·remove가 그걸 전체
   * 다시 계산해, 손대지 않은 행이 '편집됨'이 되고 행을 지우면 밀린 행이 아래 행의 값을
   * 쓴다. meta를 행에 달아 두고 글이 바뀔 때 비우면 순서가 바뀌어도 맞는다.
   *
   * 이미 null이면 `setValue`를 부르지 않는다 — 타이핑마다 리렌더가 돌지 않게.
   */
  function forgetMeta(index: number) {
    if (form.getValues(`cases.${index}.meta`) === null) return
    form.setValue(`cases.${index}.meta`, null)
  }

  function handleSave(values: TestCasesBody) {
    const tooBig = totalBytesError(values.cases)
    if (tooBig) {
      form.setError('cases', { message: tooBig })
      return
    }
    save.mutate(values)
  }

  // `watch`가 아니라 `useWatch`를 쓴다. `watch`는 React Compiler가 메모이즈할 수 없는
  // 함수라 이 컴포넌트의 컴파일이 통째로 건너뛰어진다(eslint가 경고한다).
  // 훅이므로 아래 이른 return보다 **위에** 있어야 한다.
  const watched = useWatch({ control: form.control, name: 'cases' })
  const sampleCount = watched.filter((item) => item.caseType === 'SAMPLE').length
  const hiddenCount = watched.length - sampleCount
  // ZIP 읽기와 저장이 같이 돌면, 저장의 재조회가 방금 읽어 온 표를 덮어쓴다. 어느 쪽이든
  // 도는 동안에는 둘 다 막는다.
  const busy = save.isPending || readZip.isPending

  if (cases.error) return <ErrorState problem={cases.error} onRetry={() => void cases.refetch()} />
  if (cases.isPending) return <ListSkeleton rows={4} />

  return (
    <form
      aria-label="테스트케이스"
      noValidate
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit(handleSave)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* 공개에 몇 개가 필요한지는 적지 않는다. ADM-06 공개 조건 체크리스트가 그 일을
            하고(#37 PR C), 같은 수를 두 곳에 쓰면 한쪽만 고쳐지는 자리가 생긴다. */}
        <p className="text-sm">{`공개 예제 ${sampleCount}개 · 비공개 ${hiddenCount}개`}</p>
        <p className="text-muted-foreground text-xs">{`케이스는 ${MAX_CASES}개까지, 입력 2MiB·기대 출력 1MiB·합 10MiB까지예요`}</p>
      </div>

      {notice ? (
        <p role="status" className="text-sm">
          {notice}
        </p>
      ) : null}

      {zipError ? (
        <p role="alert" className="text-destructive text-sm">
          {zipError}
        </p>
      ) : null}

      {readZip.error ? (
        <p role="alert" className="text-destructive text-sm">
          {problemMessage(readZip.error)}
        </p>
      ) : null}

      {save.error ? (
        <p role="alert" className="text-destructive text-sm">
          {problemMessage(save.error)}
        </p>
      ) : null}

      {form.formState.errors.cases?.message ? (
        <p role="alert" className="text-destructive text-sm">
          {form.formState.errors.cases.message}
        </p>
      ) : null}

      <fieldset disabled={locked} className="contents">
        {rows.fields.length === 0 ? (
          <p className="text-muted-foreground border-border rounded-xl border border-dashed p-6 text-center text-sm">
            케이스가 없어요. ZIP을 올리거나 행을 더해 주세요.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.fields.map((field, index) => {
              // 새 행은 watch가 아직 비어 있을 수 있어 field의 기본값으로 떨어진다.
              const row = watched[index] ?? field

              return (
                <li key={field.id} className="border-border rounded-xl border">
                  <details>
                    <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                      <span className="font-medium">{`${index + 1}. ${CASE_TYPE_LABEL[row.caseType]}`}</span>
                      <span className="text-muted-foreground text-xs">
                        {/* 바이트는 서버가 세어 준 값을 쓴다(계약이 담아 주는 이유다).
                            고친 행은 저장할 때 세므로 그 말을 적는다 — 2MiB 값에
                            매 타이핑마다 TextEncoder를 돌리지 않는다. */}
                        {row.meta === null
                          ? '저장하면 크기를 계산해요'
                          : `입력 ${formatBytes(row.meta.inputBytes)} · 출력 ${formatBytes(row.meta.outputBytes)}`}
                      </span>
                      <span className="text-muted-foreground ml-auto text-xs">
                        {row.meta === null ? '저장 전' : validationLabel(row.meta.validation)}
                      </span>
                    </summary>

                    <div className="flex flex-col gap-3 border-t px-3 py-3">
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor={`cases.${index}.caseType`} className="text-sm font-medium">
                          {`${index + 1}번 종류`}
                        </label>
                        <select
                          id={`cases.${index}.caseType`}
                          {...form.register(`cases.${index}.caseType`)}
                          className="border-input bg-background min-h-11 rounded-md border px-3 text-sm"
                        >
                          <option value="SAMPLE">공개 예제 (문제 화면에 보여요)</option>
                          <option value="HIDDEN">비공개 (채점에만 써요)</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label htmlFor={`cases.${index}.input`} className="text-sm font-medium">
                          {`${index + 1}번 입력`}
                        </label>
                        <textarea
                          id={`cases.${index}.input`}
                          rows={4}
                          {...form.register(`cases.${index}.input`, {
                            onChange: () => forgetMeta(index),
                          })}
                          className="border-input bg-background rounded-md border px-3 py-2 font-mono text-sm"
                        />
                        {form.formState.errors.cases?.[index]?.input ? (
                          <p className="text-destructive text-sm">
                            {form.formState.errors.cases[index]?.input?.message}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label htmlFor={`cases.${index}.output`} className="text-sm font-medium">
                          {`${index + 1}번 기대 출력`}
                        </label>
                        <textarea
                          id={`cases.${index}.output`}
                          rows={4}
                          {...form.register(`cases.${index}.output`, {
                            onChange: () => forgetMeta(index),
                          })}
                          className="border-input bg-background rounded-md border px-3 py-2 font-mono text-sm"
                        />
                        {form.formState.errors.cases?.[index]?.output ? (
                          <p className="text-destructive text-sm">
                            {form.formState.errors.cases[index]?.output?.message}
                          </p>
                        ) : null}
                      </div>

                      <div>
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11"
                          onClick={() => rows.remove(index)}
                        >
                          {`${index + 1}번 케이스 지우기`}
                        </Button>
                      </div>
                    </div>
                  </details>
                </li>
              )
            })}
          </ul>
        )}

        {locked ? null : (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={busy || rows.fields.length >= MAX_CASES}
              onClick={() => rows.append(EMPTY_CASE, { shouldFocus: false })}
            >
              케이스 더하기
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              {readZip.isPending ? 'ZIP 읽는 중…' : 'ZIP 올리기'}
            </Button>
            {/* 파일 칸은 꾸미기 어려워 숨기고 버튼으로 연다. aria-hidden을 걸지 않는 것은
                키보드로 label 없이 닿는 칸이 아니라서다 — 버튼이 접근 경로다. */}
            <input
              ref={fileInput}
              type="file"
              aria-label="ZIP 파일"
              accept=".zip,application/zip"
              className="hidden"
              onChange={handleZipChange}
            />
            <Button type="submit" className="min-h-11" disabled={busy}>
              {save.isPending ? '저장 중…' : '케이스 저장'}
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  )
}

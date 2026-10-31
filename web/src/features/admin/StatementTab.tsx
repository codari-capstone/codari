import { useEffect } from 'react'

import { Markdown } from '@/components/Markdown'
import { Input } from '@/components/ui/input'
import { LANGUAGE_LABEL } from '@/features/solve/labels'
import { Field } from './Field'
import { FORM_LANGUAGES, pythonLimits, type ProblemFormApi } from './problemInputSchema'

/** 지문 입력칸의 꾸밈. @/components/ui에 textarea가 없어 Input과 같은 값을 쓴다. */
const TEXTAREA = 'border-input bg-background min-h-32 rounded-md border px-3 py-2 text-sm'

const PYTHON = FORM_LANGUAGES.indexOf('PYTHON')
const CPP = FORM_LANGUAGES.indexOf('CPP')

/**
 * 지문 탭 (ADM-03).
 *
 * 미리보기는 사용자 화면과 **같은 컴포넌트**로 그린다. 따로 만들면 관리자가 보던 모양과
 * 사용자가 보는 모양이 갈라지고, 수식·코드 블록처럼 어긋나기 쉬운 것이 하필 그런 자리다.
 */
export function StatementTab({
  form,
  manualPython,
  onManualPythonChange,
}: {
  form: ProblemFormApi
  /** Python 제한을 관리자가 직접 넣는 중인지. 상태는 폼을 reset하는 쪽이 들고 있다. */
  manualPython: boolean
  onManualPythonChange: (manual: boolean) => void
}) {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = form

  const statement = watch('statementMarkdown')
  const cpp = {
    timeLimitMs: Number(watch(`languages.${CPP}.timeLimitMs`)),
    memoryLimitMb: Number(watch(`languages.${CPP}.memoryLimitMb`)),
  }
  const derived = pythonLimits(cpp)

  /**
   * 잠겨 있으면 계산한 값을 **폼에 써 넣는다.** 보여 주기만 하면 저장되는 것은 그대로
   * 옛 값이라, 화면에는 보정값이 떠 있는데 C++과 같은 값이 저장된다.
   *
   * `shouldDirty`가 있어야 한다. 이 값은 C++ 칸을 고쳐서 생긴 **고친 값**인데, 표시를
   * 안 하면 폼이 '안 고쳐진 칸'으로 알고 있다가 상세를 다시 받을 때 서버 값으로
   * 되돌린다(`keepDirtyValues`). 그러면 C++는 2000, Python은 5000처럼 공식과 어긋난
   * 짝이 저장되고, 다음에 열 때는 '직접 입력'으로 굳어 보정도 되지 않는다.
   *
   * 불러온 직후에는 더럽혀지지 않는다 — 계산값이 기본값과 같으면 rhf가 표시하지 않는다.
   */
  const { timeLimitMs, memoryLimitMb } = derived
  useEffect(() => {
    if (manualPython) return
    setValue(`languages.${PYTHON}.timeLimitMs`, timeLimitMs, { shouldDirty: true })
    setValue(`languages.${PYTHON}.memoryLimitMb`, memoryLimitMb, { shouldDirty: true })
  }, [manualPython, timeLimitMs, memoryLimitMb, setValue])

  return (
    <div className="flex flex-col gap-4">
      <Field
        id="statementMarkdown"
        label="지문"
        hint="Markdown과 $수식$을 쓸 수 있어요. 초안에서는 비워 둬도 저장돼요."
        error={errors.statementMarkdown?.message}
      >
        {/* min-w-0이 없으면 칸이 안쪽 pre의 min-content 폭까지 늘어나 화면이 가로로 밀린다 */}
        <div className="grid gap-3 md:grid-cols-2">
          <textarea
            id="statementMarkdown"
            rows={14}
            className={`${TEXTAREA} min-w-0 font-mono`}
            {...register('statementMarkdown')}
          />
          <div className="min-w-0">
            <p className="text-muted-foreground mb-1 text-xs">미리보기</p>
            <div className="border-border/60 min-h-32 overflow-x-auto rounded-md border p-3">
              {statement.trim() === '' ? (
                <p className="text-muted-foreground text-sm">아직 쓴 내용이 없어요.</p>
              ) : (
                <Markdown>{statement}</Markdown>
              )}
            </div>
          </div>
        </div>
      </Field>

      <Field id="inputDescription" label="입력 형식" error={errors.inputDescription?.message}>
        <textarea
          id="inputDescription"
          rows={4}
          className={TEXTAREA}
          {...register('inputDescription')}
        />
      </Field>

      <Field id="outputDescription" label="출력 형식" error={errors.outputDescription?.message}>
        <textarea
          id="outputDescription"
          rows={4}
          className={TEXTAREA}
          {...register('outputDescription')}
        />
      </Field>

      <Field
        id="constraintsMarkdown"
        label="제약 조건"
        hint="없으면 비워 둬요."
        error={errors.constraintsMarkdown?.message}
      >
        <textarea
          id="constraintsMarkdown"
          rows={4}
          className={TEXTAREA}
          {...register('constraintsMarkdown')}
        />
      </Field>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">언어별 제한과 시작 코드</legend>

        {/*
          Python 제한을 C++에서 계산해 넣는다 (#65 실측 배수).

          `docs/judge-verdict-mapping.md` 1절이 "등록할 때 Python 행의 값에 반영해
          저장하므로 요청을 만들 때 다시 곱하지 않는다"고 적었다 — 채점기는 저장된 값을
          그대로 쓴다. 그래서 두 칸에 같은 값이 저장되면 **그 문제의 Python 제출이 전부
          시간 초과**가 된다. 버튼으로 두면 안 눌러도 저장되고, 말없이 덮으면 관리자가
          일부러 넣은 값이 사라진다. 그래서 기본은 읽기 전용이고 열려면 체크한다.
        */}
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={manualPython}
            onChange={(event) => onManualPythonChange(event.target.checked)}
            className="accent-primary size-4"
          />
          Python 제한을 직접 입력
        </label>

        {FORM_LANGUAGES.map((language, index) => {
          const locked = index === PYTHON && !manualPython

          return (
            // fieldset+legend로 둔다. 두 언어의 칸 이름이 같아('시간 제한 (ms)')
            // 묶음에 이름이 없으면 사람도 스크린 리더도 어느 언어의 칸인지 알 수 없다.
            <fieldset
              key={language}
              className="border-border/60 flex flex-col gap-3 rounded-md border p-3"
            >
              <legend className="text-sm font-medium">{LANGUAGE_LABEL[language]}</legend>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  id={`time-${language}`}
                  label="시간 제한 (ms)"
                  hint={locked ? `C++ 기준 ×3 + 2000ms = ${derived.timeLimitMs}ms` : undefined}
                  error={errors.languages?.[index]?.timeLimitMs?.message}
                >
                  <Input
                    id={`time-${language}`}
                    type="number"
                    inputMode="numeric"
                    readOnly={locked}
                    className={locked ? 'bg-muted' : undefined}
                    {...register(`languages.${index}.timeLimitMs`)}
                  />
                </Field>

                <Field
                  id={`memory-${language}`}
                  label="메모리 제한 (MB)"
                  hint={locked ? `C++ 기준 ×2 = ${derived.memoryLimitMb}MB` : undefined}
                  error={errors.languages?.[index]?.memoryLimitMb?.message}
                >
                  <Input
                    id={`memory-${language}`}
                    type="number"
                    inputMode="numeric"
                    readOnly={locked}
                    className={locked ? 'bg-muted' : undefined}
                    {...register(`languages.${index}.memoryLimitMb`)}
                  />
                </Field>
              </div>

              <Field
                id={`starter-${language}`}
                label="시작 코드"
                error={errors.languages?.[index]?.starterCode?.message}
              >
                <textarea
                  id={`starter-${language}`}
                  rows={6}
                  className={`${TEXTAREA} font-mono`}
                  {...register(`languages.${index}.starterCode`)}
                />
              </Field>
            </fieldset>
          )
        })}
      </fieldset>
    </div>
  )
}

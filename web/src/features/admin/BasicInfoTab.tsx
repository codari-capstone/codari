import { useQuery } from '@tanstack/react-query'

import { DIFFICULTIES } from '@/api/types'
import { ErrorState } from '@/components/ErrorState'
import { Input } from '@/components/ui/input'
import { DIFFICULTY_LABEL } from '@/features/problems/labels'
import { conceptTagsQuery } from '@/features/problems/problemsQuery'
import { Field } from './Field'
import type { ProblemFormApi } from './problemInputSchema'

/** 문제 하나에 붙일 수 있는 개념 태그 수 (ADM-02, `docs/AI_FEATURES.md` 7절). */
const MAX_TAGS = 3

/**
 * 기본 정보 탭 (ADM-02).
 *
 * 개념 태그는 **고르기만 한다.** 새 태그를 만드는 API는 #34이고, 문제에 태그를 연결하는
 * 것은 이 계약(`ProblemInput.tags`)이다. 목록은 사용자 목록 필터가 쓰는
 * `conceptTagsQuery`를 그대로 쓴다 — 거의 바뀌지 않아 staleTime이 길게 걸려 있다.
 */
export function BasicInfoTab({ form }: { form: ProblemFormApi }) {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = form

  const tags = useQuery(conceptTagsQuery())
  const chosen = watch('tags')

  function toggle(slug: string) {
    const next = chosen.includes(slug) ? chosen.filter((item) => item !== slug) : [...chosen, slug]
    // 검사를 거치게 한다. 안 그러면 공개 조건이 태그 수를 보는 #37에서 값이 묵은다.
    setValue('tags', next, { shouldValidate: true, shouldDirty: true })
  }

  return (
    <div className="flex flex-col gap-4">
      <Field id="title" label="제목" error={errors.title?.message}>
        <Input id="title" {...register('title')} />
      </Field>

      <Field id="difficulty" label="난이도" error={errors.difficulty?.message}>
        {/* @/components/ui에 select가 없다. 네이티브를 Input과 같은 꾸밈으로 쓴다. */}
        <select
          id="difficulty"
          {...register('difficulty')}
          className="border-input bg-background min-h-11 rounded-md border px-3 text-sm"
        >
          {DIFFICULTIES.map((value) => (
            <option key={value} value={value}>
              {DIFFICULTY_LABEL[value]}
            </option>
          ))}
        </select>
      </Field>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium">개념 태그</legend>
        <p className="text-muted-foreground text-xs">
          {`${MAX_TAGS}개까지 고를 수 있어요. 공개하려면 1개 이상이어야 해요.`}
        </p>

        {/* 실패를 '불러오는 중…'으로 두면 영원히 그 문구다. 태그 없이는 공개도 못 하니
            이유와 다시 시도를 함께 보여 준다 (ErrorState의 버튼은 type="button"이다). */}
        {tags.error ? (
          <ErrorState problem={tags.error} onRetry={() => void tags.refetch()} />
        ) : tags.data === undefined ? (
          <p className="text-muted-foreground text-sm">태그를 불러오는 중…</p>
        ) : (
          <div className="flex flex-wrap gap-x-4">
            {tags.data.map((tag) => {
              const checked = chosen.includes(tag.slug)
              return (
                // 44px 터치 영역을 라벨 전체로 확보한다 (ProblemFilters와 같은 모양).
                <label
                  key={tag.slug}
                  className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    // 다 골랐으면 더 켤 수 없게 막는다. 스키마가 받아 주지 않는 값을
                    // 넣게 두면 저장을 눌러야 알게 된다.
                    disabled={!checked && chosen.length >= MAX_TAGS}
                    onChange={() => toggle(tag.slug)}
                    className="accent-primary size-4"
                  />
                  {tag.name}
                </label>
              )
            })}
          </div>
        )}

        {errors.tags ? <p className="text-destructive text-sm">{errors.tags.message}</p> : null}
      </fieldset>

      <Field
        id="sourceName"
        label="출처"
        hint="공개하려면 출처 이름이 있어야 해요. 직접 만든 문제면 '직접 제작'처럼 적어요."
        error={errors.sourceName?.message}
      >
        <Input id="sourceName" {...register('sourceName')} />
      </Field>

      <Field
        id="sourceUrl"
        label="원본 URL"
        hint="사용자 화면에 링크로 나가요. 비워 두면 출처 이름만 보여요."
        error={errors.sourceUrl?.message}
      >
        <Input id="sourceUrl" type="url" placeholder="https://" {...register('sourceUrl')} />
      </Field>

      <Field id="license" label="라이선스" error={errors.license?.message}>
        <Input id="license" placeholder="CC BY-SA 4.0" {...register('license')} />
      </Field>
    </div>
  )
}

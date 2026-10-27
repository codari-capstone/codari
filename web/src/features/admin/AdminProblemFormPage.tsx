import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm, type FieldErrors } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router'

import type { ProblemInput } from '@/api/types'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { problemMessage } from '@/features/auth/problemCode'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { parsePathId } from '@/lib/pathId'
import { adminProblemQuery, adminProblemVersionQuery, saveProblem } from './adminProblemQuery'
import { BasicInfoTab } from './BasicInfoTab'
import { savedVersionNotice, VERSION_STATUS_LABEL } from './labels'
import {
  EMPTY_FORM,
  followsPythonFormula,
  problemInputSchema,
  toForm,
  type ProblemForm,
  type ProblemInputBody,
} from './problemInputSchema'
import { StatementTab } from './StatementTab'
import { VersionsTab } from './VersionsTab'

/** 기본 정보 탭이 들고 있는 칸. 숨은 탭의 오류를 어디서 보여 줄지 가르는 데 쓴다. */
const BASIC_FIELDS = [
  'title',
  'difficulty',
  'tags',
  'sourceName',
  'sourceUrl',
  'license',
] as const satisfies readonly (keyof ProblemForm)[]

/**
 * 오류가 있는 첫 탭.
 *
 * 탭으로 가린 칸의 오류는 **보이지 않는다.** 그대로 두면 저장을 눌러도 아무 일이 없는
 * 것처럼 보이고, 어디가 틀렸는지 알 길이 없다.
 */
function firstErrorTab(errors: FieldErrors<ProblemForm>): string {
  return BASIC_FIELDS.some((field) => errors[field] !== undefined) ? 'basic' : 'statement'
}

/**
 * 문제 등록·수정과 버전 보기 (ADM-02·03·07, COM-05).
 *
 * 세 주소가 이 컴포넌트를 쓴다. 폼이 같고 다른 것은 어디서 값을 읽고 저장을 보여 주느냐뿐이다.
 *   - `/admin/problems/new` — 빈 폼으로 등록
 *   - `/admin/problems/:id` — 최신 버전을 고친다
 *   - `/admin/problems/:id/versions/:versionNo` — 그 버전을 읽기 전용으로 본다
 *
 * 읽기 전용은 `fieldset`의 `disabled` 하나로 끝낸다 — 칸마다 `readOnly`를 넘기면 칸을
 * 더할 때마다 빠뜨릴 자리가 생긴다. 링크는 `disabled`에 걸리지 않아 버전 사이 이동은 된다.
 */
export function Component() {
  const params = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const isNew = params.id === undefined
  const id = parsePathId(params.id)
  const versionNo = parsePathId(params.versionNo)
  const readOnly = params.versionNo !== undefined

  const detail = useQuery({ ...adminProblemQuery(id ?? 0), enabled: id !== null && !readOnly })
  const version = useQuery({
    ...adminProblemVersionQuery(id ?? 0, versionNo ?? 0),
    enabled: id !== null && versionNo !== null,
  })

  // 세 번째 제네릭이 handleSubmit에 **transform 뒤**의 값을 준다. 없으면 폼이 들고 있는
  // 모양(빈 문자열)이 그대로 넘어와, null로 비워야 하는 칸이 ''로 저장된다.
  const form = useForm<ProblemForm, unknown, ProblemInputBody>({
    resolver: zodResolver(problemInputSchema),
    defaultValues: EMPTY_FORM,
  })

  /** 체크박스를 눌러 바꾼 값. 누르기 전에는 불러온 값에서 판단한다. */
  const [manualOverride, setManualOverride] = useState<boolean | null>(null)
  const [tab, setTab] = useState('basic')
  const [notice, setNotice] = useState<string | null>(null)

  const loaded = version.data ?? detail.data

  /**
   * 저장된 Python 제한이 보정값과 다르면 누군가 일부러 넣은 값이다. 잠긴 칸이 그 값을
   * 덮어쓰지 않게 '직접 입력'을 켠 채로 연다 — 지난 버전을 읽기 전용으로 볼 때도
   * 그래야 저장된 값이 그대로 보인다.
   *
   * 상태로 들고 effect에서 맞추지 않고 파생한다. 불러온 내용이 바뀌면 판단도 함께
   * 바뀌어야 하는데, 상태로 두면 그 둘을 맞추는 effect가 하나 더 필요하다.
   */
  const manualPython =
    manualOverride ?? (loaded !== undefined && !followsPythonFormula(loaded.languages))

  useEffect(() => {
    if (loaded === undefined) return
    form.reset(toForm(loaded))
  }, [loaded, form])

  const before =
    detail.data === undefined
      ? null
      : {
          latestVersionNo: detail.data.versionNo,
          publishedVersionNo: detail.data.publishedVersionNo,
        }

  const save = useMutation({
    mutationFn: (body: ProblemInput) => saveProblem(id, body),
    onSuccess: async ({ id: savedId, saved }) => {
      setNotice(savedVersionNotice(saved, before))
      // 계약: "화면은 저장할 때마다 이 API를 다시 불러 공개 조건 체크리스트를 갱신한다."
      // 접두사가 같아 버전 목록까지 함께 무효화된다.
      await queryClient.invalidateQueries({ queryKey: ['admin-problem', savedId] })
      await queryClient.invalidateQueries({ queryKey: ['admin-problems'] })
      if (isNew) void navigate(`/admin/problems/${savedId}`, { replace: true })
    },
    onError: (error) => forgetSessionIfUnauthorized(queryClient, error),
  })

  if (!isNew && id === null) {
    return (
      <EmptyState
        title="없는 문제입니다"
        description="주소를 확인해 주세요."
        action={{ label: '문제 관리로', to: '/admin' }}
        headingLevel={1}
      />
    )
  }
  if (readOnly && versionNo === null) {
    return (
      <EmptyState
        title="없는 버전입니다"
        description="주소를 확인해 주세요."
        action={{ label: '문제 관리로', to: '/admin' }}
        headingLevel={1}
      />
    )
  }

  const loadError = readOnly ? version.error : detail.error
  if (loadError) return <ErrorState problem={loadError} headingLevel={1} />

  // 등록을 마친 직후에는 상세를 다시 받는 동안에도 폼을 그대로 둔다. 스켈레톤으로 덮으면
  // 방금 띄운 저장 안내까지 사라져, 저장이 됐는지 알 수 없게 된다.
  const loading = !save.isSuccess && (readOnly ? version.isPending : !isNew && detail.isPending)
  if (loading) return <ListSkeleton rows={6} />

  // 검증 중에는 저장이 409 `PROBLEM_VALIDATING`이다(계약). 눌러 보고 알게 하지 않는다.
  const validating = detail.data?.status === 'VALIDATING'
  const locked = readOnly || validating

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">
          {isNew ? '새 문제' : readOnly ? `v${versionNo} 보기` : '문제 수정'}
        </h1>
        <Link to="/admin" className="text-primary text-sm hover:underline">
          문제 관리로
        </Link>
      </div>

      {readOnly ? (
        <p role="status" className="text-muted-foreground text-sm">
          {`지난 버전이라 고칠 수 없어요. 상태는 '${loaded ? VERSION_STATUS_LABEL[loaded.status] : ''}'예요.`}
        </p>
      ) : null}

      {validating ? (
        <p role="status" className="text-sm">
          정답 코드를 검증하는 중이에요. 끝나면 다시 고칠 수 있어요.
        </p>
      ) : null}

      {notice ? (
        <p role="status" className="text-sm">
          {notice}
        </p>
      ) : null}

      {save.error ? (
        <p role="alert" className="text-destructive text-sm">
          {problemMessage(save.error)}
        </p>
      ) : null}

      <form
        aria-label={isNew ? '새 문제' : '문제 수정'}
        noValidate
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(
          (values) => save.mutate(values),
          (errors) => setTab(firstErrorTab(errors)),
        )}
      >
        {/* disabled 하나로 모든 입력칸이 잠긴다. 링크는 걸리지 않는다 */}
        <fieldset disabled={locked} className="flex flex-col gap-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList aria-label="문제 작성 영역" className="min-h-11">
              <TabsTrigger value="basic" className="min-h-11">
                기본 정보
              </TabsTrigger>
              <TabsTrigger value="statement" className="min-h-11">
                지문
              </TabsTrigger>
              {id === null ? null : (
                <TabsTrigger value="versions" className="min-h-11">
                  버전
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="basic">
              <BasicInfoTab form={form} />
            </TabsContent>
            <TabsContent value="statement">
              <StatementTab
                form={form}
                manualPython={manualPython}
                onManualPythonChange={setManualOverride}
              />
            </TabsContent>
            {id === null ? null : (
              <TabsContent value="versions">
                <VersionsTab problemId={id} />
              </TabsContent>
            )}
          </Tabs>
        </fieldset>

        {locked ? null : (
          <div>
            <Button type="submit" className="min-h-11" disabled={save.isPending}>
              {save.isPending ? '저장 중…' : '저장'}
            </Button>
          </div>
        )}
      </form>
    </section>
  )
}

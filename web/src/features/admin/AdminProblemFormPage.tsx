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
import { problemCode, problemMessage } from '@/features/auth/problemCode'
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
import { TestCasesTab } from './TestCasesTab'
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
function AdminProblemForm() {
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
  /**
   * 케이스 탭을 한 번이라도 열었는지.
   *
   * Radix는 보이지 않는 패널을 언마운트한다. 케이스 폼은 그 패널 안에 있어서, 지문 탭을
   * 보고 돌아오면 ZIP으로 읽은 내용과 고친 행이 안내도 없이 사라진다. 한 번 연 뒤로는
   * `forceMount`로 붙잡아 둔다 — 열기 전에는 붙잡지 않으므로, 탭을 쓰지 않는 사람에게
   * 케이스 조회가 한 번 더 나가지는 않는다.
   */
  const [openedCases, setOpenedCases] = useState(false)
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

  /**
   * 불러온 내용을 폼에 넣는다.
   *
   * `keepDirtyValues`가 **고치던 칸만** 남기고 나머지를 새 값으로 맞춘다. 없으면 상세를
   * 다시 받을 때마다 폼이 통째로 되돌아간다 — 케이스 탭에서 저장하면 공개 조건이 바뀌어
   * 상세가 재조회되므로, 기본 정보 탭에서 고치던 제목이 안내도 없이 사라진다.
   */
  useEffect(() => {
    if (loaded === undefined) return
    form.reset(toForm(loaded), { keepDirtyValues: true })
  }, [loaded, form])

  // 읽기도 401로 끝날 수 있다. 저장(mutation)만 세션을 정리하면, 화면을 띄워 둔 채
  // 만료된 경우에 문구만 뜨고 로그인 화면으로 가지 않는다 (AdminProblemListPage와 같은 처리).
  useEffect(() => {
    forgetSessionIfUnauthorized(queryClient, detail.error ?? version.error)
  }, [queryClient, detail.error, version.error])

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
      // 공개 중인 버전을 그 자리에서 고치면 사용자 화면에 바로 나간다(#33). 사용자용
      // 캐시를 그대로 두면 staleTime(30초) 안에는 고치기 전 내용이 보인다 — 관리자가
      // 자기 화면에서 확인할 때 가장 먼저 겪는다.
      await queryClient.invalidateQueries({ queryKey: ['problem', savedId] })
      await queryClient.invalidateQueries({ queryKey: ['problems'] })
      if (isNew) void navigate(`/admin/problems/${savedId}`, { replace: true })
    },
    onError: (error) => {
      // 지난 성공 안내를 지운다. 두면 '반영했어요'와 오류 문구가 함께 남아 두 번째
      // 저장도 된 것처럼 읽힌다.
      setNotice(null)
      forgetSessionIfUnauthorized(queryClient, error)
    },
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
          {/* 상한을 넘긴 값이 잠긴 Python 칸일 수 있다. C++ 값은 범위 안인데 거절당하면
              이유가 화면에 없다. 상한을 여기 적지 않고 서버 응답을 받아 덧붙인다 —
              judge0 설정이 바뀌면 두 곳이 갈라진다. */}
          {problemCode(save.error) === 'LIMIT_OUT_OF_RANGE' && !manualPython
            ? ' Python 제한은 C++ 값에서 계산한 값이에요(시간 ×3+2초, 메모리 ×2). C++ 값을 줄이거나 지문 탭에서 직접 입력으로 바꿔 주세요.'
            : null}
        </p>
      ) : null}

      <Tabs
        value={tab}
        onValueChange={(next) => {
          setTab(next)
          if (next === 'cases') setOpenedCases(true)
        }}
      >
        {/* 탭 버튼은 fieldset 밖에 둔다. 안에 두면 disabled가 버튼까지 잠가, 읽기
            전용·검증 중 화면에서 '기본 정보'에 갇혀 지문도 버전도 볼 수 없다.
            탭이 넷이라 좁은 화면에서는 가로로 밀어 본다. */}
        <TabsList aria-label="문제 작성 영역" className="min-h-11 max-w-full overflow-x-auto">
          <TabsTrigger value="basic" className="min-h-11">
            기본 정보
          </TabsTrigger>
          <TabsTrigger value="statement" className="min-h-11">
            지문
          </TabsTrigger>
          {/* 지난 버전 보기에는 케이스 탭을 두지 않는다. `GET .../test-cases`는 버전을
              받지 않아 최신 버전만 주고(계약에 버전별 조회가 없다), v1 화면에 v2 초안의
              케이스가 v1 것처럼 보인다 — 관리자가 채점 케이스를 잘못 읽는다. */}
          {id === null || readOnly ? null : (
            <TabsTrigger value="cases" className="min-h-11">
              테스트케이스
            </TabsTrigger>
          )}
          {id === null ? null : (
            <TabsTrigger value="versions" className="min-h-11">
              버전
            </TabsTrigger>
          )}
        </TabsList>

        {/*
          폼을 탭별로 나눈다. 케이스 탭은 저장이 다른 API(`PUT .../test-cases`)이고,
          `<form>` 안에 `<form>`은 쓸 수 없다. 그래서 문제 폼은 자기 두 탭만 감싸고,
          저장 버튼도 그 탭에서만 보인다 — 탭마다 자기 것을 저장한다.
        */}
        <form
          aria-label={isNew ? '새 문제' : '문제 수정'}
          noValidate
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit(
            (values) => save.mutate(values),
            (errors) => setTab(firstErrorTab(errors)),
          )}
        >
          {/* disabled 하나로 모든 입력칸이 잠긴다. 링크는 걸리지 않는다.
              TabsContent는 Tabs의 context로 동작해 fieldset을 사이에 끼워도 된다. */}
          <fieldset disabled={locked} className="contents">
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
          </fieldset>

          {locked || (tab !== 'basic' && tab !== 'statement') ? null : (
            <div>
              <Button type="submit" className="min-h-11" disabled={save.isPending}>
                {save.isPending ? '저장 중…' : '저장'}
              </Button>
            </div>
          )}
        </form>

        {id === null || readOnly || !openedCases ? null : (
          // forceMount면 Radix가 hidden을 끄지만, 뒤에 오는 prop이 이겨 우리가 다시 건다.
          <TabsContent value="cases" forceMount hidden={tab !== 'cases'}>
            <TestCasesTab problemId={id} locked={locked} before={before} />
          </TabsContent>
        )}
        {id === null ? null : (
          <TabsContent value="versions">
            <VersionsTab problemId={id} />
          </TabsContent>
        )}
      </Tabs>
    </section>
  )
}

/**
 * 수정 화면과 버전 보기는 형제 라우트라 React가 같은 인스턴스를 유지한다. 그러면 저장
 * 안내·'직접 입력' 선택·`save.isSuccess`가 다음 화면으로 넘어가, v1 보기에 방금 저장
 * 문구가 남고 스켈레톤을 건너뛰어 최신 버전 내용이 v1인 척 보인다. key로 새로 만든다.
 *
 * id는 key에 넣지 않는다. 등록을 마치면 `/admin/problems/:id`로 바꿔치기하는데(replace),
 * 그때 새로 만들면 방금 띄운 저장 안내가 사라진다. 두 문제의 수정 화면 사이는 목록을
 * 지나야 오갈 수 있어, 같은 인스턴스가 이어질 일이 없다.
 */
export function Component() {
  const { versionNo } = useParams()
  return <AdminProblemForm key={versionNo ?? 'form'} />
}

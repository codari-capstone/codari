import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router'

import type { Language, ProblemDetailView } from '@/api/types'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/useAuth'
import { DIFFICULTY_LABEL } from '@/features/problems/labels'
import { BeginnerGuide } from './BeginnerGuide'
import { CodeEditor } from './CodeEditor'
import { LanguagePicker } from './LanguagePicker'
import { formatTimeLimit, LANGUAGE_LABEL } from './labels'
import { Samples } from './Samples'
import { readSavedCode, storeSavedCode } from './savedCode'
import { parseProblemId, problemDetailQuery } from './solveQuery'
import { StarterCodeButton } from './StarterCodeButton'
import { useSubmit } from './submitQuery'
import { SubmitButton } from './SubmitButton'
import { Statement } from './Statement'
import { useWideLayout } from './useWideLayout'

/** 제목 줄: 난이도·제한·태그 (SOLVE-01). */
function Header({
  problem,
  current,
}: {
  problem: ProblemDetailView
  current: ProblemDetailView['languages'][number] | undefined
}) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">{problem.title}</h1>
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span>{DIFFICULTY_LABEL[problem.difficulty]}</span>
        {current ? (
          // 제한은 고른 언어의 것이다 (SOLVE-04). Python이 C++보다 느려 제한이 다르다.
          // 한 문자열로 둔다 — 조각으로 나누면 텍스트 노드가 쪼개져 "Python · 2초 · 256MB"를
          // 한 덩어리로 찾는 테스트가 못 찾는다.
          <span>{`${LANGUAGE_LABEL[current.language]} · ${formatTimeLimit(current.timeLimitMs)} · ${current.memoryLimitMb}MB`}</span>
        ) : null}
        <span className="flex flex-wrap gap-1">
          {problem.tags.map((tag) => (
            <span key={tag.slug} className="bg-muted rounded-md px-2 py-0.5 text-xs">
              {tag.name}
            </span>
          ))}
        </span>
      </div>
    </div>
  )
}

/**
 * 문제를 받은 뒤의 화면 (SOLVE-01~07·10·11).
 *
 * 상태를 들고 있는 쪽을 조기 반환 아래로 내렸다. 훅은 조기 반환보다 위에 있어야 하므로
 * 한 컴포넌트에 두면 `language`가 정해진 뒤에는 메모를 걸 수 없다 — 저장된 코드를
 * 언어가 바뀔 때만 읽으려면 이 자리가 필요하다.
 */
function Workspace({ problem }: { problem: ProblemDetailView }) {
  const wide = useWideLayout()
  const { user } = useAuth()
  // 반응형 분기 **바깥**에서 부른다. 안에서 부르면 폭이 64rem을 넘나들 때 진행 중인
  // 제출을 잃는다 (submitQuery 주석).
  const submit = useSubmit()
  const [chosen, setChosen] = useState<Language | null>(null)
  // 언어별로 따로 들고 있는다. C++로 갔다 돌아왔을 때 Python 코드가 그대로 있어야 한다.
  const [codeByLanguage, setCodeByLanguage] = useState<Partial<Record<Language, string>>>({})
  // 밖에서 코드를 갈아끼운 횟수. 에디터 key에 들어간다 — 아래 CodeEditor 주석.
  const [generation, setGeneration] = useState(0)

  /**
   * 지금 언어. 고른 것이 지원 목록에 없으면 첫 언어로 돌아간다.
   *
   * `chosen`을 그대로 믿으면, 다시 받은 데이터에서 그 언어가 빠졌을 때 `current`가
   * undefined가 되어 에디터와 **언어 선택이 함께** 사라진다. 그러면 사용자는
   * 새로고침하지 않고는 지원되는 언어로 돌아갈 길이 없다. 계약은 PYTHON, CPP 순서를
   * 보장하므로 첫 언어가 기본값이다.
   */
  const current =
    problem.languages.find((it) => it.language === chosen) ?? problem.languages[0] ?? undefined
  const language = current?.language

  /**
   * 이 언어를 처음 열 때 들어갈 코드 (SOLVE-11 → SOLVE-06).
   *
   * 저장된 것이 있으면 그것, 없으면 시작 코드다. 렌더마다 읽지 않도록 언어로 묶는다 —
   * 읽기가 싼 작업이어도 렌더 안에서 저장소를 건드리는 모양을 남기지 않는다.
   */
  const opening = useMemo(
    () =>
      language && current
        ? (readSavedCode(user?.id, problem.id, language) ?? current.starterCode)
        : '',
    [user?.id, problem.id, language, current],
  )

  const editor =
    language && current ? (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-x-4">
          <LanguagePicker
            languages={problem.languages}
            value={language}
            onChange={(next) => setChosen(next)}
          />
          <StarterCodeButton
            starterCode={current.starterCode}
            code={codeByLanguage[language] ?? opening}
            onLoad={() => {
              setCodeByLanguage((prev) => ({ ...prev, [language]: current.starterCode }))
              // 저장도 함께 지운다. 안 하면 새로고침에 방금 버린 코드가 돌아온다.
              storeSavedCode(user?.id, problem.id, language, current.starterCode)
              setGeneration((it) => it + 1)
            }}
          />
        </div>
        {/*
          한 번도 손대지 않은 언어는 그 언어의 시작 코드로 연다 (SOLVE-06). 계약은
          시작 코드가 없으면 빈 문자열을 준다.

          **에디터에 값을 밀어 넣는 길은 key뿐이다.** @uiw는 타이핑 직후 들어온 외부
          value를 200ms 동안 미뤄 두는데(useCodeMirror의 typingLatch), 그 200ms를
          `setInterval(…, 1)`로 200번 세기 때문에 바쁜 환경에서는 훨씬 늦게 온다.
          글자를 치다 바로 언어를 바꾸거나 시작 코드를 불러오면 전환이 안 보인다 —
          테스트에서 두 번 걸렸다. 밖에서 갈아끼울 때마다 새로 켜면 그 경합이 없다.

          탭 전환에서는 반대로 forceMount로 살려 둔다(아래 TabsContent 주석). 거기서는
          같은 코드를 계속 쓰는 중이라 undo 이력이 자산이고, 여기서는 코드 자체가
          바뀌는 일이라 버리는 것이 맞다 — 그래서 덮어쓰기 전에 확인을 받는다.
        */}
        <CodeEditor
          key={`${language}:${generation}`}
          language={language}
          value={codeByLanguage[language] ?? opening}
          onChange={(next) => {
            setCodeByLanguage((prev) => ({ ...prev, [language]: next }))
            // shortcut: 입력마다 저장한다. 코드가 수십 KB로 커져 입력이 버벅이면
            // 저장을 늦출 자리는 여기다. 지금은 잃는 글자가 없는 쪽을 택한다.
            storeSavedCode(user?.id, problem.id, language, next)
          }}
        />
        <SubmitButton
          submit={submit}
          problemId={problem.id}
          language={language}
          code={codeByLanguage[language] ?? opening}
        />
        <BeginnerGuide language={language} />
      </div>
    ) : null

  const statement = (
    <div className="flex flex-col gap-6">
      <Statement problem={problem} />
      <Samples samples={problem.samples} />
    </div>
  )

  return (
    <section className="flex flex-col gap-4">
      <Header problem={problem} current={current} />

      {/* 넓은 화면은 좌우 분할, 좁은 화면은 탭 전환 (SOLVE-10). 가르는 이유는 useWideLayout 주석 */}
      {wide ? (
        <div className="grid grid-cols-2 items-start gap-6">
          {statement}
          {/*
            에디터 칸을 화면에 붙여 둔다. 지문은 에디터보다 훨씬 길어서(측정: 1280px
            화면에서 지문 1271px, 에디터 칸 492px) 지문을 읽으려고 내리면 에디터가
            화면 밖으로 사라진다. 좌우 분할(SOLVE-10)은 둘을 같이 쓰라는 배치다.

            상단바는 sticky가 아니라 함께 올라가므로 top은 여백만 띄운다.
            AppShell이 사이드바를 sticky로 두지 않는 이유(좁아지면 위로 쌓인다)는
            여기 걸리지 않는다 — 좁은 화면은 아예 다른 트리(탭)다.

            입문자 안내를 펼치거나 화면이 낮으면 칸이 뷰포트보다 길어질 수 있어
            그때는 칸 안에서 스크롤한다.
          */}
          <div className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">{editor}</div>
        </div>
      ) : (
        <Tabs defaultValue="statement">
          {/*
            받은 부품의 기본 높이는 리스트 32px·트리거 25px이다. 좁은 화면에서 지문↔코드
            전환은 이 탭뿐이라 프로젝트 공통 터치 영역(44px)을 리스트와 트리거 양쪽에
            건다 — 리스트에만 걸면 줄만 높아지고 누를 수 있는 영역은 그대로다
            (ProblemFilters.tsx의 같은 주석).
            aria-label은 SOLVE-07 안내·AI 힌트 탭이 같은 화면에 들어올 때를 대비한다.
          */}
          <TabsList aria-label="문제 풀이 영역" className="min-h-11">
            <TabsTrigger value="statement" className="min-h-11">
              지문
            </TabsTrigger>
            <TabsTrigger value="editor" className="min-h-11">
              코드 작성
            </TabsTrigger>
          </TabsList>
          <TabsContent value="statement">{statement}</TabsContent>
          {/*
            forceMount가 있어야 에디터가 탭을 옮겨도 살아 있다 — 없으면 Radix가 비활성
            패널을 언마운트해서 undo 이력·커서·스크롤이 매번 사라진다. forceMount를 켜면
            Radix는 `hidden`을 걸지 않으므로(present가 늘 true다) 숨기는 쪽은 우리가 건다.
            1차에서 막혔던 preflight의 `display:none !important`는 `hidden`을 되살릴 때만
            걸리는 벽이고, 여기는 반대 방향이라 Tailwind `hidden`으로 충분하다.
            지문 쪽은 켜지 않는다 — 살릴 상태가 없고, 양쪽을 켜면 jsdom에서 같은 제목이
            둘이 되어 단위 테스트가 가리킬 곳을 잃는다.
          */}
          <TabsContent value="editor" forceMount className="data-[state=inactive]:hidden">
            {editor}
          </TabsContent>
        </Tabs>
      )}
    </section>
  )
}

/** 문제 풀이 (SOLVE-01~07·10·11). 주소를 읽고 문제를 받아 Workspace에 넘긴다. */
export function Component() {
  const params = useParams()
  const problemId = parseProblemId(params.id)
  const { data, isPending, error, refetch } = useQuery({
    ...problemDetailQuery(problemId ?? 0),
    enabled: problemId !== null,
  })

  // 주소를 손으로 고친 경우다. 요청을 보내지 않고 없는 문제와 같은 문구로 끝낸다
  // (parseProblemId 주석). 화면 전체가 오류이므로 그 제목이 h1이다.
  if (problemId === null) return <ErrorState problem={{ status: 404 }} headingLevel={1} />
  if (error) {
    return <ErrorState problem={error} headingLevel={1} onRetry={() => void refetch()} />
  }
  // 제목을 아직 모르지만 제목 없는 화면을 두지 않는다. 스크린 리더의 제목 탐색으로
  // 잡을 것이 있어야 한다 (ProblemListPage는 h1을 늘 띄워 두고 그 아래를 갈아끼운다).
  if (isPending || !data) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">문제 풀이</h1>
        <ListSkeleton rows={8} />
      </section>
    )
  }

  // key로 문제를 묶는다. 캐시가 있어 isPending을 거치지 않고 다른 문제로 넘어가면 같은
  // 인스턴스가 재사용돼, 이전 문제의 codeByLanguage가 새 문제의 저장본보다 우선하고
  // 다음 입력에서 새 문제의 저장소를 이전 코드로 덮어쓴다.
  return <Workspace key={data.id} problem={data} />
}

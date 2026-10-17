import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'

import type { ProblemDetailView } from '@/api/types'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DIFFICULTY_LABEL } from '@/features/problems/labels'
import { formatTimeLimit, LANGUAGE_LABEL } from './labels'
import { Samples } from './Samples'
import { parseProblemId, problemDetailQuery } from './solveQuery'
import { Statement } from './Statement'
import { useWideLayout } from './useWideLayout'

/** 제목 줄: 난이도·제한·태그 (SOLVE-01). */
function Header({ problem }: { problem: ProblemDetailView }) {
  // 지금은 첫 언어의 제한을 보여 준다. 언어를 고르는 UI는 SOLVE-04(2차)에서 들어오고,
  // 그때 이 자리가 고른 언어의 제한을 받는다. 계약은 PYTHON, CPP 순서를 보장한다.
  const first = problem.languages[0]

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">{problem.title}</h1>
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span>{DIFFICULTY_LABEL[problem.difficulty]}</span>
        {first ? (
          // 한 문자열로 둔다. 조각으로 나누면 텍스트 노드가 쪼개져 "Python · 2초 · 256MB"를
          // 한 덩어리로 찾는 테스트가 못 찾는다.
          <span>{`${LANGUAGE_LABEL[first.language]} · ${formatTimeLimit(first.timeLimitMs)} · ${first.memoryLimitMb}MB`}</span>
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

/** 에디터 자리. SOLVE-04~07(2차)에서 채운다. */
function EditorPlaceholder() {
  return <p className="text-muted-foreground text-sm">코드 에디터는 준비 중입니다.</p>
}

/** 문제 풀이 (SOLVE-01~03·10). */
export function Component() {
  const params = useParams()
  const problemId = parseProblemId(params.id)
  const { data, isPending, error, refetch } = useQuery({
    ...problemDetailQuery(problemId ?? 0),
    enabled: problemId !== null,
  })
  const wide = useWideLayout()

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

  const statement = (
    <div className="flex flex-col gap-6">
      <Statement problem={data} />
      <Samples samples={data.samples} />
    </div>
  )

  return (
    <section className="flex flex-col gap-4">
      <Header problem={data} />

      {/* 넓은 화면은 좌우 분할, 좁은 화면은 탭 전환 (SOLVE-10). 가르는 이유는 useWideLayout 주석 */}
      {wide ? (
        <div className="grid grid-cols-2 items-start gap-6">
          {statement}
          <EditorPlaceholder />
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
          <TabsContent value="editor">
            <EditorPlaceholder />
          </TabsContent>
        </Tabs>
      )}
    </section>
  )
}

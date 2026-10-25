import type { ProblemDetailView, SampleRunCase, SampleRunResult } from '@/api/types'
import { Raw } from '@/components/Raw'
import { Button } from '@/components/ui/button'
import { RUNTIME_ERROR_INFO, VERDICT_INFO } from '@/constants/verdicts'
import { problemMessage } from '@/features/auth/problemCode'
import type { SampleRunState } from './sampleRunQuery'

type Samples = ProblemDetailView['samples']

/**
 * 예제 하나의 결과 이름.
 *
 * `ACCEPTED`만 `VERDICT_INFO`를 쓰지 않는다. '맞았습니다!!'는 채점 결과의 말이라, 공개
 * 예제 하나를 지난 것에 그 말을 붙이면 제출해도 통과한다는 뜻으로 읽힌다. 나머지 판정은
 * 공개 예제에서도 그대로 사실이라 같은 이름을 쓴다 — 사용자가 다른 곳에서 본 이름과
 * 같아야 검색이 된다(verdicts.ts).
 */
function caseLabel(verdict: NonNullable<SampleRunCase['verdict']>): string {
  return verdict === 'ACCEPTED' ? '통과' : VERDICT_INFO[verdict].label
}

/**
 * 지금 무슨 일이 일어나고 있는지 한 줄.
 *
 * 부르는 쪽이 늘 같은 `role="status"` 안에 그린다 — 끝나는 순간 live region이 사라지면
 * **가장 중요한 마지막 변화인 결과가 안내되지 않는다**(결과 화면 `Headline`에서 겪었다).
 */
function Headline({ run }: { run: SampleRunState }) {
  const result = run.result

  // 진행 여부는 훅이 정한다. 여기서 응답 상태를 다시 보면 폴링이 막힌 뒤에도
  // 마지막 RUNNING 때문에 '실행 중'에 멈춘다(sampleRunQuery 주석).
  if (run.pending) {
    // 진행률은 RUNNING일 때만 뜻이 있다. 다른 상태의 0%는 "아직 시작도 안 했다"로 읽힌다.
    const percent = result?.status === 'RUNNING' ? ` ${result.progress}%` : ''
    return <p className="text-muted-foreground text-sm">{`예제를 실행하고 있어요…${percent}`}</p>
  }

  if (result === undefined) return null

  if (result.status === 'JUDGE_ERROR') {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{VERDICT_INFO.JUDGE_ERROR.label}</p>
        <p className="text-muted-foreground text-sm">{VERDICT_INFO.JUDGE_ERROR.description}</p>
      </div>
    )
  }

  if (result.verdict === 'ACCEPTED') {
    // 통과를 '맞았습니다!!'로 적지 않는다. 공개 예제는 문제에 적힌 몇 개뿐이라, 여기서
    // 다 맞아도 제출은 틀릴 수 있다. 다음에 할 일까지 한 줄에 적는다.
    return (
      <p className="text-sm font-medium">
        공개 예제를 모두 통과했어요. 숨은 테스트는 제출해야 알 수 있어요
      </p>
    )
  }

  if (result.verdict === null) return null

  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium">{VERDICT_INFO[result.verdict].label}</p>
      {/*
        런타임 에러는 종류를 말해 준다 (RES-04). 원문은 예제마다 다르므로 아래 각 예제가
        들고 있다 — 계약이 `cases[].errorMessage`로 준다.
      */}
      {result.runtimeErrorType !== null ? (
        <p className="text-muted-foreground text-sm leading-relaxed">
          {RUNTIME_ERROR_INFO[result.runtimeErrorType].description}
        </p>
      ) : null}
    </div>
  )
}

/** 출력 한 칸. 없는 값은 칸째로 뺀다 — 빈 상자는 "빈 줄을 출력했다"로 읽힌다. */
function Output({ title, text }: { title: string; text: string | null | undefined }) {
  if (text === null || text === undefined) return null

  return (
    // min-w-0이 없으면 grid 칸이 안쪽 pre의 min-content 폭까지 늘어난다(기본값이
    // min-width:auto다). 긴 한 줄을 출력하면 pre 안에서 스크롤되는 대신 화면 전체가
    // 가로로 밀린다 — 좁은 화면에서는 칸이 하나뿐이라 더 그렇다.
    <div className="min-w-0">
      <h4 className="text-muted-foreground text-xs font-semibold">{title}</h4>
      {/*
        공백과 줄바꿈이 뜻을 가진다. 꺾지 않고 가로 스크롤로 보여 준다(Samples와 같은
        이유). 긴 출력은 65,536자까지 올 수 있어 높이도 묶는다.
      */}
      <pre className="bg-muted max-h-48 overflow-auto rounded-lg p-3 text-sm leading-relaxed">
        {text}
      </pre>
    </div>
  )
}

/** 예제 하나: 판정·시간·메모리와 기대/실제 출력. */
function Case({ item, expected }: { item: SampleRunCase; expected: string | undefined }) {
  return (
    <li className="border-border/60 flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-medium">예제 {item.ordinal}</span>
        <span>{item.verdict === null ? '실행 전' : caseLabel(item.verdict)}</span>
        {/*
          실행하지 못한 예제는 둘 다 null이다(계약). '0ms'로 적으면 "아주 빨랐다"로
          읽히므로 없는 값은 뺀다 (결과 화면 Meta와 같다).
        */}
        {item.executionTimeMs !== null ? (
          <span className="text-muted-foreground">{item.executionTimeMs}ms</span>
        ) : null}
        {item.memoryUsedKb !== null ? (
          <span className="text-muted-foreground">
            {item.memoryUsedKb.toLocaleString('ko-KR')}KB
          </span>
        ) : null}
      </div>

      {/* 명세가 "나란히 비교"다. 좁은 화면에서는 위아래로 쌓는다 */}
      <div className="grid gap-2 sm:grid-cols-2">
        <Output title="기대 출력" text={expected} />
        <Output title="실제 출력" text={item.actualOutput} />
      </div>

      {/* 프로그램이 낸 에러 원문. 공개 예제라 그대로 온다 (RES-04) */}
      {item.errorMessage !== null ? <Raw text={item.errorMessage} /> : null}
    </li>
  )
}

/**
 * 예제별 결과.
 *
 * 컴파일 에러는 예제 표를 그리지 않는다 — 계약이 "이때 예제별 `verdict`는 모두 null"로
 * 정했다. '실행 전'이 예제마다 늘어선 표는 아무것도 말해 주지 않고, 사용자가 볼 것은
 * 줄 번호가 든 메시지 하나다(RES-05).
 *
 * 메시지가 있는지도 함께 본다. 계약은 `compilerMessage`를 "COMPILE_ERROR일 때" 있다고만
 * 적고 `runtimeErrorType`처럼 "일 때만"이라고 하지 않아서, 메시지만 보고 가르면 서버가
 * 다른 판정에 컴파일 경고를 실어 보낼 때 예제 결과가 통째로 사라진다.
 */
function Cases({ result, samples }: { result: SampleRunResult; samples: Samples }) {
  if (result.verdict === 'COMPILE_ERROR' && result.compilerMessage !== null) {
    return <Raw text={result.compilerMessage} />
  }

  return (
    <ol aria-label="예제별 결과" className="flex flex-col gap-3">
      {result.cases.map((item) => (
        // ordinal은 1부터 센 문제 상세 samples의 순서다(계약). 서버가 범위 밖을 주면
        // 기대 출력 칸이 빠지고 실제 출력만 남는다 — 만들어 낸 기대값을 보여 주지 않는다.
        <Case key={item.ordinal} item={item} expected={samples[item.ordinal - 1]?.output} />
      ))}
    </ol>
  )
}

/**
 * 예제 실행 (SOLVE-08).
 *
 * 결과를 **에디터 아래**에 둔다. 지문 쪽 `Samples`에 끼우지 않는다 — 좁은 화면에서는
 * 지문과 에디터가 다른 탭이라(SOLVE-10), 에디터 탭에서 누른 결과를 보려고 탭을 옮겨야
 * 한다. 기대 출력이 지문 쪽과 겹쳐 두 번 보이지만 명세가 "**나란히** 비교"다.
 *
 * 상태는 받아 쓴다. 이 컴포넌트는 반응형 분기 안에 있어 폭이 64rem을 넘나들면 새로
 * 마운트되므로, 실행 번호를 여기서 들고 있으면 진행 중인 실행을 잃는다(sampleRunQuery 주석).
 */
export function SampleRun({
  run,
  samples,
  problemId,
  language,
  code,
}: {
  run: SampleRunState
  samples: Samples
  problemId: number
  language: ProblemDetailView['languages'][number]['language']
  code: string
}) {
  // 돌릴 예제가 없으면 자리째로 뺀다. 계약은 공개 예제가 없는 문제를 막지 않는다.
  if (samples.length === 0) return null

  const result = run.result
  // 공백뿐인 코드는 서버가 `SOURCE_EMPTY`로 거절한다 (SubmitButton과 같은 편의).
  const empty = code.trim() === ''

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">예제 실행</h2>
        {/* 비활성 버튼은 클릭도 Enter도 받지 않아 disabled 하나로 중복 실행이 막힌다 */}
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={empty || run.pending}
          onClick={() => run.start({ problemId, language, sourceCode: code })}
        >
          {run.pending ? '실행 중…' : '실행'}
        </Button>
      </div>

      <p className="text-muted-foreground text-sm">
        문제에 적힌 공개 예제로만 돌려 봐요. 시도 횟수에 들어가지 않아요.
      </p>

      {/*
        분기마다 래퍼를 바꾸지 않는다. React가 live region 노드를 지우고 새로 붙이면
        내용을 이미 담은 채 붙은 region을 스크린 리더가 읽지 않는 경우가 많다
        (결과 화면 Headline 주석).
      */}
      <div role="status">
        <Headline run={run} />
      </div>

      {/* 접수·조회 실패는 한 자리로 모은다. 사용자에게는 "실행이 안 됐다" 하나다 */}
      {run.error !== null && run.error !== undefined ? (
        <p role="alert" className="text-destructive text-sm">
          {problemMessage(run.error)}
        </p>
      ) : null}

      {/*
        막혔으면 표를 숨긴다. 그때 남아 있는 것은 멈춘 폴링의 마지막 응답이라, 절반만
        채워진 표가 끝난 결과처럼 읽힌다.
      */}
      {result !== undefined && run.error === null ? (
        <Cases result={result} samples={samples} />
      ) : null}
    </section>
  )
}

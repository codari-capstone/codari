import { AlertCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { toUserMessage } from '@/constants/errors'

interface ErrorStateProps {
  /** 서버 응답(RFC 9457)이나 throw된 값. 어떤 모양이어도 문구가 나온다. */
  problem: unknown
  onRetry?: () => void
  /**
   * 화면 전체가 오류일 때만 1. 그 화면의 h1이 이 제목이어야 한다.
   * 기본값 2는 화면 일부(표 영역 등)가 오류일 때를 가정한다.
   */
  headingLevel?: 1 | 2
}

/**
 * 원문을 보여 줄 값이 있는지. 네트워크 오류는 보여 줄 것이 없다.
 *
 * 개발 모드에서만 돌려준다. 500 응답의 detail에는 예외 클래스명·SQL 조각·내부
 * 호스트명이 담겨 올 수 있고, RouteErrorBoundary는 로더가 던진 임의의 객체를
 * 그대로 넘긴다. 운영에서 그것을 펼쳐 볼 수 있으면 내부 구조가 새어 나간다.
 * 운영의 원인 추적은 서버 로그로 한다.
 */
function rawText(problem: unknown): string | null {
  if (!import.meta.env.DEV) return null
  if (typeof problem !== 'object' || problem === null) return null
  // Error 인스턴스는 열거 가능한 속성이 없어 JSON.stringify가 "{}"를 준다.
  // 그것을 보여 주면 "서버 응답 원문"에 빈 객체만 뜬다.
  if (Object.keys(problem).length === 0) return null
  try {
    return JSON.stringify(problem, null, 2)
  } catch {
    return null
  }
}

export function ErrorState({ problem, onRetry, headingLevel = 2 }: ErrorStateProps) {
  const message = toUserMessage(problem)
  const raw = rawText(problem)
  const Heading = headingLevel === 1 ? 'h1' : 'h2'

  return (
    <div>
      {/*
        role="alert"이 있어야 스켈레톤이 오류로 바뀌는 순간 스크린 리더가 알린다.
        제목과 설명이 이 영역 안에 있어 삽입될 때 함께 읽힌다.
      */}
      <div
        role="alert"
        className="border-destructive/30 bg-destructive/5 flex gap-3 rounded-xl border p-4"
      >
        <AlertCircle className="text-destructive mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          {/* h1은 404·403 화면의 제목과 같은 크기여야 한다. 전체 화면 오류인데
              16px이면 다른 화면 제목(24px)보다 작아 위계가 뒤집힌다. */}
          <Heading className={headingLevel === 1 ? 'text-xl font-semibold' : 'text-sm font-medium'}>
            {message.title}
          </Heading>
          <p className="text-muted-foreground mt-1 text-sm">{message.description}</p>
          {onRetry && message.retryable ? (
            // type이 없으면 button의 기본값은 submit이다. 이 블록이 <form> 안에 들어가는
            // 화면(관리자 문제 수정의 버전 탭)에서는 '다시 시도'가 폼을 제출해, 작성 중인
            // 수정이 공개 중인 버전에 그대로 저장된다.
            <Button type="button" variant="outline" onClick={onRetry} className="mt-3 min-h-11">
              다시 시도
            </Button>
          ) : null}
        </div>
      </div>
      {raw ? (
        <details className="text-muted-foreground mt-3 text-xs">
          <summary className="flex min-h-8 cursor-pointer items-center">서버 응답 원문</summary>
          <pre className="bg-muted mt-2 overflow-x-auto rounded-lg p-3 text-xs leading-relaxed">
            {raw}
          </pre>
        </details>
      ) : null}
    </div>
  )
}

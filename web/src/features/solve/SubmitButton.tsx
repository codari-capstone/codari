import type { Language } from '@/api/types'
import { Button } from '@/components/ui/button'
import { problemMessage } from '@/features/auth/problemCode'
import type { useSubmit } from './submitQuery'

/**
 * 제출 (SOLVE-09).
 *
 * mutation을 받아 쓴다. 이 컴포넌트는 반응형 분기 안에 있어 폭이 64rem을 넘나들면 새로
 * 마운트되므로, 제출 상태를 여기서 들고 있으면 진행 중인 제출을 잃는다(submitQuery 주석).
 *
 * 실패는 화면을 갈아엎지 않고 버튼 아래에 남긴다. 쓰던 코드를 지우면 안 된다. 문구는
 * 서버의 `detail`을 그대로 쓴다 — 계약이 `ProblemDetail`에 "`detail`은 화면에 그대로 보여
 * 줄 문구다"로 정해 두었고(공용 스키마라 계약 전체에 적용된다), 같은 문장을 화면에도
 * 적으면 서버가 다듬는 날 갈라진다.
 */
export function SubmitButton({
  submit,
  problemId,
  language,
  code,
}: {
  submit: ReturnType<typeof useSubmit>
  problemId: number
  language: Language
  code: string
}) {
  // 공백뿐인 코드는 서버가 `SOURCE_EMPTY`로 거절한다. 누르기 전에 막아 왕복 한 번을
  // 아낀다 — 막는 것은 편의고, 신뢰 경계는 서버다(submitQuery가 응답을 그대로 처리한다).
  const empty = code.trim() === ''

  /**
   * 접수된 뒤에도 잠가 둔다.
   *
   * 결과 화면은 lazy 라우트라 202가 돌아온 뒤 청크를 받는 동안 이 화면이 그대로 남는다.
   * `isPending`만 보면 그 사이 버튼이 '제출'로 되돌아가고, 느린 연결에서 사용자가 실패한
   * 줄 알고 다시 누르면 제출이 하나 더 생긴다 — 시도 횟수는 되돌릴 수 없다.
   */
  const sending = submit.isPending || submit.isSuccess

  /**
   * 오류가 지금 코드·언어의 것인지.
   *
   * C++로 제출해 `LANGUAGE_NOT_SUPPORTED`를 받은 뒤 Python으로 바꿔도 문구가 남으면,
   * 사용자는 Python도 안 되는 것으로 읽는다. `reset()`을 effect로 부르는 대신 마지막으로
   * 보낸 값(`variables`)과 비교한다 — effect로 지우면 이 컴포넌트가 다시 마운트될 때(폭
   * 전환) 멀쩡한 오류까지 사라진다.
   */
  const current =
    submit.variables === undefined ||
    (submit.variables.sourceCode === code && submit.variables.language === language)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        {/*
          비활성 버튼은 클릭도 Enter도 받지 않아 `disabled` 하나로 중복 클릭이 막힌다.
          mutation 쪽에 isPending 가드를 또 두려다 말았다 — mutate를 부르는 길이 이
          버튼뿐이라 같은 검사가 두 벌이 되고, 둘이 갈라지면 어느 쪽이 진짜 규칙인지
          알 수 없게 된다. 다른 길이 생기면 그때 옮긴다.
        */}
        <Button
          size="lg"
          className="min-h-11"
          disabled={empty || sending}
          onClick={() => submit.mutate({ problemId, language, sourceCode: code })}
        >
          {sending ? '제출 중…' : '제출'}
        </Button>
      </div>

      {/* role="alert"이어야 누른 뒤 문구가 생길 때 스크린 리더가 읽는다 (LoginPage와 같다) */}
      {submit.error && current ? (
        <p role="alert" className="text-destructive text-sm">
          {problemMessage(submit.error)}
        </p>
      ) : null}
    </div>
  )
}

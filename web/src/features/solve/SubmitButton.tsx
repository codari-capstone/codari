import { useNavigate } from 'react-router'

import type { Language } from '@/api/types'
import { Button } from '@/components/ui/button'
import { problemMessage } from '@/features/auth/problemCode'
import { useSubmit } from './submitQuery'

/**
 * 제출 (SOLVE-09).
 *
 * 성공하면 결과 화면으로 간다. 계약이 주는 제출 번호로 우리가 아는 라우트를 만든다 —
 * 202의 `Location` 헤더를 따라가면 "서버 경로와 화면 경로가 같다"는 가정이 코드에 숨는다.
 *
 * 실패는 화면을 갈아엎지 않고 버튼 아래에 남긴다. 쓰던 코드를 지우면 안 된다. 문구는
 * 서버의 `detail`을 그대로 쓴다 — 계약이 `ProblemDetail`에 "`detail`은 화면에 그대로 보여
 * 줄 문구다"로 정해 두었고(공용 스키마라 계약 전체에 적용된다), 같은 문장을 화면에도
 * 적으면 서버가 다듬는 날 갈라진다.
 */
export function SubmitButton({
  problemId,
  language,
  code,
}: {
  problemId: number
  language: Language
  code: string
}) {
  const navigate = useNavigate()
  const submit = useSubmit()

  // 공백뿐인 코드는 서버가 `SOURCE_EMPTY`로 거절한다. 누르기 전에 막아 왕복 한 번을
  // 아낀다 — 막는 것은 편의고, 신뢰 경계는 서버다(submitQuery가 응답을 그대로 처리한다).
  const empty = code.trim() === ''

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        {/*
          isPending 동안 비활성화한다. 같은 코드를 두 번 보내면 시도 횟수가 두 번 올라가고
          (계약: 제출할 때마다 새 제출로 저장해 시도 횟수를 센다) 되돌릴 수 없다.

          `disabled`가 유일한 막음이고, 그걸로 충분하다 — 비활성 버튼은 클릭도 Enter도
          받지 않는다. mutation 쪽에 isPending 가드를 또 두려다 말았다. mutate를 부르는
          길이 이 버튼뿐이라 같은 검사가 두 벌이 되고, 둘이 갈라지면 어느 쪽이 진짜
          규칙인지 알 수 없게 된다. 다른 길이 생기면 그때 옮긴다.
        */}
        <Button
          size="lg"
          className="min-h-11"
          disabled={empty || submit.isPending}
          onClick={() =>
            submit.mutate(
              { problemId, language, sourceCode: code },
              { onSuccess: (id) => void navigate(`/submissions/${id}`) },
            )
          }
        >
          {submit.isPending ? '제출 중…' : '제출'}
        </Button>
      </div>

      {/* role="alert"이어야 누른 뒤 문구가 생길 때 스크린 리더가 읽는다 (LoginPage와 같다) */}
      {submit.error ? (
        <p role="alert" className="text-destructive text-sm">
          {problemMessage(submit.error)}
        </p>
      ) : null}
    </div>
  )
}

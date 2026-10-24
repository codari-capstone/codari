import { useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

const LABEL = '시작 코드 불러오기'

/**
 * 시작 코드 불러오기 (SOLVE-06).
 *
 * "작성 중"은 **지금 코드가 비어 있지 않고 그 언어의 시작 코드와도 다른** 경우다.
 * 둘 중 하나면 잃을 것이 없으니 묻지 않고 바로 넣는다 — 아무것도 안 지우는 확인창은
 * 사용자가 확인을 읽지 않게 길들인다.
 *
 * 양쪽을 trim해서 비교한다. 줄바꿈 하나 차이로 "작성 중"이 되면, 손대지 않았는데도
 * 확인창이 뜬다.
 *
 * 확인창은 `dialog`가 아니라 `alert-dialog`다. 초점이 취소에 먼저 가고 role이
 * `alertdialog`여서, 지우는 동작을 실수로 확정하기 어렵다.
 */
export function StarterCodeButton({
  starterCode,
  code,
  onLoad,
}: {
  starterCode: string
  code: string
  onLoad: () => void
}) {
  const [asking, setAsking] = useState(false)
  const drafted = code.trim() !== '' && code.trim() !== starterCode.trim()

  return (
    /*
      확인창과 트리거를 **늘** 마운트해 둔다. `drafted`에 따라 버튼만 따로 그렸더니,
      불러오기를 확정하는 순간 `drafted`가 false로 바뀌어 AlertDialog 서브트리가 다른
      버튼으로 교체됐다 — Radix가 초점을 돌려줄 트리거가 DOM에서 사라져 초점이 body로
      떨어진다. 키보드 사용자는 처음부터 다시 Tab해야 한다.

      대신 묻지 않아도 되는 경우에는 트리거의 기본 동작을 막고 바로 넣는다. Radix는
      외부 onClick을 먼저 부르고 `defaultPrevented`면 자기 처리를 건너뛴다
      (composeEventHandlers). open을 우리가 들고 있으므로 열리지도 않는다.
    */
    <AlertDialog open={asking} onOpenChange={setAsking}>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          className="min-h-11"
          onClick={(event) => {
            if (!drafted) {
              event.preventDefault()
              onLoad()
            }
          }}
        >
          {LABEL}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>작성 중인 코드를 지울까요?</AlertDialogTitle>
          <AlertDialogDescription>
            시작 코드를 불러오면 지금 쓴 코드가 사라집니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction onClick={onLoad}>불러오기</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

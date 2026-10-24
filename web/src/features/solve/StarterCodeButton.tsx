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
  const drafted = code.trim() !== '' && code.trim() !== starterCode.trim()

  if (!drafted) {
    return (
      <Button variant="outline" onClick={onLoad} className="min-h-11">
        {LABEL}
      </Button>
    )
  }

  return (
    <AlertDialog>
      {/* 트리거를 쓴다. 닫을 때 초점이 이 버튼으로 돌아와야 키보드 사용자가 자리를 잃지 않는다 */}
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="min-h-11">
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

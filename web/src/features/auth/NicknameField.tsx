import type { RefObject } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isValidNickname } from './accountRules'
import { problemMessage } from './problemCode'
import type { NicknameCheck } from './useNicknameCheck'

/**
 * 닉네임 입력칸과 중복 확인 (COM-02·COM-06 공통).
 *
 * 규칙 문구를 칸 아래에 둔다 — 규칙에 안 맞으면 [중복 확인]이 꺼지는데, 이유가 화면에
 * 없으면 죽은 버튼으로 보인다.
 *
 * @param busy 제출 요청이 오가는 중. 그때는 확인도 끈다 — 응답 순서에 따라 화면이
 *   모순된 상태가 된다.
 */
export function NicknameField({
  check,
  inputRef,
  busy,
}: {
  check: NicknameCheck
  inputRef: RefObject<HTMLInputElement | null>
  busy: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="nickname" className="text-sm font-medium">
        닉네임
      </label>
      <div className="flex gap-2">
        <Input
          id="nickname"
          ref={inputRef}
          value={check.value}
          onChange={(event) => check.change(event.target.value)}
        />
        <Button
          type="button"
          className="shrink-0"
          disabled={!isValidNickname(check.value) || check.pending || busy}
          onClick={() => check.check()}
        >
          중복 확인
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">2~16자, 한글·영문·숫자</p>
      {check.ok ? <p className="text-sm">쓸 수 있어요</p> : null}
      {check.taken ? (
        <p role="alert" className="text-destructive text-sm">
          이미 사용 중인 닉네임이에요
        </p>
      ) : null}
      {check.error !== null ? (
        <p role="alert" className="text-destructive text-sm">
          {problemMessage(check.error)}
        </p>
      ) : null}
    </div>
  )
}

import { useMutation } from '@tanstack/react-query'
import { useRef, useState, type RefObject } from 'react'

import { checkNickname } from './signupQuery'

/**
 * 닉네임 중복 확인 (COM-02·COM-06 공통).
 *
 * 가입(COM-06)과 GitHub 가입(COM-02)이 같은 규칙을 쓴다 — 명세의 '계정 규칙' 절이
 * 둘을 한 줄로 묶어 적는다. 두 화면에 같은 경쟁 가드를 한 벌씩 두면 한쪽만 고쳐지는
 * 날이 온다.
 *
 * @param inputRef 닉네임 입력칸. 선점됐을 때 포커스를 옮길 곳이다. **돌려주는 객체에
 *   담지 않고 받는다** — ref가 섞이면 react-hooks/refs가 이 객체의 모든 읽기를
 *   "렌더 중 ref 접근"으로 본다.
 * @param onChecked 확인이 **지금 값에 대해** 끝났을 때. 화면마다 그 시점에 지워야 할
 *   제출 실패 문구가 달라 호출부에 맡긴다.
 */
export function useNicknameCheck(
  inputRef: RefObject<HTMLInputElement | null>,
  onChecked?: () => void,
) {
  const [value, setValue] = useState('')
  const [confirmed, setConfirmed] = useState<string | null>(null)
  const [taken, setTaken] = useState(false)

  // 응답이 올 때 입력칸에 있는 값. 렌더에 갇힌 value는 요청을 보낸 시점의 값이다.
  const latest = useRef(value)

  const mutation = useMutation({
    mutationFn: (next: string) => checkNickname(next),
    onSuccess: (available, checked) => {
      // 확인하는 사이 칸을 고쳤다면 그 응답은 지금 값에 대한 것이 아니다.
      if (checked !== latest.current) return
      setConfirmed(available ? checked : null)
      setTaken(!available)
      onChecked?.()
    },
  })

  return {
    value,
    /** 확인을 통과한 값과 지금 값이 같다. 제출을 열어 주는 조건이다. */
    ok: confirmed !== null && confirmed === value,
    taken,
    pending: mutation.isPending,
    error: mutation.isError ? mutation.error : null,
    change(next: string) {
      setValue(next)
      latest.current = next
      mutation.reset()
      // 확인한 값과 달라지면 ok가 깨져 자동으로 풀린다. 안내 문구만 직접 지운다.
      setTaken(false)
    },
    check() {
      mutation.mutate(value)
    },
    /** 제출 때 선점됐다. 확인을 풀고 그 칸으로 포커스를 옮긴다(명세: "닉네임만 다시 입력"). */
    release() {
      setConfirmed(null)
      inputRef.current?.focus()
    },
  }
}

export type NicknameCheck = ReturnType<typeof useNicknameCheck>

import { useEffect, useRef, useState } from 'react'

/**
 * 재발송 쿨다운. 남은 초를 돌려준다.
 *
 * 발송 제한이 "같은 이메일 1분 간격"이므로(계정 규칙), 버튼을 열어 두면 사용자가 눌러서
 * 429를 맞는다. 만료(5분)·증명서(30분·10분)에는 타이머를 두지 않는다 — 화면 시계가
 * 서버보다 빠르면 아직 쓸 수 있는 번호를 막고, 느리면 만료된 뒤에도 입력을 받는다.
 * 그쪽은 서버가 만료라고 답할 때 그 문구를 보여 주는 편이 정확하다.
 */
export function useResendCooldown(seconds: number): { remaining: number; start: () => void } {
  const [remaining, setRemaining] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  // 언마운트와 0 도달에서 같은 정리를 쓴다. 정리하지 않으면 사라진 화면의 state를 갱신한다.
  function stop() {
    if (timer.current !== null) {
      clearInterval(timer.current)
      timer.current = null
    }
  }

  useEffect(() => stop, [])

  function start() {
    stop()
    setRemaining(seconds)
    timer.current = setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          stop()
          return 0
        }
        return value - 1
      })
    }, 1000)
  }

  return { remaining, start }
}

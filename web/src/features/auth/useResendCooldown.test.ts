import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useResendCooldown } from './useResendCooldown'

beforeEach(() => vi.useFakeTimers())
// 테스트가 중간에 실패해도 실제 타이머로 되돌려야 뒤의 테스트가 가짜 타이머를 물려받지 않는다.
afterEach(() => vi.useRealTimers())

describe('useResendCooldown', () => {
  it('처음에는 0이다', () => {
    const { result } = renderHook(() => useResendCooldown(60))
    expect(result.current.remaining).toBe(0)
  })

  it('start하면 남은 초가 1초마다 줄어 0에서 멈춘다', () => {
    const { result } = renderHook(() => useResendCooldown(3))

    act(() => result.current.start())
    expect(result.current.remaining).toBe(3)

    act(() => void vi.advanceTimersByTime(1000))
    expect(result.current.remaining).toBe(2)

    act(() => void vi.advanceTimersByTime(5000))
    expect(result.current.remaining).toBe(0)
  })

  it('언마운트하면 타이머를 정리한다', () => {
    // 정리하지 않으면 언마운트된 컴포넌트의 state를 갱신한다 (Review Focus 4).
    const { result, unmount } = renderHook(() => useResendCooldown(60))
    act(() => result.current.start())
    // 도는 동안 0이 아니어야 아래 단정이 빈 단정이 아니다.
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

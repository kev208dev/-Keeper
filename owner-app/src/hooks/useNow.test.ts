import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useNow } from './useNow'

const START = new Date('2026-10-23T15:00:00+09:00')

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

test('시작 시각에서 출발해 실제로 흐른 만큼 시간이 간다', () => {
  const { result } = renderHook(() => useNow(START))
  expect(result.current).toEqual(START)

  act(() => {
    vi.advanceTimersByTime(60_000)
  })

  expect(result.current).toEqual(new Date('2026-10-23T15:01:00+09:00'))
})

test('화면이 사라지면 타이머를 정리한다', () => {
  const { unmount } = renderHook(() => useNow(START))

  unmount()

  expect(vi.getTimerCount()).toBe(0)
})

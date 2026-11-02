import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { ApiError } from '../api/httpApi'
import type { Dashboard, KeeperApi } from '../api/types'
import { createFixtureApi, demoNow } from '../test/fixtures'
import { useDashboard } from './useDashboard'

function unconfirmedCount(data: Dashboard | null) {
  return data?.alerts.filter((alert) => !alert.confirmed).length
}

async function setup(overrides: Partial<KeeperApi> = {}, onUnauthorized = vi.fn()) {
  const api = { ...createFixtureApi(), ...overrides }
  const view = renderHook(() => useDashboard(api, demoNow, { pollMs: 0, onUnauthorized }))
  await waitFor(() => expect(view.result.current.data).not.toBeNull())
  return { ...view, api, onUnauthorized }
}

test('확인 처리는 응답을 기다리지 않고 화면에 먼저 반영한다', async () => {
  let finish: () => void = () => {}
  const { result } = await setup({ confirmAlert: () => new Promise<void>((resolve) => (finish = resolve)) })

  act(() => void result.current.confirmAlert('e1'))

  expect(unconfirmedCount(result.current.data)).toBe(0)
  await act(async () => finish())
  expect(unconfirmedCount(result.current.data)).toBe(0)
})

test('저장에 실패하면 화면을 되돌리고 실패를 알린다', async () => {
  const { result } = await setup({ confirmAlert: () => Promise.reject(new ApiError(500, 'error')) })

  await act(() => result.current.confirmAlert('e1'))

  expect(unconfirmedCount(result.current.data)).toBe(1)
  expect(result.current.failed).toBe(true)
})

test('문의 읽음 저장에 실패해도 화면을 되돌린다', async () => {
  const { result } = await setup({ markInquiryRead: () => Promise.reject(new ApiError(0, 'down')) })

  await act(() => result.current.markInquiryRead('q1'))

  expect(result.current.data?.inquiries[0].read).toBe(false)
})

test('확인 처리 전에 출발한 조회 응답이 화면을 되돌리지 않는다', async () => {
  let finishPoll: (value: Dashboard) => void = () => {}
  const stale = await createFixtureApi().getDashboard('since')
  const { result, api } = await setup()

  api.getDashboard = () => new Promise<Dashboard>((resolve) => (finishPoll = resolve))
  // api 객체가 바뀌지 않으므로 refresh는 처음 만든 함수 그대로 쓰인다
  const polling = result.current.refresh()
  await act(() => result.current.confirmAlert('e1'))
  await act(async () => {
    finishPoll(stale)
    await polling
  })

  expect(unconfirmedCount(result.current.data)).toBe(0)
})

test('로그인이 만료되면 알려주고 연결 실패로 표시하지 않는다', async () => {
  const onUnauthorized = vi.fn()
  const { result } = await setup({ confirmAlert: () => Promise.reject(new ApiError(401, 'expired')) }, onUnauthorized)

  await act(() => result.current.confirmAlert('e1'))

  expect(onUnauthorized).toHaveBeenCalled()
  expect(result.current.failed).toBe(false)
})

test('다시 연결되면 실패 표시가 사라진다', async () => {
  const getDashboard = vi.fn(createFixtureApi().getDashboard)
  const { result } = await setup({ getDashboard })

  getDashboard.mockRejectedValueOnce(new ApiError(0, 'down'))
  await act(() => result.current.refresh())
  expect(result.current.failed).toBe(true)
  expect(result.current.data).not.toBeNull()

  await act(() => result.current.refresh())
  expect(result.current.failed).toBe(false)
})

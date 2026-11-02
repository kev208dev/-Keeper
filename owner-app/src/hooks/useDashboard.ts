import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/httpApi'
import type { Dashboard, KeeperApi } from '../api/types'
import { confirmAlert, markInquiryRead } from '../domain/rules'
import { kstDayStart } from '../domain/time'

type Options = {
  pollMs: number
  onUnauthorized?: () => void
}

export function useDashboard(api: KeeperApi, now: Date, { pollMs, onUnauthorized }: Options) {
  const [data, setData] = useState<Dashboard | null>(null)
  const [failed, setFailed] = useState(false)
  const [revision, setRevision] = useState(0)
  const dataRef = useRef(data)
  dataRef.current = data
  // 변경 요청 전에 출발한 조회 응답이 화면을 되돌리지 않게 한다
  const changeCount = useRef(0)
  const since = kstDayStart(now)

  const handleFailure = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) onUnauthorized?.()
      else setFailed(true)
    },
    [onUnauthorized],
  )

  const refresh = useCallback(async () => {
    const startedAt = changeCount.current
    try {
      const next = await api.getDashboard(since)
      if (startedAt === changeCount.current) {
        setData(next)
        setRevision((current) => current + 1)
      }
      setFailed(false)
    } catch (error) {
      handleFailure(error)
    }
  }, [api, since, handleFailure])

  useEffect(() => {
    void refresh()
    if (pollMs === 0) return
    const timer = setInterval(() => void refresh(), pollMs)
    return () => clearInterval(timer)
  }, [refresh, pollMs])

  const change = async (apply: (current: Dashboard) => Dashboard, send: () => Promise<void>) => {
    const previous = dataRef.current
    changeCount.current += 1
    setData((current) => current && apply(current))
    try {
      await send()
      changeCount.current += 1
      setRevision((current) => current + 1)
      setFailed(false)
    } catch (error) {
      changeCount.current += 1
      setData(previous)
      handleFailure(error)
    }
  }

  return {
    data,
    failed,
    revision,
    refresh,
    confirmAlert: (id: string) =>
      change(
        (current) => ({ ...current, alerts: confirmAlert(current.alerts, id) }),
        () => api.confirmAlert(id),
      ),
    markInquiryRead: (id: string) =>
      change(
        (current) => ({ ...current, inquiries: markInquiryRead(current.inquiries, id) }),
        () => api.markInquiryRead(id),
      ),
  }
}

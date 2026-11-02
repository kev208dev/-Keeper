import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/httpApi'
import type { Dashboard, KeeperApi } from '../api/types'
import { confirmAlert, markInquiryRead } from '../domain/rules'
import { kstDayStart } from '../domain/time'
import type { NotificationSettings, Resolution } from '../domain/types'

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

  const change = async (apply: (current: Dashboard) => Dashboard, send: () => Promise<void>): Promise<boolean> => {
    const previous = dataRef.current
    changeCount.current += 1
    setData((current) => current && apply(current))
    try {
      await send()
      changeCount.current += 1
      setRevision((current) => current + 1)
      setFailed(false)
      return true
    } catch (error) {
      changeCount.current += 1
      setData(previous)
      handleFailure(error)
      return false
    }
  }

  return {
    data,
    failed,
    revision,
    refresh,
    confirmAlert: (id: string, resolution: Resolution = 'confirmed') =>
      change(
        (current) => ({ ...current, alerts: confirmAlert(current.alerts, id, resolution) }),
        () => api.confirmAlert(id, resolution),
      ),
    markInquiryRead: (id: string) =>
      change(
        (current) => ({ ...current, inquiries: markInquiryRead(current.inquiries, id) }),
        () => api.markInquiryRead(id),
      ),
    replyInquiry: async (id: string, body: string): Promise<boolean> => {
      try {
        await api.replyInquiry(id, body)
        await refresh()
        return true
      } catch (error) {
        handleFailure(error)
        return false
      }
    },
    renameStore: (name: string) =>
      change(
        (current) => ({ ...current, store: { ...current.store, name } }),
        () => api.renameStore(name),
      ),
    updateNotificationSettings: (notificationSettings: NotificationSettings) =>
      change(
        (current) => ({ ...current, notificationSettings }),
        () => api.updateNotificationSettings(notificationSettings),
      ),
  }
}

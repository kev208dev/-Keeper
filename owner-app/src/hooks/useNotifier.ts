import { useEffect, useRef } from 'react'
import type { Dashboard } from '../api/types'
import { getNewNotifications } from '../domain/rules'
import { playChime, showSystemNotification } from '../notifications'

// 앱이 열려 있는 동안 새 소식을 화면 안내, 소리, 브라우저 알림으로 전한다
export function useNotifier(data: Dashboard | null, onToast: (message: string) => void) {
  const previous = useRef<Dashboard | null>(null)

  useEffect(() => {
    if (!data) return
    const last = previous.current
    previous.current = data
    if (!last) return

    const messages = getNewNotifications(last, data)
    if (messages.length === 0) return

    onToast(messages.length === 1 ? messages[0] : `새 소식 ${messages.length}건이 있어요`)
    const settings = data.notificationSettings
    if (settings.sound) playChime()
    if (settings.push) messages.forEach(showSystemNotification)
  }, [data, onToast])
}

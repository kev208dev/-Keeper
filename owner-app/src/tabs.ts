export const tabIds = ['home', 'cctv', 'alerts', 'inquiries', 'report'] as const

export type TabId = (typeof tabIds)[number]

export type Route =
  | { page: TabId | 'settings' | 'notificationSettings' | 'notices' }
  | { page: 'alertDetail'; alertId: string }

export const NOTIFICATION_SETTINGS_HASH = '#settings/notifications'
export const NOTICES_HASH = '#settings/notices'

export function isTabId(value: string): value is TabId {
  return (tabIds as readonly string[]).includes(value)
}

export function alertHash(id: string): string {
  return `#alerts/${encodeURIComponent(id)}`
}

export function parseRoute(hash: string): Route {
  if (hash === NOTIFICATION_SETTINGS_HASH) return { page: 'notificationSettings' }
  if (hash === NOTICES_HASH) return { page: 'notices' }
  if (hash === '#settings') return { page: 'settings' }
  if (hash.startsWith('#alerts/')) {
    try {
      return { page: 'alertDetail', alertId: decodeURIComponent(hash.slice('#alerts/'.length)) }
    } catch {
      return { page: 'alerts' }
    }
  }
  const tab = hash.slice(1)
  return { page: isTabId(tab) ? tab : 'home' }
}

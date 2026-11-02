export const tabIds = ['home', 'cctv', 'alerts', 'inquiries', 'report'] as const

export type TabId = (typeof tabIds)[number]

export function isTabId(value: string): value is TabId {
  return (tabIds as readonly string[]).includes(value)
}

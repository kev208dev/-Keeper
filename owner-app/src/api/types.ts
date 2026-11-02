import type {
  AlertItem,
  Camera,
  Clip,
  Inquiry,
  Integration,
  Notice,
  NotificationSettings,
  Period,
  Reply,
  Resolution,
  Store,
} from '../domain/types'

export type Dashboard = {
  store: Store
  integration: Integration
  cameras: Camera[]
  alerts: AlertItem[]
  clips: Clip[]
  inquiries: Inquiry[]
  notificationSettings: NotificationSettings
}

export type AlertDetail = {
  alert: AlertItem
  clip: Clip | null
}

export interface KeeperApi {
  getDashboard(since: string): Promise<Dashboard>
  getAlerts(period: Period): Promise<AlertItem[]>
  getAlert(id: string): Promise<AlertDetail>
  confirmAlert(id: string, resolution: Resolution): Promise<void>
  markInquiryRead(id: string): Promise<void>
  replyInquiry(id: string, body: string): Promise<Reply>
  renameStore(name: string): Promise<void>
  updateNotificationSettings(settings: NotificationSettings): Promise<void>
  getNotices(): Promise<Notice[]>
}

import { formatDayLabel, formatEventTime, formatKstDateTime, kstDay, kstHour, listDays, shiftDay, weekdayOf } from './time'
import type {
  AlertFilter,
  AlertItem,
  AlertKind,
  Camera,
  Clip,
  ClipView,
  Inquiry,
  Integration,
  NotificationSettings,
  Period,
  Resolution,
  Tone,
} from './types'

const SLOT_HOURS = 4
const WEEK_DAYS = 7
const MIN_PASSWORD_LENGTH = 8
const AI_SENDER = 'AI'
const CUSTOMER_SENDER = '고객'

export const alertKindLabels: Record<AlertKind, string> = {
  movement: '상품 이동',
  duration: '문 개방',
  product: '상품 훼손',
}

export const reportPresets = [
  { id: 'day', label: '오늘', name: '오늘', days: 1 },
  { id: 'week', label: '7일', name: '최근 7일', days: 7 },
  { id: 'month', label: '30일', name: '최근 30일', days: 30 },
] as const

export type ReportPresetId = (typeof reportPresets)[number]['id']

function newestFirst<T extends { occurredAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
}

function isToday(value: string, now: Date): boolean {
  return kstDay(value) === kstDay(now)
}

function needsOwner(inquiry: Inquiry): boolean {
  return inquiry.status === 'forwarded' && !inquiry.read
}

function inPeriod(alert: AlertItem, { start, end }: Period): boolean {
  const day = kstDay(alert.occurredAt)
  return start <= day && day <= end
}

function withScale<T extends { count: number }>(points: T[]) {
  const max = Math.max(0, ...points.map((point) => point.count))
  return points.map((point) => ({
    ...point,
    ratio: max === 0 ? 0 : point.count / max,
    isPeak: max > 0 && point.count === max,
  }))
}

function toClipView(clip: Clip, alert: AlertItem, now: Date): ClipView {
  return {
    id: clip.id,
    alertId: alert.id,
    kind: alert.kind,
    title: alert.title,
    time: formatEventTime(alert.occurredAt, now),
    cameraId: alert.cameraId,
    duration: clip.duration,
  }
}

export function getSignupError(form: {
  storeName: string
  email: string
  password: string
  passwordConfirm: string
}): string | null {
  if (!form.storeName.trim()) return '매장 이름을 입력하세요.'
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return '이메일 형식을 확인하세요.'
  if (form.password.length < MIN_PASSWORD_LENGTH) return `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`
  if (form.password !== form.passwordConfirm) return '비밀번호가 서로 다릅니다.'
  return null
}

export function confirmAlert(alerts: AlertItem[], id: string, resolution: Resolution = 'confirmed'): AlertItem[] {
  return alerts.map((alert) =>
    alert.id === id ? { ...alert, confirmed: true, resolution: alert.resolution ?? resolution } : alert,
  )
}

export function markInquiryRead(inquiries: Inquiry[], id: string): Inquiry[] {
  return inquiries.map((inquiry) => (inquiry.id === id ? { ...inquiry, read: true } : inquiry))
}

export function getHomeStats(alerts: AlertItem[], inquiries: Inquiry[], now: Date) {
  return {
    detected: alerts.filter((alert) => isToday(alert.occurredAt, now)).length,
    unconfirmedAlerts: alerts.filter((alert) => !alert.confirmed).length,
    inquiries: inquiries.filter(needsOwner).length,
  }
}

export function getConnectedCount(cameras: Camera[]): number {
  return cameras.filter((camera) => camera.status === 'connected').length
}

export function getHomeCaption(cameras: Camera[], alerts: AlertItem[], now: Date): string {
  const [latest] = newestFirst(alerts)
  const detection = latest ? `최근 감지 ${formatEventTime(latest.occurredAt, now)}` : '감지 기록 없음'
  return `카메라 ${getConnectedCount(cameras)}대 연결 · ${detection}`
}

export function getCameraCaption(cameras: Camera[]): string {
  if (cameras.length === 0) return '등록된 카메라가 없습니다.'
  const connected = getConnectedCount(cameras)
  if (connected === cameras.length) return `카메라 ${connected}대가 연결되어 있습니다.`
  return `카메라 ${cameras.length}대 중 ${connected}대가 연결되어 있습니다.`
}

// 삭제된 카메라의 지난 알림은 관리용 앱이 보낸 카메라 번호를 그대로 보여준다
export function getCameraLabel(cameras: Camera[], cameraId: string): string {
  const camera = cameras.find((item) => item.id === cameraId)
  return camera ? `${camera.location} · ${camera.name}` : cameraId
}

export function getIntegrationBadge({ status }: Integration): { label: string; tone: Tone } {
  if (status === 'waiting') return { label: '연동 대기', tone: 'orange' }
  if (status === 'offline') return { label: '연결 확인 필요', tone: 'red' }
  return { label: '운영 중', tone: 'green' }
}

// 숫자가 0이어도 이상이 없다는 뜻이 아닐 때만 문구를 돌려준다
export function getIntegrationNotice({ status, lastSeenAt }: Integration, now: Date): string | null {
  if (status === 'waiting') return '관리용 앱이 아직 연결되지 않아 집계를 시작하지 않았습니다.'
  if (status === 'offline' && lastSeenAt) {
    return `관리용 앱 연결이 끊겼습니다. 마지막 수신(${formatEventTime(lastSeenAt, now)}) 이후는 집계되지 않았습니다.`
  }
  return null
}

export function getAlertStatus(alert: AlertItem): { label: string; done: boolean } {
  if (!alert.confirmed) return { label: '확인 필요', done: false }
  return { label: alert.resolution === 'normal' ? '정상 행동' : '확인 완료', done: true }
}

export function getRecentAlerts(alerts: AlertItem[], limit = 5): AlertItem[] {
  return newestFirst(alerts).slice(0, limit)
}

// 지난 알림은 확인 전까지 목록에 남는다
export function getVisibleAlerts(alerts: AlertItem[], now: Date): AlertItem[] {
  return newestFirst(alerts.filter((alert) => !alert.confirmed || isToday(alert.occurredAt, now)))
}

export function filterAlerts(alerts: AlertItem[], filter: AlertFilter): AlertItem[] {
  if (filter === 'all') return alerts
  return alerts.filter((alert) => alert.confirmed === (filter === 'done'))
}

export function groupAlertsByDay(alerts: AlertItem[], now: Date) {
  const groups: { day: string; label: string; alerts: AlertItem[] }[] = []
  for (const alert of alerts) {
    const day = kstDay(alert.occurredAt)
    const group = groups.find((item) => item.day === day)
    if (group) group.alerts.push(alert)
    else {
      const label = day === kstDay(now) ? `오늘 · ${formatDayLabel(day)}` : formatDayLabel(day)
      groups.push({ day, label, alerts: [alert] })
    }
  }
  return groups
}

// 상품 이동은 미결제로 판단된 경우에만 정황과 클립을 보여준다
export function canViewClip(alert: AlertItem, clips: Clip[]): boolean {
  if (alert.kind === 'movement' && !alert.unpaid) return false
  return clips.some((clip) => clip.alertId === alert.id)
}

export function getDoorStatus(alert: Extract<AlertItem, { kind: 'duration' }>, now: Date) {
  const end = alert.closedAt ? Date.parse(alert.closedAt) : now.getTime()
  const elapsedMinutes = Math.max(0, Math.floor((end - Date.parse(alert.openedAt)) / 60_000))
  return {
    isOpen: alert.closedAt === null,
    elapsedMinutes,
    progress: Math.min(100, Math.round((elapsedMinutes / alert.limitMinutes) * 100)),
    label: alert.closedAt === null ? `${elapsedMinutes}분 경과` : `${elapsedMinutes}분 개방 후 닫힘`,
  }
}

export function getAlertDescription(alert: AlertItem, now: Date): string {
  switch (alert.kind) {
    case 'movement':
      return `${alert.from} → ${alert.to} · ${alert.unpaid ? '결제 확인이 필요해요.' : '결제가 확인됐어요.'}`
    case 'duration': {
      const door = getDoorStatus(alert, now)
      return door.isOpen ? `문이 ${door.elapsedMinutes}분째 열려 있어요.` : `문이 ${door.elapsedMinutes}분 열려 있다가 닫혔어요.`
    }
    case 'product':
      return `감지 상품: ${alert.product ?? '상품 확인 불가'}`
  }
}

export function getAlertGuide(alert: AlertItem): string {
  switch (alert.kind) {
    case 'movement':
      return alert.unpaid
        ? '상품을 집어 이동한 장면이 감지됐어요. 영상과 해당 시간대의 결제 기록을 비교해 주세요. AI 결과만으로 도난을 단정할 수는 없습니다.'
        : '상품 이동이 감지됐지만 결제가 확인된 건이에요. 별도로 조치하지 않아도 됩니다.'
    case 'duration':
      return '문이 오래 열려 있으면 상품이 상할 수 있어요. 문이 제대로 닫혔는지, 상품 상태가 괜찮은지 확인해 주세요.'
    case 'product':
      return '상품이 훼손된 것으로 보이는 장면이 감지됐어요. 영상과 실제 상품 상태를 확인해 주세요. AI 결과만으로 훼손을 단정할 수는 없습니다.'
  }
}

export function getAlertFacts(alert: AlertItem, cameras: Camera[], now: Date): { label: string; value: string }[] {
  const facts = [
    { label: '감지 시각', value: formatKstDateTime(alert.occurredAt) },
    { label: '카메라', value: getCameraLabel(cameras, alert.cameraId) },
    { label: '감지 유형', value: alertKindLabels[alert.kind] },
  ]
  switch (alert.kind) {
    case 'movement':
      facts.push({ label: '이동 경로', value: `${alert.from} → ${alert.to}` })
      facts.push({ label: '결제 상태', value: alert.unpaid ? '미결제' : '결제 확인' })
      break
    case 'duration':
      facts.push({ label: '개방 시간', value: getDoorStatus(alert, now).label })
      facts.push({ label: '허용 시간', value: `${alert.limitMinutes}분` })
      break
    case 'product':
      facts.push({ label: '감지 상품', value: alert.product ?? '상품 확인 불가' })
      break
  }
  return [...facts, { label: '처리 상태', value: getAlertStatus(alert).label }]
}

export function getTodayClips(clips: Clip[], alerts: AlertItem[], now: Date): ClipView[] {
  return newestFirst(alerts.filter((alert) => isToday(alert.occurredAt, now) && canViewClip(alert, clips))).flatMap(
    (alert) => clips.filter((clip) => clip.alertId === alert.id).map((clip) => toClipView(clip, alert, now)),
  )
}

// 선택했던 카메라가 사라지면 첫 번째 카메라를 보여준다
export function getActiveCamera(cameras: Camera[], cameraId: string | null): Camera | null {
  return cameras.find((camera) => camera.id === cameraId) ?? cameras[0] ?? null
}

export function getInquirySummary(inquiries: Inquiry[]) {
  return { total: inquiries.length, needsOwner: inquiries.filter(needsOwner).length }
}

export function getInquiryState(inquiry: Inquiry): { label: string; done: boolean } {
  if (inquiry.status === 'ai_resolved' || inquiry.replies.length > 0) return { label: '답변 완료', done: true }
  if (inquiry.read) return { label: '확인 완료', done: true }
  return { label: '확인 필요', done: false }
}

export function getInquiryMeta(inquiry: Inquiry, now: Date): string {
  const handler = inquiry.status === 'ai_resolved' ? 'AI 응대' : '점주 전달'
  return `${formatEventTime(inquiry.occurredAt, now)} · ${handler}`
}

// 관리용 앱은 대화를 "보낸 사람: 내용" 줄로 보낸다
export function parseTranscriptLine(line: string): { sender: string; text: string; fromCustomer: boolean } {
  const match = /^([^:]{1,10}):\s*(.*)$/s.exec(line)
  if (!match) return { sender: '기록', text: line, fromCustomer: false }
  const [, sender, text] = match
  return {
    sender: sender === AI_SENDER ? 'AI 상담' : sender,
    text,
    fromCustomer: sender === CUSTOMER_SENDER,
  }
}

type NotificationSource = {
  alerts: AlertItem[]
  inquiries: Inquiry[]
  cameras: Camera[]
  notificationSettings: NotificationSettings
}

// 직전 조회와 비교해 점주가 켜 둔 종류의 새 소식만 돌려준다
export function getNewNotifications(previous: NotificationSource, next: NotificationSource): string[] {
  const settings = next.notificationSettings
  const known = (items: { id: string }[]) => new Set(items.map((item) => item.id))
  const knownAlerts = known(previous.alerts)
  const knownInquiries = known(previous.inquiries)

  const alerts = next.alerts
    .filter((alert) => !knownAlerts.has(alert.id))
    .filter((alert) => (alert.kind === 'duration' ? settings.door : settings.alert))
    .map((alert) => alert.title)
  const inquiries = settings.inquiry
    ? next.inquiries.filter((inquiry) => !knownInquiries.has(inquiry.id)).map((inquiry) => `새 고객 문의: ${inquiry.title}`)
    : []
  const cameras = settings.camera
    ? next.cameras.flatMap((camera) => {
        const before = previous.cameras.find((item) => item.id === camera.id)
        if (!before || before.status === camera.status) return []
        return [`${camera.location} 카메라 ${camera.status === 'connected' ? '연결 복구' : '연결 끊김'}`]
      })
    : []
  return [...alerts, ...inquiries, ...cameras]
}

export function getPresetPeriod(days: number, now: Date): Period {
  const end = kstDay(now)
  return { start: shiftDay(end, 1 - days), end }
}

export function getReportStats(alerts: AlertItem[], period: Period) {
  const events = alerts.filter((alert) => inPeriod(alert, period))
  const resolved = events.filter((alert) => alert.confirmed).length
  return {
    detected: events.length,
    resolved,
    unconfirmed: events.length - resolved,
  }
}

// 하루는 시간대별, 일주일까지는 요일별, 그보다 길면 7일씩 묶어 보여준다
export function getReportTrend(alerts: AlertItem[], period: Period) {
  const events = alerts.filter((alert) => inPeriod(alert, period))
  const days = listDays(period)

  if (days.length === 1) {
    return withScale(
      Array.from({ length: 24 / SLOT_HOURS }, (_, index) => ({
        label: `${index * SLOT_HOURS}시`,
        count: events.filter((alert) => Math.floor(kstHour(alert.occurredAt) / SLOT_HOURS) === index).length,
      })),
    )
  }

  if (days.length <= WEEK_DAYS) {
    return withScale(
      days.map((day) => ({
        label: weekdayOf(day),
        count: events.filter((alert) => kstDay(alert.occurredAt) === day).length,
      })),
    )
  }

  return withScale(
    Array.from({ length: Math.ceil(days.length / WEEK_DAYS) }, (_, index) => {
      const week = days.slice(index * WEEK_DAYS, (index + 1) * WEEK_DAYS)
      return {
        label: `${index + 1}주`,
        count: events.filter((alert) => week.includes(kstDay(alert.occurredAt))).length,
      }
    }),
  )
}

import { formatEventTime, kstDay, kstHour, listDays, shiftDay } from './time'
import type { AlertItem, AlertKind, Camera, Clip, ClipView, Inquiry, Integration, Period, Tone } from './types'

const MAX_PERIOD_DAYS = 31
const SLOT_HOURS = 4
const MIN_PASSWORD_LENGTH = 8

export const alertKinds: AlertKind[] = ['movement', 'duration', 'product']

export const alertKindLabels: Record<AlertKind, string> = {
  movement: '상품 이동',
  duration: '문 개방',
  product: '상품 훼손',
}

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

export function confirmAlert(alerts: AlertItem[], id: string): AlertItem[] {
  return alerts.map((alert) => (alert.id === id ? { ...alert, confirmed: true } : alert))
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

export function getIntegrationBadge({ status }: Integration): { label: string; tone: Tone } {
  if (status === 'waiting') return { label: '연동 대기', tone: 'orange' }
  if (status === 'offline') return { label: '연결 확인 필요', tone: 'red' }
  return { label: '운영 정상', tone: 'green' }
}

// 숫자가 0이어도 이상이 없다는 뜻이 아닐 때만 문구를 돌려준다
export function getIntegrationNotice({ status, lastSeenAt }: Integration, now: Date): string | null {
  if (status === 'waiting') return '관리용 앱이 아직 연결되지 않아 집계를 시작하지 않았습니다.'
  if (status === 'offline' && lastSeenAt) {
    return `관리용 앱 연결이 끊겼습니다. 마지막 수신(${formatEventTime(lastSeenAt, now)}) 이후는 집계되지 않았습니다.`
  }
  return null
}

export function getTodaySummary(unconfirmedAlerts: number, { status }: Integration) {
  if (status === 'waiting') {
    return {
      headline: '아직 집계된 데이터가 없습니다.',
      detail: '관리용 앱이 연결되면 오늘의 요약을 보여드려요.',
    }
  }
  if (unconfirmedAlerts === 0) {
    return {
      headline: '미확인 이벤트가 없습니다.',
      detail: '감지된 이벤트를 모두 확인했어요.',
    }
  }
  return {
    headline: `미확인 이벤트 ${unconfirmedAlerts}건이 있습니다.`,
    detail: '영상 클립을 확인하고 처리 상태를 기록하세요.',
  }
}

export function getRecentActivities(alerts: AlertItem[], now: Date, limit = 3) {
  return newestFirst(alerts)
    .slice(0, limit)
    .map((alert) => ({
      id: alert.id,
      title: alert.title,
      status: alert.confirmed ? '확인 완료' : '확인 필요',
      time: formatEventTime(alert.occurredAt, now),
      tone: alert.tone,
    }))
}

// 지난 알림은 확인 전까지 목록에 남는다
export function getVisibleAlerts(alerts: AlertItem[], now: Date): AlertItem[] {
  return newestFirst(alerts.filter((alert) => !alert.confirmed || isToday(alert.occurredAt, now)))
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

export function getClipView(clip: Clip, alerts: AlertItem[], now: Date): ClipView | null {
  const alert = alerts.find((item) => item.id === clip.alertId)
  return alert ? toClipView(clip, alert, now) : null
}

export function getTodayClips(clips: Clip[], alerts: AlertItem[], now: Date): ClipView[] {
  return newestFirst(alerts.filter((alert) => isToday(alert.occurredAt, now))).flatMap((alert) =>
    clips.filter((clip) => clip.alertId === alert.id).map((clip) => toClipView(clip, alert, now)),
  )
}

// 선택했던 카메라가 사라지면 첫 번째 카메라를 보여준다
export function getActiveCamera(cameras: Camera[], cameraId: string | null) {
  if (cameras.length === 0) return null
  const index = Math.max(
    cameras.findIndex((camera) => camera.id === cameraId),
    0,
  )
  return { camera: cameras[index], index }
}

// 끝에 닿으면 반대쪽 끝으로 돌아간다
export function getAdjacentCameraId(cameras: Camera[], cameraId: string | null, step: 1 | -1): string | null {
  const active = getActiveCamera(cameras, cameraId)
  if (!active) return null
  return cameras[(active.index + step + cameras.length) % cameras.length].id
}

export function getInquirySummary(inquiries: Inquiry[], now: Date) {
  const today = inquiries.filter((inquiry) => isToday(inquiry.occurredAt, now))
  return {
    total: today.length,
    needsOwner: inquiries.filter(needsOwner).length,
    aiResolved: today.filter((inquiry) => inquiry.status === 'ai_resolved').length,
    forwarded: today.filter((inquiry) => inquiry.status === 'forwarded').length,
  }
}

export function getInquiryBadge(inquiry: Inquiry): { label: string; tone: Tone } {
  if (inquiry.status === 'ai_resolved') return { label: 'AI 응대 완료', tone: 'green' }
  if (inquiry.read) return { label: '점주 확인 완료', tone: 'blue' }
  return { label: '점주 확인 필요', tone: 'orange' }
}

export function getPresetPeriod(days: number, now: Date): Period {
  const end = kstDay(now)
  return { start: shiftDay(end, 1 - days), end }
}

export function getPeriodError({ start, end }: Period, now: Date): string | null {
  if (!start || !end) return '시작일과 종료일을 모두 선택하세요.'
  if (start > end) return '시작일은 종료일보다 늦을 수 없습니다.'
  if (end > kstDay(now)) return '오늘 이후 날짜는 선택할 수 없습니다.'
  if (listDays({ start, end }).length > MAX_PERIOD_DAYS) return `기간은 최대 ${MAX_PERIOD_DAYS}일까지 선택할 수 있습니다.`
  return null
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

export function getDailyTrend(alerts: AlertItem[], period: Period) {
  return withScale(
    listDays(period).map((day) => ({
      date: day,
      label: `${Number(day.slice(8))}일`,
      count: alerts.filter((alert) => kstDay(alert.occurredAt) === day).length,
    })),
  )
}

export function getTimeTrend(alerts: AlertItem[], period: Period) {
  const events = alerts.filter((alert) => inPeriod(alert, period))
  const slots = Array.from({ length: 24 / SLOT_HOURS }, (_, index) => {
    const startHour = index * SLOT_HOURS
    const slotEvents = events.filter((alert) => Math.floor(kstHour(alert.occurredAt) / SLOT_HOURS) === index)
    return {
      label: `${startHour}~${startHour + SLOT_HOURS}시`,
      count: slotEvents.length,
      byKind: Object.fromEntries(
        alertKinds.map((kind) => [kind, slotEvents.filter((alert) => alert.kind === kind).length]),
      ) as Record<AlertKind, number>,
    }
  })
  return withScale(slots)
}

export function getReportSummary(stats: { detected: number; unconfirmed: number }): string[] {
  if (stats.detected === 0) return ['선택한 기간에 집계된 이벤트가 없습니다.']
  return [
    `선택한 기간의 이상행동 감지 이벤트 ${stats.detected}건`,
    stats.unconfirmed > 0 ? `미확인 이벤트 ${stats.unconfirmed}건 확인 필요` : '미확인 이벤트 없음',
  ]
}

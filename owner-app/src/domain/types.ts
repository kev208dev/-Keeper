export type Tone = 'red' | 'orange' | 'green' | 'blue'

export type Store = {
  name: string
}

// waiting은 관리용 앱이 한 번도 연결된 적 없음, offline은 연결이 끊긴 상태
export type Integration = {
  status: 'waiting' | 'online' | 'offline'
  lastSeenAt: string | null
}

export type AlertItem = {
  id: string
  label: string
  tone: Tone
  title: string
  occurredAt: string
  cameraId: string
  confirmed: boolean
} & (
  | { kind: 'movement'; from: string; to: string; unpaid: boolean }
  | { kind: 'duration'; openedAt: string; closedAt: string | null; limitMinutes: number }
  | { kind: 'product'; product: string | null }
)

export type AlertKind = AlertItem['kind']

export type Camera = {
  id: string
  name: string
  location: string
  status: 'connected' | 'disconnected'
}

export type Clip = {
  id: string
  alertId: string
  duration: string
}

export type ClipView = {
  id: string
  kind: AlertKind
  title: string
  time: string
  cameraId: string
  duration: string
}

export type Inquiry = {
  id: string
  title: string
  note: string
  transcript: string[]
  occurredAt: string
  status: 'forwarded' | 'ai_resolved'
  read: boolean
}

// 날짜는 한국 시간 기준 YYYY-MM-DD 문자열
export type Period = {
  start: string
  end: string
}

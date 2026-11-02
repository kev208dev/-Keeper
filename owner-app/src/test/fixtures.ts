// 테스트 전용 예시 데이터. 앱 코드에서 가져다 쓰면 안 된다.
import type { Dashboard, KeeperApi } from '../api/types'
import { confirmAlert, markInquiryRead } from '../domain/rules'
import type { AlertItem, AlertKind, Camera, Clip, Inquiry, Integration, Store } from '../domain/types'

// 예시 데이터가 기준으로 삼는 현재 시각
export const demoNow = new Date('2026-10-23T15:00:00+09:00')

export const store: Store = { name: '우리동네 아이스크림점' }

export const onlineIntegration: Integration = {
  status: 'online',
  lastSeenAt: '2026-10-23T14:59:00+09:00',
}

export const cameras: Camera[] = [
  { id: 'cam-01', name: '카메라 01', location: '매장 입구', status: 'connected' },
  { id: 'cam-02', name: '카메라 02', location: '상품 진열대', status: 'connected' },
  { id: 'cam-03', name: '카메라 03', location: '냉동고 구역', status: 'connected' },
]

const todayAlerts: AlertItem[] = [
  {
    id: 'e1',
    kind: 'duration',
    label: '주의 행동 감지',
    tone: 'orange',
    title: '냉장고 문 장시간 개방',
    occurredAt: '2026-10-23T14:42:00+09:00',
    openedAt: '2026-10-23T14:32:00+09:00',
    closedAt: null,
    limitMinutes: 35,
    cameraId: 'cam-03',
    confirmed: false,
  },
  {
    id: 'e2',
    kind: 'movement',
    label: '이상 행동 감지',
    tone: 'red',
    title: '상품 이동 감지',
    occurredAt: '2026-10-23T14:08:00+09:00',
    from: '입구 진열대',
    to: '냉동고 구역',
    unpaid: true,
    cameraId: 'cam-02',
    confirmed: true,
  },
  {
    id: 'e3',
    kind: 'product',
    label: '이상 행동 감지',
    tone: 'green',
    title: '상품 훼손 의심',
    occurredAt: '2026-10-23T10:32:00+09:00',
    product: '초코 아이스크림 (500ml)',
    cameraId: 'cam-02',
    confirmed: true,
  },
]

function pastAlert(id: string, occurredAt: string, kind: AlertKind): AlertItem {
  const base = { id, occurredAt, cameraId: 'cam-03', confirmed: true }
  if (kind === 'movement') {
    return {
      ...base,
      kind,
      label: '이상 행동 감지',
      tone: 'red',
      title: '상품 이동 감지',
      from: '입구 진열대',
      to: '매장 입구',
      unpaid: true,
    }
  }
  if (kind === 'product') {
    return { ...base, kind, label: '이상 행동 감지', tone: 'green', title: '상품 훼손 의심', product: '딸기 아이스크림' }
  }
  return {
    ...base,
    kind,
    label: '주의 행동 감지',
    tone: 'orange',
    title: '냉장고 문 장시간 개방',
    openedAt: occurredAt,
    closedAt: occurredAt,
    limitMinutes: 35,
  }
}

const pastAlerts: AlertItem[] = [
  pastAlert('e4', '2026-10-17T13:20:00+09:00', 'movement'),
  pastAlert('e5', '2026-10-18T22:10:00+09:00', 'duration'),
  pastAlert('e6', '2026-10-19T09:45:00+09:00', 'product'),
  pastAlert('e7', '2026-10-20T01:15:00+09:00', 'movement'),
  pastAlert('e8', '2026-10-20T13:05:00+09:00', 'duration'),
  pastAlert('e9', '2026-10-20T19:30:00+09:00', 'duration'),
  pastAlert('e10', '2026-10-20T23:40:00+09:00', 'movement'),
  pastAlert('e11', '2026-10-21T16:25:00+09:00', 'product'),
  pastAlert('e12', '2026-10-22T20:50:00+09:00', 'duration'),
  pastAlert('e13', '2026-10-05T21:10:00+09:00', 'duration'),
  pastAlert('e14', '2026-10-09T02:30:00+09:00', 'movement'),
  pastAlert('e15', '2026-10-12T22:40:00+09:00', 'duration'),
]

export const alerts: AlertItem[] = [...todayAlerts, ...pastAlerts]

export const clips: Clip[] = [
  { id: 'c1', alertId: 'e1', duration: '00:22' },
  { id: 'c2', alertId: 'e2', duration: '00:14' },
  { id: 'c3', alertId: 'e3', duration: '00:18' },
]

export const inquiries: Inquiry[] = [
  {
    id: 'q1',
    title: '결제 후 상품이 나오지 않아요',
    note: 'AI 상담에서 해결되지 않아 점주에게 전달됨',
    transcript: ['고객: 결제했는데 상품이 나오지 않아요.', 'AI: 결제 내역을 확인했지만 해결하지 못해 점주님께 전달했습니다.'],
    occurredAt: '2026-10-23T14:08:00+09:00',
    status: 'forwarded',
    read: false,
  },
  {
    id: 'q2',
    title: '딸기 아이스크림은 어디 있나요?',
    note: 'AI가 상품 위치 확인 방법을 안내함',
    transcript: ['고객: 딸기 아이스크림은 어디 있나요?', 'AI: 키오스크의 상품 찾기에서 진열 위치를 확인할 수 있어요.'],
    occurredAt: '2026-10-23T10:32:00+09:00',
    status: 'ai_resolved',
    read: false,
  },
]

export const dashboard: Dashboard = {
  store,
  integration: onlineIntegration,
  cameras,
  alerts,
  clips,
  inquiries,
}

export function createFixtureApi(overrides: Partial<Dashboard> = {}): KeeperApi {
  let current = { ...dashboard, ...overrides }

  return {
    getDashboard: async () => current,
    getAlerts: async () => current.alerts,
    confirmAlert: async (id) => {
      current = { ...current, alerts: confirmAlert(current.alerts, id) }
    },
    markInquiryRead: async (id) => {
      current = { ...current, inquiries: markInquiryRead(current.inquiries, id) }
    },
  }
}

// 관리용 앱이 보내는 이벤트를 만든다. server/simulator.py의 시나리오와 같은 내용이다
export type DeviceEvent = { eventId: string; type: string; occurredAt: string } & Record<string, unknown>

export type Step = {
  message: string
  build: (occurredAt: string) => DeviceEvent
}

export type InquiryKind = 'forwarded' | 'ai_resolved'

export const SIM_CAMERAS = [
  { id: 'cam-01', name: '카메라 01', location: '매장 입구' },
  { id: 'cam-02', name: '카메라 02', location: '상품 진열대' },
  { id: 'cam-03', name: '카메라 03', location: '냉동고 구역' },
]

const INQUIRIES = {
  forwarded: {
    title: '결제했는데 문이 안 열려요',
    note: 'AI 상담에서 해결되지 않아 점주에게 전달됨',
    answer: 'AI: 해결하지 못해 점주님께 전달했습니다.',
  },
  ai_resolved: {
    title: '영수증은 어디서 받나요?',
    note: 'AI가 영수증 출력 방법을 안내함',
    answer: 'AI: 키오스크의 결제 내역에서 출력할 수 있어요.',
  },
}

export function newEventId(name: string): string {
  return `sim-${crypto.randomUUID().slice(0, 8)}-${name}`
}

export function cameraEvent(eventId: string, cameraId: string, status: string, occurredAt: string): DeviceEvent {
  const { name, location } = SIM_CAMERAS.find((camera) => camera.id === cameraId)!
  return { eventId, type: 'camera.status', occurredAt, cameraId, name, location, status }
}

export function movementEvent(eventId: string, occurredAt: string): DeviceEvent {
  return {
    eventId,
    type: 'alert.movement',
    occurredAt,
    cameraId: 'cam-02',
    from: '입구 진열대',
    to: '매장 입구',
    unpaid: true,
  }
}

export function clipEvent(eventId: string, alertEventId: string, occurredAt: string): DeviceEvent {
  return { eventId, type: 'clip.ready', occurredAt, alertEventId, duration: '00:14' }
}

export function doorOpenEvent(eventId: string, occurredAt: string): DeviceEvent {
  const openedAt = new Date(new Date(occurredAt).getTime() - 10 * 60_000).toISOString()
  return { eventId, type: 'alert.door_open', occurredAt, cameraId: 'cam-03', openedAt, limitMinutes: 35 }
}

export function doorClosedEvent(eventId: string, alertEventId: string, occurredAt: string): DeviceEvent {
  return { eventId, type: 'door.closed', occurredAt, alertEventId }
}

export function damageEvent(eventId: string, occurredAt: string): DeviceEvent {
  return { eventId, type: 'alert.product_damage', occurredAt, cameraId: 'cam-02', product: null }
}

export function inquiryEvent(eventId: string, kind: InquiryKind, occurredAt: string): DeviceEvent {
  const { title, note, answer } = INQUIRIES[kind]
  return {
    eventId,
    type: 'inquiry.created',
    occurredAt,
    title,
    note,
    transcript: [`고객: ${title}`, answer],
    status: kind,
  }
}

// 실행할 때마다 eventId가 달라야 새 이벤트로 집계된다
export function buildScenario(): Step[] {
  const movementId = newEventId('movement')
  const doorId = newEventId('door')

  return [
    ...SIM_CAMERAS.map((camera) => ({
      message: `${camera.name} 연결`,
      build: (at: string) => cameraEvent(newEventId(`${camera.id}-on`), camera.id, 'connected', at),
    })),
    { message: '상품 이동 감지 (미결제)', build: (at) => movementEvent(movementId, at) },
    { message: '상품 이동 영상 클립 생성', build: (at) => clipEvent(newEventId('clip'), movementId, at) },
    { message: '응답을 못 받은 상황을 가정해 같은 이벤트 재전송', build: (at) => movementEvent(movementId, at) },
    { message: '냉장고 문 장시간 개방 감지', build: (at) => doorOpenEvent(doorId, at) },
    { message: '상품 훼손 의심 감지 (상품 식별 실패)', build: (at) => damageEvent(newEventId('damage'), at) },
    {
      message: '고객 문의 접수 (AI가 해결 못 해 점주에게 전달)',
      build: (at) => inquiryEvent(newEventId('inquiry'), 'forwarded', at),
    },
    { message: '고객 문의 접수 (AI가 해결)', build: (at) => inquiryEvent(newEventId('inquiry'), 'ai_resolved', at) },
    { message: '카메라 02 연결 끊김', build: (at) => cameraEvent(newEventId('cam-02-off'), 'cam-02', 'disconnected', at) },
    { message: '카메라 02 연결 복구', build: (at) => cameraEvent(newEventId('cam-02-back'), 'cam-02', 'connected', at) },
    { message: '냉장고 문 닫힘', build: (at) => doorClosedEvent(newEventId('door-closed'), doorId, at) },
  ]
}

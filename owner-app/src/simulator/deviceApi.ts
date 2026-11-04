import { request } from '../api/httpApi'
import type { DeviceEvent } from './events'

export type WaitingReply = {
  id: string
  inquiryId: string
  body: string
  sentAt: string
}

const STORAGE_KEY = 'keeper.simulator.device'
export const SIMULATOR_DEVICE_ID = 'web-simulator'

// 같은 화면이 동시에 두 번 요청해도 키는 하나만 만든다
const issuing = new Map<string, Promise<string>>()

// 계정이 바뀌면 다른 매장으로 보내지 않도록 키를 발급받은 로그인과 묶어 저장한다
function readSavedKey(token: string): string | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null')
    return saved?.token === token ? saved.deviceKey : null
  } catch {
    return null
  }
}

function saveKey(token: string, deviceKey: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, deviceKey }))
  } catch {
    // 저장에 실패하면 다음 접속 때 새로 발급받는다
  }
}

export function forgetDeviceKey(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 지울 저장소가 없으면 할 일이 없다
  }
}

async function issueDeviceKey(baseUrl: string, token: string): Promise<string> {
  const response = await request(baseUrl, '/api/devices', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  const { deviceKey }: { deviceKey: string } = await response.json()
  saveKey(token, deviceKey)
  return deviceKey
}

export function loadDeviceKey(baseUrl: string, token: string): Promise<string> {
  const saved = readSavedKey(token)
  if (saved) return Promise.resolve(saved)

  const running = issuing.get(token) ?? issueDeviceKey(baseUrl, token).finally(() => issuing.delete(token))
  issuing.set(token, running)
  return running
}

export function createDeviceApi(baseUrl: string, deviceKey: string) {
  const post = (path: string, body: unknown = {}) =>
    request(baseUrl, path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Key': deviceKey,
        'X-Device-Id': SIMULATOR_DEVICE_ID,
      },
      body: JSON.stringify(body),
    })

  return {
    send: async (event: DeviceEvent) => {
      const payload = event.type === 'inquiry.created' ? { ...event, deviceId: SIMULATOR_DEVICE_ID } : event
      const response = await post('/ingest/events', payload)
      const { status }: { status: 'accepted' | 'duplicate' } = await response.json()
      return status
    },
    // 서버는 이 조회를 생존 신호로도 받는다. 화면 반영 전에는 전달 완료를 보내지 않는다.
    receiveReplies: async () => {
      const response = await post('/ingest/replies/pull')
      return (await response.json()) as WaitingReply[]
    },
    acknowledgeReply: async (id: string) => {
      await post(`/ingest/replies/${encodeURIComponent(id)}/delivered`)
    },
  }
}

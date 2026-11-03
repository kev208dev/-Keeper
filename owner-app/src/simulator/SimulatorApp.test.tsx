import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cameras, inquiries, alerts, clips, notificationSettings, onlineIntegration, store } from '../test/fixtures'
import SimulatorApp from './SimulatorApp'

const TOKEN = 'test-token'
const TOKEN_KEY = 'keeper.token'
const DEVICE_STORAGE_KEY = 'keeper.simulator.device'
const DEVICE_KEY = 'issued-key'

type Sent = { eventId: string; type: string; alertEventId?: string; cameraId?: string; status?: string }

// 실제 서버와 같은 경로와 상태 코드로 답하는 가짜 서버
function createFakeServer() {
  const state = {
    validKeys: new Set([DEVICE_KEY]),
    issued: 0,
    issueStatus: 201,
    dashboardStatus: 200,
    offline: false,
    events: [] as Sent[],
    keysUsed: [] as string[],
    waiting: [] as { id: string; inquiryId: string; body: string; sentAt: string }[],
    delivered: [] as string[],
    cameras,
  }

  const respond = (body: unknown, status = 200) =>
    new Response(status === 204 ? null : JSON.stringify(body), { status })

  const fetchMock = vi.fn(async (input: string, init: RequestInit = {}) => {
    if (state.offline) throw new TypeError('Failed to fetch')
    const headers = (init.headers ?? {}) as Record<string, string>

    if (input === '/api/auth/login') return respond({ token: TOKEN })

    if (input.startsWith('/ingest/')) {
      if (!state.validKeys.has(headers['X-Device-Key'])) return respond({}, 401)
      if (input === '/ingest/replies/pull') {
        return respond(state.waiting.filter((reply) => !state.delivered.includes(reply.id)))
      }
      if (input.endsWith('/delivered')) {
        state.delivered.push(input.split('/')[3])
        return respond(null, 204)
      }
      const event = JSON.parse(init.body as string) as Sent
      const duplicate = state.events.some((item) => item.eventId === event.eventId)
      state.events.push(event)
      state.keysUsed.push(headers['X-Device-Key'])
      if (event.type === 'camera.status') {
        state.cameras = state.cameras.map((camera) =>
          camera.id === event.cameraId ? { ...camera, status: event.status as 'connected' } : camera,
        )
      }
      return respond({ status: duplicate ? 'duplicate' : 'accepted' }, 202)
    }

    if (headers.Authorization !== `Bearer ${TOKEN}`) return respond({}, 401)
    if (input === '/api/devices') {
      if (state.issueStatus !== 201) return respond({}, state.issueStatus)
      state.issued += 1
      return respond({ deviceKey: DEVICE_KEY }, 201)
    }
    if (state.dashboardStatus !== 200) return respond({}, state.dashboardStatus)
    return respond({
      store,
      integration: onlineIntegration,
      cameras: state.cameras,
      alerts,
      clips,
      inquiries,
      notificationSettings,
    })
  })

  return { state, fetchMock }
}

let server: ReturnType<typeof createFakeServer>

beforeEach(() => {
  window.localStorage.clear()
  server = createFakeServer()
  vi.stubGlobal('fetch', server.fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function openSimulator() {
  window.localStorage.setItem(TOKEN_KEY, TOKEN)
  render(<SimulatorApp stepMs={0} />)
  await screen.findByRole('heading', { name: '시뮬레이터' })
  await waitFor(() => expect(screen.getByRole('button', { name: '시나리오 실행' })).toBeEnabled())
}

function logText() {
  return within(screen.getByRole('region', { name: '보낸 기록' })).getByRole('list').textContent
}

describe('접속', () => {
  test('로그인하지 않았으면 로그인 화면을 보여 주고, 로그인하면 시뮬레이터가 열린다', async () => {
    render(<SimulatorApp stepMs={0} />)

    await userEvent.type(screen.getByLabelText('이메일'), 'owner@keeper.test')
    await userEvent.type(screen.getByLabelText('비밀번호'), 'right-password')
    await userEvent.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('heading', { name: '시뮬레이터' })).toBeInTheDocument()
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe(TOKEN)
  })

  test('어느 매장으로 보내는지 보여 준다', async () => {
    await openSimulator()

    expect(screen.getByText(store.name)).toBeInTheDocument()
  })

  test('점주 앱에 로그인되어 있으면 키를 몰라도 기기 키를 발급받아 저장한다', async () => {
    await openSimulator()

    expect(server.state.issued).toBe(1)
    expect(JSON.parse(window.localStorage.getItem(DEVICE_STORAGE_KEY)!)).toEqual({
      token: TOKEN,
      deviceKey: DEVICE_KEY,
    })
  })

  test('저장한 키가 있으면 새로 발급받지 않는다', async () => {
    window.localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify({ token: TOKEN, deviceKey: DEVICE_KEY }))

    await openSimulator()

    expect(server.state.issued).toBe(0)
  })

  test('다른 계정이 저장한 키는 쓰지 않는다', async () => {
    window.localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify({ token: 'other', deviceKey: 'other-key' }))

    await openSimulator()

    await userEvent.click(screen.getByRole('button', { name: '상품 이동 감지' }))

    await waitFor(() => expect(server.state.keysUsed).toEqual([DEVICE_KEY]))
  })

  test('저장한 키가 서버에서 무효이면 새로 발급받는다', async () => {
    window.localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify({ token: TOKEN, deviceKey: 'stale-key' }))

    await openSimulator()

    await waitFor(() => expect(server.state.issued).toBe(1))
    await userEvent.click(await screen.findByRole('button', { name: '상품 이동 감지' }))
    await waitFor(() => expect(server.state.keysUsed).toEqual([DEVICE_KEY]))
  })

  test('로그인이 만료되면 로그인 화면으로 돌아간다', async () => {
    server.state.issueStatus = 401
    window.localStorage.setItem(TOKEN_KEY, TOKEN)

    render(<SimulatorApp stepMs={0} />)

    expect(await screen.findByRole('heading', { name: '점주 로그인' })).toBeInTheDocument()
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull()
  })

  test('키 발급 횟수를 넘으면 이유를 알려 준다', async () => {
    server.state.issueStatus = 429
    window.localStorage.setItem(TOKEN_KEY, TOKEN)

    render(<SimulatorApp stepMs={0} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('기기 키를 너무 많이 만들었습니다')
  })

  test('서버가 꺼져 있으면 알려 준다', async () => {
    server.state.offline = true
    window.localStorage.setItem(TOKEN_KEY, TOKEN)

    render(<SimulatorApp stepMs={0} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('서버에 연결할 수 없습니다.')
  })
})

describe('이벤트 하나씩 보내기', () => {
  test('버튼을 누르면 기기 키로 이벤트를 보내고 기록에 남긴다', async () => {
    await openSimulator()

    await userEvent.click(screen.getByRole('button', { name: '상품 훼손 의심' }))

    await waitFor(() => expect(server.state.events.map((event) => event.type)).toEqual(['alert.product_damage']))
    expect(server.state.keysUsed).toEqual([DEVICE_KEY])
    await waitFor(() => expect(logText()).toContain('상품 훼손 의심 감지'))
    expect(logText()).toContain('반영')
  })

  test('클립은 상품 이동을 보낸 뒤에만 보낼 수 있고 그 알림을 가리킨다', async () => {
    await openSimulator()
    const clip = screen.getByRole('button', { name: '영상 클립 생성' })
    expect(clip).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: '상품 이동 감지' }))
    await waitFor(() => expect(clip).toBeEnabled())
    await userEvent.click(clip)

    await waitFor(() => expect(server.state.events).toHaveLength(2))
    const [movement, sent] = server.state.events
    expect(sent.alertEventId).toBe(movement.eventId)
    await waitFor(() => expect(clip).toBeDisabled())
  })

  test('문 닫힘은 문을 연 뒤에만 보낼 수 있고 그 알림을 가리킨다', async () => {
    await openSimulator()
    const closed = screen.getByRole('button', { name: '냉장고 문 닫힘' })
    expect(closed).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: '냉장고 문 개방' }))
    await waitFor(() => expect(closed).toBeEnabled())
    await userEvent.click(closed)

    await waitFor(() => expect(server.state.events).toHaveLength(2))
    expect(server.state.events[1].alertEventId).toBe(server.state.events[0].eventId)
  })

  test.each([
    ['문의 (점주 전달)', 'forwarded'],
    ['문의 (AI 해결)', 'ai_resolved'],
  ])('%s 버튼은 문의 이벤트를 보낸다', async (name, status) => {
    await openSimulator()

    await userEvent.click(screen.getByRole('button', { name }))

    await waitFor(() => expect(server.state.events).toHaveLength(1))
    expect(server.state.events[0]).toMatchObject({ type: 'inquiry.created', status })
  })

  test('카메라 버튼은 상태를 바꾸고 화면에도 반영한다', async () => {
    await openSimulator()

    await userEvent.click(screen.getByRole('button', { name: '카메라 01 연결 끊기' }))

    expect(await screen.findByRole('button', { name: '카메라 01 연결하기' })).toBeInTheDocument()
    expect(server.state.events[0]).toMatchObject({ cameraId: 'cam-01', status: 'disconnected' })
  })

  test('전송에 실패하면 기록에 실패로 남기고 후속 버튼을 열지 않는다', async () => {
    await openSimulator()
    server.state.offline = true

    await userEvent.click(screen.getByRole('button', { name: '상품 이동 감지' }))

    await waitFor(() => expect(logText()).toContain('실패'))
    expect(await screen.findByRole('alert')).toHaveTextContent('서버에 연결할 수 없습니다.')
    expect(screen.getByRole('button', { name: '영상 클립 생성' })).toBeDisabled()
  })
})

describe('전체 시나리오', () => {
  test('모든 단계를 순서대로 보내고 재전송은 중복으로 기록한다', async () => {
    await openSimulator()

    await userEvent.click(screen.getByRole('button', { name: '시나리오 실행' }))

    await waitFor(() => expect(logText()).toContain('시나리오 끝'))
    expect(server.state.events).toHaveLength(13)
    expect(server.state.events.at(-1)!.type).toBe('door.closed')
    expect(logText()).toContain('중복이라 무시됨')
  })

  test('실행 중에는 다른 이벤트를 보낼 수 없고 중지할 수 있다', async () => {
    window.localStorage.setItem(TOKEN_KEY, TOKEN)
    render(<SimulatorApp stepMs={20} />)
    await userEvent.click(await screen.findByRole('button', { name: '시나리오 실행' }))

    expect(await screen.findByRole('button', { name: /^중지/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '상품 이동 감지' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: /^중지/ }))

    await waitFor(() => expect(logText()).toContain('시나리오 중지'))
    expect(server.state.events.length).toBeLessThan(13)
  })

  test('서버가 끊기면 시나리오를 멈춘다', async () => {
    await openSimulator()
    server.state.offline = true

    await userEvent.click(screen.getByRole('button', { name: '시나리오 실행' }))

    await waitFor(() => expect(logText()).toContain('시나리오 끝'))
    expect(server.state.events).toHaveLength(0)
    expect(logText()).toContain('실패')
  })
})

describe('점주 답변', () => {
  const reply = { id: 'r1', inquiryId: 'q1', body: '환불해 드릴게요', sentAt: '2026-10-23T05:08:00.000Z' }

  test('열자마자 기다리던 답변을 받아 표시하고 전달 완료를 보낸다', async () => {
    server.state.waiting = [reply]

    await openSimulator()

    expect(await screen.findByText('환불해 드릴게요')).toBeInTheDocument()
    await waitFor(() => expect(server.state.delivered).toContain('r1'))
  })

  test('답변이 없으면 안내를 보여 준다', async () => {
    await openSimulator()

    expect(screen.getByText(/답변을 보내면 여기에 표시됩니다/)).toBeInTheDocument()
  })

  test('열어 둔 동안 새 답변도 주기적으로 받는다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await openSimulator()
    server.state.waiting = [reply]

    await vi.advanceTimersByTimeAsync(5_000)

    expect(await screen.findByText('환불해 드릴게요')).toBeInTheDocument()
  })
})

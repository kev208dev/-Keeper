import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import App from './App'
import { confirmAlert } from './domain/rules'
import { alerts, cameras, clips, demoNow, inquiries, notificationSettings, onlineIntegration, store } from './test/fixtures'

const TOKEN = 'test-token'
const TOKEN_KEY = 'keeper.token'
const DEVICE_KEY = 'test-device-key'
const HOME_MARKER = '지금 확인할 알림'

type Call = { method: string; url: string }

// 실제 서버와 같은 경로와 상태 코드로 답하는 가짜 서버
function createFakeServer() {
  const state = {
    alerts,
    inquiries,
    integration: onlineIntegration,
    status: 200,
    signupStatus: 201,
    signupBody: null as unknown,
    lastBody: null as unknown,
    offline: false,
    calls: [] as Call[],
  }

  const respond = (body: unknown, status = 200) =>
    new Response(status === 204 ? null : JSON.stringify(body), { status })

  const fetchMock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET'
    state.calls.push({ method, url: input })
    if (init.body) state.lastBody = JSON.parse(init.body as string)
    if (state.offline) throw new TypeError('Failed to fetch')

    if (input === '/api/auth/login') {
      const { password } = JSON.parse(init.body as string)
      if (password === 'limited') return respond({}, 429)
      return password === 'right' ? respond({ token: TOKEN }) : respond({}, 401)
    }
    if (input === '/api/auth/signup') {
      state.signupBody = JSON.parse(init.body as string)
      return state.signupStatus === 201
        ? respond({ token: TOKEN, deviceKey: DEVICE_KEY }, 201)
        : respond({}, state.signupStatus)
    }
    if ((init.headers as Record<string, string>)?.Authorization !== `Bearer ${TOKEN}`) return respond({}, 401)
    if (state.status !== 200) return respond({}, state.status)

    if (input.startsWith('/api/dashboard')) {
      return respond({
        store,
        cameras,
        clips,
        integration: state.integration,
        alerts: state.alerts,
        inquiries: state.inquiries,
        notificationSettings,
      })
    }
    if (input.startsWith('/api/alerts?')) return respond(state.alerts)
    const confirm = input.match(/^\/api\/alerts\/(.+)\/confirm$/)
    if (confirm) {
      const { resolution } = JSON.parse(init.body as string)
      state.alerts = confirmAlert(state.alerts, confirm[1], resolution)
      return respond(null, 204)
    }
    const detail = input.match(/^\/api\/alerts\/([^/]+)$/)
    if (detail) {
      const alert = state.alerts.find((item) => item.id === detail[1])
      return alert ? respond({ alert, clip: null }) : respond({}, 404)
    }
    if (input.match(/^\/api\/inquiries\/.+\/read$/)) return respond(null, 204)
    if (input.match(/^\/api\/inquiries\/.+\/replies$/)) {
      return respond({ id: 'r1', body: '답변', sentAt: '2026-10-23T14:10:00+09:00', delivered: false }, 201)
    }
    if (input === '/api/store' || input === '/api/notification-settings') return respond(null, 204)
    if (input === '/api/notices') return respond([])
    if (input === '/api/auth/logout') return respond(null, 204)
    return respond({}, 404)
  })

  vi.stubGlobal('fetch', fetchMock)
  return state
}

function stat(label: string) {
  return screen.getByText(label).parentElement!
}

function signedIn() {
  window.localStorage.setItem(TOKEN_KEY, TOKEN)
}

async function login(password: string) {
  await userEvent.type(screen.getByLabelText('이메일'), 'owner@keeper.test')
  await userEvent.type(screen.getByLabelText('비밀번호'), password)
  await userEvent.click(screen.getByRole('button', { name: '로그인' }))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: demoNow })
  window.localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('로그인', () => {
  test('로그인 전에는 로그인 화면만 보이고 서버에 데이터를 요청하지 않는다', () => {
    const server = createFakeServer()

    render(<App dataSource="api" />)

    expect(screen.getByRole('heading', { name: '점주 로그인' })).toBeInTheDocument()
    expect(server.calls).toEqual([])
  })

  test('로그인하면 토큰을 저장하고 서버 데이터로 홈을 보여준다', async () => {
    createFakeServer()
    render(<App dataSource="api" />)

    await login('right')

    expect(await screen.findByText(HOME_MARKER)).toBeInTheDocument()
    expect(stat('확인 필요')).toHaveTextContent('1건')
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe(TOKEN)
  })

  test('비밀번호가 틀리면 안내하고 토큰을 저장하지 않는다', async () => {
    createFakeServer()
    render(<App dataSource="api" />)

    await login('wrong')

    expect(await screen.findByRole('alert')).toHaveTextContent('이메일 또는 비밀번호가 올바르지 않습니다.')
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull()
  })

  test('시도가 너무 많으면 잠시 후 다시 시도하라고 안내한다', async () => {
    createFakeServer()
    render(<App dataSource="api" />)

    await login('limited')

    expect(await screen.findByRole('alert')).toHaveTextContent('시도가 너무 많습니다.')
  })

  test('서버에 연결할 수 없으면 비밀번호 오류와 구분해서 안내한다', async () => {
    createFakeServer().offline = true
    render(<App dataSource="api" />)

    await login('right')

    expect(await screen.findByRole('alert')).toHaveTextContent('서버에 연결할 수 없습니다.')
  })

  test('저장된 토큰이 있으면 바로 홈을 연다', async () => {
    createFakeServer()
    signedIn()

    render(<App dataSource="api" />)

    expect(await screen.findByText(HOME_MARKER)).toBeInTheDocument()
  })

  test('토큰이 만료되었으면 지우고 로그인 화면으로 돌아간다', async () => {
    createFakeServer()
    window.localStorage.setItem(TOKEN_KEY, 'expired-token')

    render(<App dataSource="api" />)

    expect(await screen.findByRole('heading', { name: '점주 로그인' })).toBeInTheDocument()
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull()
  })

  test('로그아웃하면 서버에 알리고 로그인 화면으로 돌아간다', async () => {
    const server = createFakeServer()
    signedIn()
    window.location.hash = '#settings'
    render(<App dataSource="api" />)

    await userEvent.click(await screen.findByRole('button', { name: '로그아웃' }))

    expect(screen.getByRole('heading', { name: '점주 로그인' })).toBeInTheDocument()
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(server.calls).toContainEqual({ method: 'POST', url: '/api/auth/logout' })
  })
})

describe('회원가입', () => {
  async function openSignup() {
    render(<App dataSource="api" />)
    await userEvent.click(screen.getByRole('button', { name: '회원가입' }))
  }

  async function fillForm(overrides: { password?: string; passwordConfirm?: string; email?: string } = {}) {
    const { password = 'test-password', passwordConfirm = password, email = 'new@keeper.test' } = overrides
    await userEvent.type(screen.getByLabelText('매장 이름'), '역삼 무인점')
    await userEvent.type(screen.getByLabelText('이메일'), email)
    await userEvent.type(screen.getByLabelText('비밀번호 (8자 이상)'), password)
    await userEvent.type(screen.getByLabelText('비밀번호 확인'), passwordConfirm)
  }

  async function submit() {
    await userEvent.click(screen.getByRole('button', { name: '가입하기' }))
  }

  test('로그인 화면의 회원가입 버튼으로 가입 화면이 열린다', async () => {
    createFakeServer()

    await openSignup()

    expect(screen.getByRole('heading', { name: '점주 회원가입' })).toBeInTheDocument()
  })

  test('이미 계정이 있으면 로그인 화면으로 돌아갈 수 있다', async () => {
    createFakeServer()
    await openSignup()

    await userEvent.click(screen.getByRole('button', { name: '이미 계정이 있어요' }))

    expect(screen.getByRole('heading', { name: '점주 로그인' })).toBeInTheDocument()
  })

  test('가입하면 기기 키를 보여주고 시작하기를 눌러야 앱으로 들어간다', async () => {
    const server = createFakeServer()
    await openSignup()
    await fillForm()

    await submit()

    expect(await screen.findByText(DEVICE_KEY)).toBeInTheDocument()
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(server.signupBody).toEqual({
      storeName: '역삼 무인점',
      email: 'new@keeper.test',
      password: 'test-password',
    })

    await userEvent.click(screen.getByRole('button', { name: '시작하기' }))

    expect(await screen.findByText(HOME_MARKER)).toBeInTheDocument()
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe(TOKEN)
    expect(screen.queryByText(DEVICE_KEY)).not.toBeInTheDocument()
  })

  test('기기 키를 복사할 수 있다', async () => {
    createFakeServer()
    const writeText = vi.fn(async () => {})
    await openSignup()
    await fillForm()
    await submit()
    await screen.findByText(DEVICE_KEY)
    vi.stubGlobal('navigator', { ...window.navigator, clipboard: { writeText } })

    fireEvent.click(screen.getByRole('button', { name: '기기 키 복사' }))

    expect(await screen.findByRole('status')).toHaveTextContent('복사했습니다.')
    expect(writeText).toHaveBeenCalledWith(DEVICE_KEY)
  })

  test('복사가 막힌 환경에서는 직접 복사하라고 안내한다', async () => {
    createFakeServer()
    await openSignup()
    await fillForm()
    await submit()
    await screen.findByText(DEVICE_KEY)
    vi.stubGlobal('navigator', {
      ...window.navigator,
      clipboard: { writeText: () => Promise.reject(new Error('blocked')) },
    })

    fireEvent.click(screen.getByRole('button', { name: '기기 키 복사' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('직접 선택해 복사')
  })

  test.each([
    ['짧은 비밀번호', { password: 'short' }, '8자 이상'],
    ['다른 비밀번호 확인', { passwordConfirm: 'different-password' }, '서로 다릅니다'],
    ['잘못된 이메일', { email: 'not-an-email' }, '이메일 형식'],
  ])('%s은 서버에 보내지 않고 안내한다', async (_name, overrides, message) => {
    const server = createFakeServer()
    await openSignup()
    await fillForm(overrides)

    await submit()

    expect(screen.getByRole('alert')).toHaveTextContent(message)
    expect(server.calls).toEqual([])
  })

  test.each([
    [409, '이미 가입된 이메일입니다.'],
    [422, '입력한 내용을 확인해 주세요.'],
    [429, '시도가 너무 많습니다.'],
    [500, '서버에 연결할 수 없습니다.'],
  ])('서버가 %i로 거부하면 안내하고 다시 시도할 수 있다', async (status, message) => {
    const server = createFakeServer()
    server.signupStatus = status
    await openSignup()
    await fillForm()

    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('button', { name: '가입하기' })).toBeEnabled()
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull()
  })
})

describe('서버 데이터', () => {
  test('오늘 자정을 기준 시각으로 대시보드를 요청한다', async () => {
    const server = createFakeServer()
    signedIn()

    render(<App dataSource="api" />)
    await screen.findByText(HOME_MARKER)

    expect(server.calls[0].url).toBe('/api/dashboard?since=2026-10-23T00%3A00%3A00%2B09%3A00')
  })

  test('알림을 확인하면 서버에 저장한다', async () => {
    const server = createFakeServer()
    signedIn()
    window.location.hash = '#alerts/e1'
    render(<App dataSource="api" />)

    await userEvent.click(await screen.findByRole('button', { name: '정상 행동' }))

    expect(server.calls).toContainEqual({ method: 'POST', url: '/api/alerts/e1/confirm' })
    expect(server.lastBody).toEqual({ resolution: 'normal' })
    expect(server.alerts.find((alert) => alert.id === 'e1')?.resolution).toBe('normal')
  })

  test('오늘 목록에 없는 알림은 서버에서 상세를 가져온다', async () => {
    const server = createFakeServer()
    server.alerts = []
    signedIn()
    window.location.hash = '#alerts/none'
    render(<App dataSource="api" />)

    expect(await screen.findByText('알림을 찾을 수 없습니다.')).toBeInTheDocument()
    expect(server.calls).toContainEqual({ method: 'GET', url: '/api/alerts/none' })
  })

  test('답변, 매장 이름, 알림 설정을 서버에 저장한다', async () => {
    const server = createFakeServer()
    signedIn()
    window.location.hash = '#inquiries'
    render(<App dataSource="api" />)

    await userEvent.click(await screen.findByRole('button', { name: /결제 후 상품이 나오지 않아요/ }))
    await userEvent.type(screen.getAllByLabelText('고객 문의 답변 입력')[0], '답변입니다{Enter}')
    await screen.findByText('답변을 보냈어요')
    expect(server.calls).toContainEqual({ method: 'POST', url: '/api/inquiries/q1/read' })
    expect(server.calls).toContainEqual({ method: 'POST', url: '/api/inquiries/q1/replies' })
    expect(server.lastBody).toEqual({ body: '답변입니다' })

    window.location.hash = '#settings'
    await userEvent.click(await screen.findByRole('button', { name: /매장 정보/ }))
    await userEvent.type(screen.getByLabelText('매장 이름'), '2호점{Enter}')
    await vi.waitFor(() => expect(server.lastBody).toEqual({ name: `${store.name}2호점` }))
    expect(server.calls).toContainEqual({ method: 'PATCH', url: '/api/store' })

    window.location.hash = '#settings/notifications'
    await userEvent.click(await screen.findByRole('switch', { name: '알림 소리' }))
    await vi.waitFor(() => expect(server.lastBody).toEqual({ ...notificationSettings, sound: false }))
    expect(server.calls).toContainEqual({ method: 'PUT', url: '/api/notification-settings' })

    window.location.hash = '#settings/notices'
    expect(await screen.findByText('등록된 공지사항이 없습니다.')).toBeInTheDocument()
    expect(server.calls).toContainEqual({ method: 'GET', url: '/api/notices' })
  })

  test('저장에 실패하면 버튼을 되돌리고 연결 안내를 보여준다', async () => {
    const server = createFakeServer()
    signedIn()
    window.location.hash = '#alerts/e1'
    render(<App dataSource="api" />)
    const button = await screen.findByRole('button', { name: '확인 완료' })

    server.status = 500
    await userEvent.click(button)

    expect(await screen.findByText(/서버에 연결할 수 없습니다/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '확인 완료' })).toBeEnabled()
  })

  test('리포트는 선택한 기간을 서버에 요청한다', async () => {
    const server = createFakeServer()
    signedIn()
    render(<App dataSource="api" />)
    await screen.findByText(HOME_MARKER)

    await userEvent.click(within(screen.getByRole('navigation')).getByRole('link', { name: '리포트' }))
    await screen.findByText('감지 추이')

    expect(server.calls).toContainEqual({ method: 'GET', url: '/api/alerts?start=2026-10-17&end=2026-10-23' })
  })

  test('처음 연결에 실패하면 안내하고 다시 시도할 수 있다', async () => {
    const server = createFakeServer()
    server.offline = true
    signedIn()
    render(<App dataSource="api" />)

    await userEvent.click(await screen.findByRole('button', { name: '다시 시도' }))
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeInTheDocument()

    server.offline = false
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(await screen.findByText(HOME_MARKER)).toBeInTheDocument()
  })
})

describe('주기적 갱신', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.useFakeTimers({ now: demoNow })
  })

  async function tick(ms: number) {
    await act(() => vi.advanceTimersByTimeAsync(ms))
  }

  test('새 이벤트가 들어오면 10초 안에 화면에 나타난다', async () => {
    const server = createFakeServer()
    signedIn()
    render(<App dataSource="api" />)
    await tick(0)
    expect(stat('확인 필요')).toHaveTextContent('1건')

    server.alerts = [{ ...alerts[1], id: 'new', confirmed: false }, ...server.alerts]
    await tick(10_000)

    expect(stat('확인 필요')).toHaveTextContent('2건')
  })

  test('관리용 앱이 연결되면 다음 갱신 때 연동 대기 안내가 사라진다', async () => {
    const server = createFakeServer()
    server.integration = { status: 'waiting', lastSeenAt: null }
    signedIn()
    render(<App dataSource="api" />)
    await tick(0)
    expect(screen.getByText('연동 대기')).toBeInTheDocument()

    server.integration = onlineIntegration
    await tick(10_000)

    expect(screen.getByText('운영 중')).toBeInTheDocument()
    expect(screen.queryByText(/집계를 시작하지 않았습니다/)).not.toBeInTheDocument()
  })

  test('연결이 끊기면 마지막 내용을 유지하고 복구되면 안내가 사라진다', async () => {
    const server = createFakeServer()
    signedIn()
    render(<App dataSource="api" />)
    await tick(0)

    server.offline = true
    await tick(10_000)

    expect(screen.getByText(/마지막으로 받은 내용/)).toBeInTheDocument()
    expect(stat('확인 필요')).toHaveTextContent('1건')

    server.offline = false
    await tick(10_000)

    expect(screen.queryByText(/마지막으로 받은 내용/)).not.toBeInTheDocument()
  })

  test('새 알림이 오면 화면에 알리고 잠시 뒤 사라진다', async () => {
    const server = createFakeServer()
    signedIn()
    render(<App dataSource="api" />)
    await tick(0)

    server.alerts = [{ ...alerts[1], id: 'new', confirmed: false }, ...server.alerts]
    await tick(10_000)

    expect(screen.getByText('상품 이동 감지', { selector: '.toast' })).toBeInTheDocument()

    await tick(2_500)

    expect(screen.queryByText('상품 이동 감지', { selector: '.toast' })).not.toBeInTheDocument()
  })

  test('새 소식이 여러 건이면 건수로 묶어 알린다', async () => {
    const server = createFakeServer()
    signedIn()
    render(<App dataSource="api" />)
    await tick(0)

    server.alerts = [
      { ...alerts[1], id: 'new-1', confirmed: false },
      { ...alerts[1], id: 'new-2', confirmed: false },
      ...server.alerts,
    ]
    await tick(10_000)

    expect(screen.getByText('새 소식 2건이 있어요')).toBeInTheDocument()
  })

  test('처음 열 때 있던 알림은 새 소식으로 알리지 않는다', async () => {
    createFakeServer()
    signedIn()
    const { container } = render(<App dataSource="api" />)
    await tick(0)
    await tick(10_000)

    expect(container.querySelector('.toast')).toBeEmptyDOMElement()
  })

  test('화면이 사라지면 갱신을 멈춘다', async () => {
    const server = createFakeServer()
    signedIn()
    const { unmount } = render(<App dataSource="api" />)
    await tick(0)

    unmount()
    const before = server.calls.length
    await tick(30_000)

    expect(server.calls).toHaveLength(before)
  })
})

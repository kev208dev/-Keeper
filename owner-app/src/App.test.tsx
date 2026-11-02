import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import App from './App'
import OwnerApp from './OwnerApp'
import { parseRoute } from './tabs'
import { createFixtureApi, demoNow } from './test/fixtures'

const HOME_MARKER = '지금 확인할 알림'

function stat(label: string) {
  return screen.getByText(label).parentElement!
}

async function goTo(tab: string) {
  await userEvent.click(within(screen.getByRole('navigation')).getByRole('link', { name: tab }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test('카메라가 한 대도 없어도 앱이 열리고 CCTV 탭에서 안내가 보인다', async () => {
  render(<OwnerApp api={createFixtureApi({ cameras: [] })} startAt={demoNow} pollMs={0} />)

  await screen.findByText(HOME_MARKER)
  await goTo('CCTV')

  expect(await screen.findByText('관리용 앱에 카메라를 연결하면 여기에 표시됩니다.')).toBeInTheDocument()
})

describe('화면 주소', () => {
  test.each([
    ['', { page: 'home' }],
    ['#home', { page: 'home' }],
    ['#cctv', { page: 'cctv' }],
    ['#alerts', { page: 'alerts' }],
    ['#inquiries', { page: 'inquiries' }],
    ['#report', { page: 'report' }],
    ['#settings', { page: 'settings' }],
    ['#settings/notifications', { page: 'notificationSettings' }],
    ['#settings/notices', { page: 'notices' }],
    ['#alerts/sim-1', { page: 'alertDetail', alertId: 'sim-1' }],
    ['#alerts/a%2Fb', { page: 'alertDetail', alertId: 'a/b' }],
    ['#alerts/%E0%A4%A', { page: 'alerts' }],
    ['#unknown', { page: 'home' }],
  ])('%s', (hash, route) => {
    expect(parseRoute(hash)).toEqual(route)
  })
})

describe('서버 없이 화면만 볼 때', () => {
  test('모든 숫자가 0이고 집계 전이라고 안내한다', async () => {
    render(<App dataSource="preview" />)

    await screen.findByText(HOME_MARKER)

    expect(stat('감지 이벤트')).toHaveTextContent('0건')
    expect(stat('확인 필요')).toHaveTextContent('0건')
    expect(stat('연결 상태')).toHaveTextContent('0대')
    expect(screen.getByText('집계를 시작하지 않았습니다', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('연동 대기')).toBeInTheDocument()
    expect(screen.getByText('아직 집계된 활동이 없습니다.')).toBeInTheDocument()
  })

  test('다른 탭에도 지어낸 데이터가 없다', async () => {
    render(<App dataSource="preview" />)
    await screen.findByText(HOME_MARKER)

    await goTo('CCTV')
    expect(await screen.findByText('등록된 카메라가 없습니다.')).toBeInTheDocument()
    expect(screen.getByText('오늘 감지된 클립이 없습니다.')).toBeInTheDocument()

    await goTo('알림')
    expect(await screen.findByText('아직 집계된 알림이 없습니다.')).toBeInTheDocument()

    await goTo('문의')
    expect(await screen.findByText('아직 접수된 문의가 없습니다.')).toBeInTheDocument()

    await goTo('리포트')
    expect(await screen.findByText('아직 집계된 이벤트가 없습니다.')).toBeInTheDocument()
    expect(screen.getByText('이 기간에 기록된 감지가 없습니다.')).toBeInTheDocument()
  })

  test('설정의 저장은 화면에 반영되고 공지사항은 비어 있다', async () => {
    window.location.hash = '#settings/notifications'
    render(<App dataSource="preview" />)

    await userEvent.click(await screen.findByRole('switch', { name: '알림 소리' }))
    expect(screen.getByRole('switch', { name: '알림 소리' })).not.toBeChecked()

    window.location.hash = '#settings/notices'

    expect(await screen.findByText('등록된 공지사항이 없습니다.')).toBeInTheDocument()
  })

  test('없는 알림 주소를 열어도 안내만 보여준다', async () => {
    window.location.hash = '#alerts/none'
    render(<App dataSource="preview" />)

    expect(await screen.findByText('알림을 찾을 수 없습니다.')).toBeInTheDocument()
  })

  test('안내 띠는 모든 탭에서 유지된다', async () => {
    render(<App dataSource="preview" />)
    await screen.findByText(HOME_MARKER)

    await goTo('알림')
    await screen.findByText('아직 집계된 알림이 없습니다.')

    expect(screen.getByText('집계를 시작하지 않았습니다', { exact: false })).toBeInTheDocument()
  })
})

describe('관리용 앱 연결 상태', () => {
  test('연결된 매장은 안내 없이 운영 중으로 표시한다', async () => {
    render(<OwnerApp api={createFixtureApi()} startAt={demoNow} pollMs={0} />)

    await screen.findByText(HOME_MARKER)

    expect(screen.getByText('운영 중')).toBeInTheDocument()
    expect(screen.queryByText(/집계/)).not.toBeInTheDocument()
  })

  test('연결이 끊긴 매장은 마지막 수신 시각을 알리고 정상으로 표시하지 않는다', async () => {
    const api = createFixtureApi({
      integration: { status: 'offline', lastSeenAt: '2026-10-23T12:30:00+09:00' },
    })
    render(<OwnerApp api={api} startAt={demoNow} pollMs={0} />)

    await screen.findByText(HOME_MARKER)

    expect(screen.getByText('연결 확인 필요')).toBeInTheDocument()
    expect(screen.queryByText('운영 중')).not.toBeInTheDocument()
    expect(screen.getByText(/마지막 수신\(오후 12:30\) 이후는 집계되지 않았습니다./)).toBeInTheDocument()
  })

  test('서버가 끊기면 서버 안내를 우선한다', async () => {
    const api = createFixtureApi({ integration: { status: 'waiting', lastSeenAt: null } })
    const failing = { ...api, confirmAlert: () => Promise.reject(new Error('down')) }
    window.location.hash = '#alerts/e1'
    render(<OwnerApp api={failing} startAt={demoNow} pollMs={0} />)

    await userEvent.click(await screen.findByRole('button', { name: '확인 완료' }))

    expect(await screen.findByText(/서버에 연결할 수 없습니다/)).toBeInTheDocument()
    expect(screen.getByText('처리하지 못했습니다. 다시 시도해 주세요.')).toBeInTheDocument()
    expect(screen.queryByText(/집계를 시작하지 않았습니다/)).not.toBeInTheDocument()
  })
})

describe('저장 실패 안내', () => {
  test('답변을 보내지 못하면 알려준다', async () => {
    const api = { ...createFixtureApi(), replyInquiry: () => Promise.reject(new Error('down')) }
    window.location.hash = '#inquiries'
    render(<OwnerApp api={api} startAt={demoNow} pollMs={0} />)

    await userEvent.click(await screen.findByRole('button', { name: /결제 후 상품이 나오지 않아요/ }))
    await userEvent.type(screen.getAllByLabelText('고객 문의 답변 입력')[0], '답변{Enter}')

    expect(await screen.findByText('답변을 보내지 못했습니다. 다시 시도해 주세요.')).toBeInTheDocument()
  })

  test('설정을 저장하지 못하면 알리고 스위치를 되돌린다', async () => {
    const api = { ...createFixtureApi(), updateNotificationSettings: () => Promise.reject(new Error('down')) }
    window.location.hash = '#settings/notifications'
    render(<OwnerApp api={api} startAt={demoNow} pollMs={0} />)

    await userEvent.click(await screen.findByRole('switch', { name: '알림 소리' }))

    expect(await screen.findByText('설정을 저장하지 못했습니다.')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: '알림 소리' })).toBeChecked()
  })
})

describe('푸시 알림 권한', () => {
  function stubNotification(permission: string, answer = permission) {
    const requestPermission = vi.fn(async () => answer)
    vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission, requestPermission }))
    return requestPermission
  }

  async function turnOnPush() {
    window.location.hash = '#settings/notifications'
    render(<OwnerApp api={createFixtureApi()} startAt={demoNow} pollMs={0} />)
    await userEvent.click(await screen.findByRole('switch', { name: '푸시 알림' }))
  }

  test('허용하면 켜진다', async () => {
    const requestPermission = stubNotification('default', 'granted')

    await turnOnPush()

    expect(requestPermission).toHaveBeenCalled()
    await vi.waitFor(() => expect(screen.getByRole('switch', { name: '푸시 알림' })).toBeChecked())
  })

  test('이미 허용했으면 다시 묻지 않는다', async () => {
    const requestPermission = stubNotification('granted')

    await turnOnPush()

    expect(requestPermission).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(screen.getByRole('switch', { name: '푸시 알림' })).toBeChecked())
  })

  test('거부하면 켜지 않고 안내한다', async () => {
    stubNotification('default', 'denied')

    await turnOnPush()

    expect(await screen.findByText('브라우저에서 알림을 허용해야 받을 수 있어요')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: '푸시 알림' })).not.toBeChecked()
  })

  test('알림을 지원하지 않는 브라우저에서는 켜지 않는다', async () => {
    vi.stubGlobal('Notification', undefined)

    await turnOnPush()

    expect(await screen.findByText('브라우저에서 알림을 허용해야 받을 수 있어요')).toBeInTheDocument()
  })

  test('끌 때는 권한을 묻지 않는다', async () => {
    const requestPermission = stubNotification('default')
    const api = createFixtureApi({
      notificationSettings: { push: true, alert: true, door: true, inquiry: true, camera: true, sound: true },
    })
    window.location.hash = '#settings/notifications'
    render(<OwnerApp api={api} startAt={demoNow} pollMs={0} />)

    await userEvent.click(await screen.findByRole('switch', { name: '푸시 알림' }))

    expect(requestPermission).not.toHaveBeenCalled()
  })
})

test('앱 코드는 테스트용 예시 데이터를 가져다 쓰지 않는다', () => {
  const files = import.meta.glob<string>('./**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })
  const appFiles = Object.entries(files).filter(([path]) => !path.includes('.test.') && !path.startsWith('./test/'))

  expect(appFiles.length).toBeGreaterThan(10)
  for (const [path, source] of appFiles) {
    expect(source, path).not.toContain('test/fixtures')
  }
})

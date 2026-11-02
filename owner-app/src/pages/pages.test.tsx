import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import type { AlertItem } from '../domain/types'
import { alerts, cameras, clips, demoNow, inquiries, notices, notificationSettings, onlineIntegration, store } from '../test/fixtures'
import AlertDetailPage from './AlertDetailPage'
import AlertsPage from './AlertsPage'
import CctvPage from './CctvPage'
import HomePage from './HomePage'
import InquiriesPage from './InquiriesPage'
import NoticesPage from './NoticesPage'
import NotificationSettingsPage from './NotificationSettingsPage'
import ReportPage from './ReportPage'
import SettingsPage from './SettingsPage'

function stat(label: string) {
  return screen.getByText(label).parentElement!
}

describe('홈', () => {
  function renderHome(props: Partial<Parameters<typeof HomePage>[0]> = {}) {
    render(
      <HomePage
        store={store}
        integration={onlineIntegration}
        cameras={cameras}
        alerts={alerts}
        inquiries={inquiries}
        now={demoNow}
        {...props}
      />,
    )
  }

  test('서버 데이터로 계산한 숫자를 보여준다', () => {
    renderHome()

    expect(stat('감지 이벤트')).toHaveTextContent('3건')
    expect(stat('확인 필요')).toHaveTextContent('1건')
    expect(stat('연결 상태')).toHaveTextContent('3대')
    expect(screen.getByText('접수된 문의 2건')).toBeInTheDocument()
    expect(screen.getByText('연결된 카메라 3대')).toBeInTheDocument()
    expect(screen.getByText('카메라 3대 연결 · 최근 감지 오후 2:42')).toBeInTheDocument()
  })

  test('날짜, 매장 이름, 운영 상태를 보여준다', () => {
    renderHome()

    expect(screen.getByText('10월 23일 금요일 · 매장 현황')).toBeInTheDocument()
    expect(screen.getByText(store.name)).toBeInTheDocument()
    expect(screen.getByText('운영 중')).toBeInTheDocument()
  })

  test('최근 감지는 최신순으로 다섯 건이고 누르면 상세로 간다', () => {
    renderHome()

    const links = screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('#alerts/'))

    expect(links).toHaveLength(5)
    expect(links[0]).toHaveAttribute('href', '#alerts/e1')
    expect(links[0]).toHaveTextContent('냉장고 문 장시간 개방')
    expect(links[0]).toHaveTextContent('냉동고 구역 · 카메라 03 · 오후 2:42 · 확인 필요')
  })

  test('이벤트가 없으면 0건과 빈 상태를 보여준다', () => {
    renderHome({ alerts: [], inquiries: [], cameras: [] })

    expect(stat('감지 이벤트')).toHaveTextContent('0건')
    expect(stat('연결 상태')).toHaveTextContent('0대')
    expect(screen.getByText('아직 집계된 활동이 없습니다.')).toBeInTheDocument()
    expect(screen.getByText('등록된 카메라가 없습니다.')).toBeInTheDocument()
  })

  test('첫 번째 카메라를 영상이 아니라고 밝히며 보여준다', () => {
    renderHome()

    expect(screen.getByRole('link', { name: '카메라 화면 열기' })).toHaveTextContent('매장 입구')
    expect(screen.getByText('영상 연결 전')).toBeInTheDocument()
  })

  test('매장 선택을 누르면 연결된 매장을 안내하고 닫을 수 있다', async () => {
    renderHome()

    await userEvent.click(screen.getByRole('button', { name: '매장 선택' }))
    expect(screen.getByRole('dialog')).toHaveTextContent(`연결된 매장은 ${store.name} 1곳입니다.`)

    await userEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('CCTV', () => {
  function renderCctv(props: Partial<Parameters<typeof CctvPage>[0]> = {}) {
    const onSelectCamera = vi.fn()
    render(<CctvPage cameras={cameras} clips={[]} cameraId={null} onSelectCamera={onSelectCamera} {...props} />)
    return onSelectCamera
  }

  test('첫 번째 카메라를 기본으로 선택한다', () => {
    renderCctv()

    expect(screen.getByRole('button', { name: /매장 입구/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('카메라 3대가 연결되어 있습니다.')).toBeInTheDocument()
  })

  test('카메라를 고르면 알려주고 고른 카메라를 표시한다', async () => {
    const onSelectCamera = renderCctv({ cameraId: 'cam-02' })

    expect(screen.getByRole('button', { name: /상품 진열대/ })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: /냉동고 구역/ }))
    expect(onSelectCamera).toHaveBeenCalledWith('cam-03')
  })

  test('끊긴 카메라는 끊겼다고 표시한다', () => {
    const list = [{ ...cameras[0], status: 'disconnected' as const }, cameras[1]]
    renderCctv({ cameras: list })

    expect(screen.getByText('연결 끊김')).toBeInTheDocument()
    expect(screen.getByText('끊김')).toBeInTheDocument()
    expect(screen.getByText('카메라 2대 중 1대가 연결되어 있습니다.')).toBeInTheDocument()
  })

  test('카메라가 없으면 안내만 보여준다', () => {
    renderCctv({ cameras: [] })

    expect(screen.getByText('등록된 카메라가 없습니다.')).toBeInTheDocument()
    expect(screen.getByText('관리용 앱에 카메라를 연결하면 여기에 표시됩니다.')).toBeInTheDocument()
  })

  test('오늘의 클립을 누르면 알림 상세로 간다', () => {
    renderCctv({
      clips: [
        {
          id: 'c1',
          alertId: 'e1',
          kind: 'duration',
          title: '냉장고 문 장시간 개방',
          time: '오후 2:42',
          cameraId: 'cam-03',
          duration: '00:22',
        },
      ],
    })

    expect(screen.getByRole('link', { name: /냉장고 문 장시간 개방/ })).toHaveAttribute('href', '#alerts/e1')
  })

  test('클립이 없으면 없다고 말한다', () => {
    renderCctv()

    expect(screen.getByText('오늘 감지된 클립이 없습니다.')).toBeInTheDocument()
  })

  test('카메라 관리 정보를 볼 수 있다', async () => {
    renderCctv()

    await userEvent.click(screen.getByRole('button', { name: '카메라 관리 정보 보기' }))

    expect(screen.getByRole('dialog')).toHaveTextContent('전체 3대 중 3대가 연결되어 있습니다.')
  })
})

describe('알림 목록', () => {
  function renderAlerts(items: AlertItem[] = alerts) {
    render(<AlertsPage alerts={items} cameras={cameras} now={demoNow} />)
  }

  test('오늘 알림을 날짜 제목과 함께 보여주고 지난 확인 알림은 뺀다', () => {
    renderAlerts()

    expect(screen.getByText('오늘 · 10월 23일')).toBeInTheDocument()
    expect(screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('#alerts/'))).toHaveLength(3)
  })

  test('각 알림을 누르면 상세로 간다', () => {
    renderAlerts()

    expect(screen.getByRole('link', { name: /상품 이동 감지/ })).toHaveAttribute('href', '#alerts/e2')
  })

  test('필터로 확인 상태별로 볼 수 있다', async () => {
    renderAlerts()

    await userEvent.click(screen.getByRole('button', { name: '확인 필요' }))
    expect(screen.queryByText('상품 이동 감지')).not.toBeInTheDocument()
    expect(screen.getByText('냉장고 문 장시간 개방')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '확인 완료' }))
    expect(screen.getByText('상품 이동 감지')).toBeInTheDocument()
    expect(screen.queryByText('냉장고 문 장시간 개방')).not.toBeInTheDocument()
  })

  test('알림이 하나도 없으면 집계 전이라고 말한다', () => {
    renderAlerts([])

    expect(screen.getByText('아직 집계된 알림이 없습니다.')).toBeInTheDocument()
  })

  test('필터 결과만 비어 있으면 다르게 말한다', async () => {
    renderAlerts([alerts[0]])

    await userEvent.click(screen.getByRole('button', { name: '확인 완료' }))

    expect(screen.getByText('해당하는 알림이 없습니다.')).toBeInTheDocument()
  })

  test('알림 설정으로 갈 수 있다', () => {
    renderAlerts()

    expect(screen.getByRole('link', { name: '알림 설정' })).toHaveAttribute('href', '#settings/notifications')
  })
})

describe('알림 상세', () => {
  function renderDetail(props: Partial<Parameters<typeof AlertDetailPage>[0]> = {}) {
    const handlers = { onResolve: vi.fn(), loadAlert: vi.fn(() => Promise.reject(new Error('none'))) }
    render(
      <AlertDetailPage
        alertId="e2"
        alerts={alerts}
        clips={clips}
        cameras={cameras}
        now={demoNow}
        revision={0}
        {...handlers}
        {...props}
      />,
    )
    return handlers
  }

  test('감지 정보와 안내를 보여준다', () => {
    renderDetail()

    expect(screen.getByRole('heading', { name: '상품 이동 감지' })).toBeInTheDocument()
    expect(screen.getByText('입구 진열대 → 냉동고 구역')).toBeInTheDocument()
    expect(screen.getByText('미결제')).toBeInTheDocument()
    expect(screen.getByText('감지 클립 00:14')).toBeInTheDocument()
    expect(screen.getByText(/단정할 수는 없습니다/)).toBeInTheDocument()
  })

  test('확인 전 알림은 두 가지로 처리할 수 있다', async () => {
    const { onResolve } = renderDetail({ alertId: 'e1' })

    await userEvent.click(screen.getByRole('button', { name: '정상 행동' }))
    await userEvent.click(screen.getByRole('button', { name: '확인 완료' }))

    expect(onResolve.mock.calls).toEqual([
      ['e1', 'normal'],
      ['e1', 'confirmed'],
    ])
  })

  test('처리한 알림은 다시 처리할 수 없다', () => {
    renderDetail()

    expect(screen.getByRole('button', { name: '정상 행동' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '처리 완료' })).toBeDisabled()
  })

  test('문 개방 알림은 경과를 막대로 보여준다', () => {
    renderDetail({ alertId: 'e1' })

    expect(screen.getByRole('progressbar', { name: '문 개방 시간' })).toHaveAttribute('aria-valuenow', '80')
  })

  test('결제가 확인된 상품 이동은 영상을 보여주지 않는다', () => {
    const paid = { ...alerts[1], unpaid: false } as AlertItem
    renderDetail({ alerts: [paid] })

    expect(screen.queryByText('영상 연결 전')).not.toBeInTheDocument()
  })

  test('클립이 없으면 없다고 말한다', () => {
    renderDetail({ clips: [] })

    expect(screen.getByText('감지 클립이 아직 없습니다')).toBeInTheDocument()
  })

  test('사라진 카메라의 알림도 열린다', () => {
    renderDetail({ cameras: [] })

    expect(screen.getByRole('heading', { name: '상품 이동 감지' })).toBeInTheDocument()
    expect(screen.getByText('연결 끊김')).toBeInTheDocument()
  })

  test('오늘 목록에 없는 지난 알림은 서버에서 불러온다', async () => {
    const loadAlert = vi.fn(async () => ({ alert: alerts[3], clip: null }))
    renderDetail({ alertId: alerts[3].id, alerts: [], loadAlert })

    expect(screen.getByText('불러오는 중입니다.')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: alerts[3].title })).toBeInTheDocument()
    expect(loadAlert).toHaveBeenCalledWith(alerts[3].id)
  })

  test('없는 알림은 찾을 수 없다고 말한다', async () => {
    renderDetail({ alertId: 'none', alerts: [] })

    expect(await screen.findByText('알림을 찾을 수 없습니다.')).toBeInTheDocument()
  })

  test('화면을 떠난 뒤 도착한 응답은 무시한다', async () => {
    let finish: (value: { alert: AlertItem; clip: null }) => void = () => {}
    const loadAlert = () => new Promise<{ alert: AlertItem; clip: null }>((resolve) => (finish = resolve))
    const { unmount } = render(
      <AlertDetailPage
        alertId={alerts[3].id}
        alerts={[]}
        clips={[]}
        cameras={cameras}
        now={demoNow}
        revision={0}
        loadAlert={loadAlert}
        onResolve={vi.fn()}
      />,
    )

    unmount()
    await act(async () => finish({ alert: alerts[3], clip: null }))

    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })
})

describe('고객 문의', () => {
  function renderInquiries(props: Partial<Parameters<typeof InquiriesPage>[0]> = {}) {
    const handlers = { onRead: vi.fn(), onReply: vi.fn(async () => true) }
    render(<InquiriesPage inquiries={inquiries} now={demoNow} {...handlers} {...props} />)
    return handlers
  }

  function trigger(name: string | RegExp) {
    return screen.getByRole('button', { name })
  }

  test('문의 수와 확인이 필요한 수를 보여준다', () => {
    renderInquiries()

    expect(screen.getByText(/최근 접수된 문의 2건/)).toHaveTextContent('· 확인 필요 1건')
  })

  test('문의가 없으면 없다고 말한다', () => {
    renderInquiries({ inquiries: [] })

    expect(screen.getByText('아직 접수된 문의가 없습니다.')).toBeInTheDocument()
  })

  test('누르면 대화가 펼쳐지고 읽음 처리한다', async () => {
    const { onRead } = renderInquiries()

    await userEvent.click(trigger(/결제 후 상품이 나오지 않아요/))

    expect(trigger(/결제 후 상품이 나오지 않아요/)).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('AI 상담에서 해결되지 않아 점주에게 전달됨')).toBeInTheDocument()
    expect(screen.getAllByText('고객')[0]).toBeInTheDocument()
    expect(onRead).toHaveBeenCalledWith('q1')
  })

  test('다시 누르면 접힌다', async () => {
    renderInquiries()

    await userEvent.click(trigger(/결제 후 상품이 나오지 않아요/))
    await userEvent.click(trigger(/결제 후 상품이 나오지 않아요/))

    expect(trigger(/결제 후 상품이 나오지 않아요/)).toHaveAttribute('aria-expanded', 'false')
  })

  test('이미 읽은 문의는 다시 읽음 처리하지 않는다', async () => {
    const { onRead } = renderInquiries({ inquiries: [{ ...inquiries[0], read: true }] })

    await userEvent.click(trigger(/결제 후 상품이 나오지 않아요/))

    expect(onRead).not.toHaveBeenCalled()
  })

  test('답변을 보내면 입력칸을 비운다', async () => {
    const { onReply } = renderInquiries()
    await userEvent.click(trigger(/결제 후 상품이 나오지 않아요/))
    const panel = screen.getByRole('region', { name: /결제 후 상품이 나오지 않아요/ })
    const input = within(panel).getByLabelText('고객 문의 답변 입력')

    await userEvent.type(input, '  환불해 드릴게요  ')
    await userEvent.click(within(panel).getByRole('button', { name: '답변 보내기' }))

    expect(onReply).toHaveBeenCalledWith('q1', '환불해 드릴게요')
    await waitFor(() => expect(input).toHaveValue(''))
  })

  test('전송에 실패하면 입력한 내용을 남긴다', async () => {
    renderInquiries({ onReply: vi.fn(async () => false) })
    await userEvent.click(trigger(/결제 후 상품이 나오지 않아요/))
    const panel = screen.getByRole('region', { name: /결제 후 상품이 나오지 않아요/ })
    const input = within(panel).getByLabelText('고객 문의 답변 입력')

    await userEvent.type(input, '환불해 드릴게요{Enter}')

    await waitFor(() => expect(within(panel).getByRole('button', { name: '답변 보내기' })).toBeEnabled())
    expect(input).toHaveValue('환불해 드릴게요')
  })

  test('빈 답변은 보내지 않는다', async () => {
    const { onReply } = renderInquiries()
    await userEvent.click(trigger(/결제 후 상품이 나오지 않아요/))
    const panel = screen.getByRole('region', { name: /결제 후 상품이 나오지 않아요/ })

    await userEvent.click(within(panel).getByRole('button', { name: '답변 보내기' }))

    expect(onReply).not.toHaveBeenCalled()
  })

  test('보낸 답변과 전달 상태를 보여준다', () => {
    const replies = [
      { id: 'r1', body: '확인 중입니다', sentAt: '2026-10-23T14:10:00+09:00', delivered: true },
      { id: 'r2', body: '환불했습니다', sentAt: '2026-10-23T14:20:00+09:00', delivered: false },
    ]
    renderInquiries({ inquiries: [{ ...inquiries[0], replies }] })

    expect(screen.getByText('점주 · 오후 2:10 · 키오스크 전달 완료')).toBeInTheDocument()
    expect(screen.getByText('점주 · 오후 2:20 · 전달 대기')).toBeInTheDocument()
    expect(screen.getByText('답변 완료')).toBeInTheDocument()
  })
})

describe('리포트', () => {
  function renderReport(props: Partial<Parameters<typeof ReportPage>[0]> = {}) {
    const loadAlerts = vi.fn(async () => alerts)
    render(<ReportPage loadAlerts={loadAlerts} cameras={cameras} revision={0} now={demoNow} {...props} />)
    return loadAlerts
  }

  test('처음에는 최근 7일을 불러와 집계한다', async () => {
    const loadAlerts = renderReport()

    expect(await screen.findByText('최근 7일 감지 기록')).toBeInTheDocument()
    expect(loadAlerts).toHaveBeenCalledWith({ start: '2026-10-17', end: '2026-10-23' })
    expect(screen.getByText('확인 완료').parentElement).toHaveTextContent('11')
    expect(screen.getByText('확인 필요').parentElement).toHaveTextContent('1')
  })

  test('기간을 바꾸면 그 기간을 다시 불러온다', async () => {
    const loadAlerts = renderReport()
    await screen.findByText('최근 7일 감지 기록')

    await userEvent.click(screen.getByRole('button', { name: '오늘' }))
    expect(await screen.findByText('오늘 감지 기록')).toBeInTheDocument()
    expect(loadAlerts).toHaveBeenLastCalledWith({ start: '2026-10-23', end: '2026-10-23' })

    await userEvent.click(screen.getByRole('button', { name: '30일' }))
    expect(await screen.findByText('최근 30일 감지 기록')).toBeInTheDocument()
    expect(loadAlerts).toHaveBeenLastCalledWith({ start: '2026-09-24', end: '2026-10-23' })
  })

  test('추이의 막대는 건수를 기간 단위로 보여준다', async () => {
    renderReport()
    const chart = await screen.findByRole('list', { name: '기간별 감지 건수' })

    expect(within(chart).getAllByRole('listitem')).toHaveLength(7)
    expect(chart).toHaveTextContent('금')
  })

  test('주요 기록은 최신순 여섯 건이고 상세로 연결된다', async () => {
    renderReport()
    await screen.findByText('최근 7일 감지 기록')

    const links = screen.getAllByRole('link')

    expect(links).toHaveLength(6)
    expect(links[0]).toHaveAttribute('href', '#alerts/e1')
  })

  test('이벤트가 없으면 비어 있다고 말한다', async () => {
    renderReport({ loadAlerts: async () => [] })

    expect(await screen.findByText('아직 집계된 이벤트가 없습니다.')).toBeInTheDocument()
    expect(screen.getByText('이 기간에 기록된 감지가 없습니다.')).toBeInTheDocument()
  })

  test('불러오기 실패를 알리고 다시 시도할 수 있다', async () => {
    const loadAlerts = vi.fn(async () => alerts).mockRejectedValueOnce(new Error('down'))
    renderReport({ loadAlerts })

    await userEvent.click(await screen.findByRole('button', { name: '다시 시도' }))

    expect(await screen.findByText('최근 7일 감지 기록')).toBeInTheDocument()
    expect(screen.queryByText('리포트를 불러오지 못했습니다.')).not.toBeInTheDocument()
  })

  test('먼저 고른 기간의 늦은 응답이 나중 결과를 덮어쓰지 않는다', async () => {
    let finishWeek: (value: AlertItem[]) => void = () => {}
    const loadAlerts = vi.fn((period: { start: string }) =>
      period.start === '2026-10-23' ? Promise.resolve([]) : new Promise<AlertItem[]>((resolve) => (finishWeek = resolve)),
    )
    renderReport({ loadAlerts })

    await userEvent.click(screen.getByRole('button', { name: '오늘' }))
    await screen.findByText('오늘 감지 기록')
    await act(async () => finishWeek(alerts))

    expect(screen.getByText('오늘 감지 기록')).toBeInTheDocument()
  })

  test('늦게 도착한 실패도 나중 결과에 영향을 주지 않는다', async () => {
    let failWeek: (reason: Error) => void = () => {}
    const loadAlerts = vi.fn((period: { start: string }) =>
      period.start === '2026-10-23' ? Promise.resolve([]) : new Promise<AlertItem[]>((_, reject) => (failWeek = reject)),
    )
    renderReport({ loadAlerts })

    await userEvent.click(screen.getByRole('button', { name: '오늘' }))
    await screen.findByText('오늘 감지 기록')
    await act(async () => failWeek(new Error('down')))

    expect(screen.queryByText('리포트를 불러오지 못했습니다.')).not.toBeInTheDocument()
  })
})

describe('설정', () => {
  function renderSettings(props: Partial<Parameters<typeof SettingsPage>[0]> = {}) {
    const handlers = { onRename: vi.fn(async () => true), onLogout: vi.fn() }
    render(<SettingsPage store={store} integration={onlineIntegration} cameras={cameras} {...handlers} {...props} />)
    return handlers
  }

  test('매장 이름과 연결 상태를 보여준다', () => {
    renderSettings()

    expect(screen.getByText(store.name)).toBeInTheDocument()
    expect(screen.getByText('운영 중')).toBeInTheDocument()
    expect(screen.getByText('카메라 3대 연결됨')).toBeInTheDocument()
  })

  test('연동 전에는 정상으로 표시하지 않는다', () => {
    renderSettings({ integration: { status: 'waiting', lastSeenAt: null }, cameras: [] })

    expect(screen.getByText('연동 대기')).toBeInTheDocument()
    expect(screen.getByText('연결된 카메라 없음')).toBeInTheDocument()
  })

  test('알림 설정과 공지사항으로 갈 수 있다', () => {
    renderSettings()

    expect(screen.getByRole('link', { name: /알림 설정/ })).toHaveAttribute('href', '#settings/notifications')
    expect(screen.getByRole('link', { name: /공지사항/ })).toHaveAttribute('href', '#settings/notices')
  })

  test('매장 이름을 바꾸면 저장하고 창을 닫는다', async () => {
    const { onRename } = renderSettings()

    await userEvent.click(screen.getByRole('button', { name: /매장 정보/ }))
    const input = screen.getByLabelText('매장 이름')
    await userEvent.clear(input)
    await userEvent.type(input, ' 새 매장 ')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(onRename).toHaveBeenCalledWith('새 매장')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  test('저장에 실패하면 창을 닫지 않고 다시 시도할 수 있다', async () => {
    renderSettings({ onRename: vi.fn(async () => false) })

    await userEvent.click(screen.getByRole('button', { name: /매장 정보/ }))
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).toBeEnabled())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  test('이름을 비우면 저장할 수 없다', async () => {
    const { onRename } = renderSettings()

    await userEvent.click(screen.getByRole('button', { name: /매장 정보/ }))
    await userEvent.clear(screen.getByLabelText('매장 이름'))
    await userEvent.type(screen.getByLabelText('매장 이름'), '{Enter}')

    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
    expect(onRename).not.toHaveBeenCalled()
  })

  test('카메라 연결 현황을 볼 수 있다', async () => {
    renderSettings()

    await userEvent.click(screen.getByRole('button', { name: /카메라 연결/ }))

    expect(screen.getByRole('dialog')).toHaveTextContent('전체 3대 중 3대가 연결되어 있습니다.')
  })

  test.each([
    [/서비스 도움말/, '문의 탭에서 답변하면'],
    [/개인정보 및 보안/, '원문을 저장하지 않습니다'],
  ])('%s 안내를 보여준다', async (name, text) => {
    renderSettings()

    await userEvent.click(screen.getByRole('button', { name }))

    expect(screen.getByRole('dialog')).toHaveTextContent(text)
  })

  test('창 바깥을 누르면 닫힌다', async () => {
    renderSettings()

    await userEvent.click(screen.getByRole('button', { name: /서비스 도움말/ }))
    await userEvent.click(screen.getByRole('dialog').parentElement!)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('창 안쪽을 눌러도 닫히지 않는다', async () => {
    renderSettings()

    await userEvent.click(screen.getByRole('button', { name: /서비스 도움말/ }))
    await userEvent.click(screen.getByRole('dialog'))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  test('로그아웃할 수 있다', async () => {
    const { onLogout } = renderSettings()

    await userEvent.click(screen.getByRole('button', { name: '로그아웃' }))

    expect(onLogout).toHaveBeenCalled()
  })

  test('서버 없는 화면에는 로그아웃이 없다', () => {
    renderSettings({ onLogout: undefined })

    expect(screen.queryByRole('button', { name: '로그아웃' })).not.toBeInTheDocument()
  })
})

describe('알림 설정', () => {
  test('현재 설정을 보여준다', () => {
    render(<NotificationSettingsPage settings={notificationSettings} onChange={vi.fn()} />)

    expect(screen.getByRole('switch', { name: '푸시 알림' })).not.toBeChecked()
    expect(screen.getByRole('switch', { name: '이상 행동 감지' })).toBeChecked()
    expect(screen.getAllByRole('switch')).toHaveLength(6)
  })

  test('스위치를 누르면 반대 값으로 바꾸라고 알려준다', async () => {
    const onChange = vi.fn()
    render(<NotificationSettingsPage settings={notificationSettings} onChange={onChange} />)

    await userEvent.click(screen.getByRole('switch', { name: '고객 문의' }))
    await userEvent.click(screen.getByRole('switch', { name: '푸시 알림' }))

    expect(onChange.mock.calls).toEqual([
      ['inquiry', false],
      ['push', true],
    ])
  })
})

describe('공지사항', () => {
  test('공지를 불러와 날짜와 함께 보여준다', async () => {
    render(<NoticesPage loadNotices={async () => notices} />)

    expect(screen.getByText('불러오는 중입니다.')).toBeInTheDocument()
    expect(await screen.findByText('점주 앱 화면 개편 안내')).toBeInTheDocument()
    expect(screen.getByText('2026.10.20')).toBeInTheDocument()
    expect(screen.getByText('새벽 2시에 점검합니다.')).toBeInTheDocument()
  })

  test('공지가 없으면 없다고 말한다', async () => {
    render(<NoticesPage loadNotices={async () => []} />)

    expect(await screen.findByText('등록된 공지사항이 없습니다.')).toBeInTheDocument()
  })

  test('불러오지 못하면 알려준다', async () => {
    render(<NoticesPage loadNotices={() => Promise.reject(new Error('down'))} />)

    expect(await screen.findByText('공지사항을 불러오지 못했습니다.')).toBeInTheDocument()
  })

  test('화면을 떠난 뒤 도착한 응답은 무시한다', async () => {
    let finish: (value: typeof notices) => void = () => {}
    let fail: (reason: Error) => void = () => {}
    const first = render(<NoticesPage loadNotices={() => new Promise((resolve) => (finish = resolve))} />)
    const second = render(<NoticesPage loadNotices={() => new Promise((_, reject) => (fail = reject))} />)

    first.unmount()
    second.unmount()
    await act(async () => {
      finish(notices)
      fail(new Error('down'))
    })

    expect(screen.queryByText('점주 앱 화면 개편 안내')).not.toBeInTheDocument()
  })
})

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import type { AlertItem, Inquiry } from '../domain/types'
import { alerts, clips, demoNow, inquiries, onlineIntegration, store } from '../test/fixtures'
import AlertsPage from './AlertsPage'
import HomePage from './HomePage'
import InquiriesPage from './InquiriesPage'
import ReportPage from './ReportPage'

function statValue(label: string) {
  return within(screen.getByText(label).parentElement!).getByRole('strong')
}

function renderAlerts(items: AlertItem[] = alerts) {
  const handlers = { onConfirm: vi.fn(), onOpenClip: vi.fn() }
  render(<AlertsPage alerts={items} clips={clips} now={demoNow} {...handlers} />)
  return handlers
}

describe('홈', () => {
  function renderHome(props: Partial<Parameters<typeof HomePage>[0]> = {}) {
    render(
      <HomePage
        store={store}
        integration={onlineIntegration}
        alerts={alerts}
        inquiries={inquiries}
        now={demoNow}
        {...props}
      />,
    )
  }

  test('예시 데이터로 계산한 숫자를 보여준다', () => {
    renderHome()

    expect(statValue('오늘 감지')).toHaveTextContent('03건')
    expect(statValue('미확인 알림')).toHaveTextContent('01건')
    expect(statValue('고객 문의')).toHaveTextContent('01건')
    expect(screen.getByText('미확인 이벤트 1건이 있습니다.')).toBeInTheDocument()
  })

  test('최근 활동에 알림만 최신순으로 나온다', () => {
    renderHome()

    const items = within(screen.getByRole('list')).getAllByRole('listitem')

    expect(items.map((item) => item.querySelector('strong')?.textContent)).toEqual([
      '냉장고 문 장시간 개방',
      '상품 이동 감지',
      '상품 훼손 의심',
    ])
  })

  test('연동됐는데 이벤트가 없으면 0건과 확인할 것이 없다는 안내를 보여준다', () => {
    renderHome({ alerts: [], inquiries: [] })

    expect(statValue('오늘 감지')).toHaveTextContent('00건')
    expect(screen.getByText('미확인 이벤트가 없습니다.')).toBeInTheDocument()
    expect(screen.getByText('아직 집계된 활동이 없습니다.')).toBeInTheDocument()
  })

  test('서버 연결이 없으면 로그아웃 버튼을 보여주지 않는다', () => {
    renderHome()

    expect(screen.queryByRole('button', { name: '로그아웃' })).not.toBeInTheDocument()
  })

  test('서버에서 받은 매장 이름을 보여준다', () => {
    renderHome({ store: { name: '역삼 무인점' } })

    expect(screen.getByRole('heading', { name: '역삼 무인점' })).toBeInTheDocument()
  })
})

describe('알림', () => {
  test('오늘 알림 세 건을 최신순으로 보여준다', () => {
    renderAlerts()

    expect(screen.getAllByRole('heading', { level: 2 }).map((title) => title.textContent)).toEqual([
      '냉장고 문 장시간 개방',
      '상품 이동 감지',
      '상품 훼손 의심',
    ])
  })

  test('미확인 알림만 확인 완료 버튼이 있고 누르면 해당 알림을 넘긴다', async () => {
    const { onConfirm } = renderAlerts()

    expect(screen.getAllByRole('button', { name: /확인 완료$/ })).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: '냉장고 문 장시간 개방 확인 완료' }))

    expect(onConfirm).toHaveBeenCalledWith('e1')
    expect(screen.getAllByText('확인됨')).toHaveLength(2)
  })

  test('영상 클립 확인을 누르면 해당 알림을 넘긴다', async () => {
    const { onOpenClip } = renderAlerts()

    await userEvent.click(screen.getAllByRole('button', { name: '영상 클립 확인' })[1])

    expect(onOpenClip).toHaveBeenCalledWith('e2')
  })

  test('미결제가 아닌 상품 이동은 이동 경로와 클립 버튼을 숨긴다', () => {
    renderAlerts([
      {
        id: 'e2',
        kind: 'movement',
        label: '이상 행동 감지',
        tone: 'red',
        title: '상품 이동 감지',
        occurredAt: '2026-10-23T14:08:00+09:00',
        from: '입구 진열대',
        to: '냉동고 구역',
        unpaid: false,
        cameraId: 'cam-02',
        confirmed: false,
      },
    ])

    expect(screen.queryByText('입구 진열대 → 냉동고 구역')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '영상 클립 확인' })).not.toBeInTheDocument()
  })

  test('냉장고 문 경과 시간을 바와 글자로 보여준다', () => {
    renderAlerts()

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '80')
    expect(screen.getByText('28분 경과')).toBeInTheDocument()
  })

  test('상품을 식별하지 못하면 상품 확인 불가로 표시한다', () => {
    renderAlerts([
      {
        id: 'x',
        kind: 'product',
        label: '이상 행동 감지',
        tone: 'green',
        title: '상품 훼손 의심',
        occurredAt: '2026-10-23T10:32:00+09:00',
        product: null,
        cameraId: 'cam-02',
        confirmed: false,
      },
    ])

    expect(screen.getByText('감지 상품: 상품 확인 불가')).toBeInTheDocument()
  })

  test('알림이 없으면 안내를 보여준다', () => {
    renderAlerts([])

    expect(screen.getByText('아직 집계된 알림이 없습니다.')).toBeInTheDocument()
  })
})

describe('문의', () => {
  function renderInquiries(items: Inquiry[] = inquiries) {
    const onRead = vi.fn()
    render(<InquiriesPage inquiries={items} now={demoNow} onRead={onRead} />)
    return onRead
  }

  test('오늘 총 문의와 점주 확인 필요 건수를 보여준다', () => {
    renderInquiries()

    expect(screen.getByText('총 2건 · 점주 확인 필요 1건')).toBeInTheDocument()
    expect(screen.getByText('AI 응대 완료 1건 · 점주 전달 1건')).toBeInTheDocument()
  })

  test('상담 내용 확인을 누르면 대화가 펼쳐지고 읽음 처리한다', async () => {
    const onRead = renderInquiries()

    await userEvent.click(screen.getAllByRole('button', { name: '상담 내용 확인' })[0])

    expect(onRead).toHaveBeenCalledWith('q1')
    expect(screen.getByText('고객: 결제했는데 상품이 나오지 않아요.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '상담 내용 닫기' })).toHaveAttribute('aria-expanded', 'true')
  })

  test('문의에 HTML이 있어도 글자 그대로 보여준다', () => {
    const attack = '<img src=x onerror=alert(1)>'
    renderInquiries([{ ...inquiries[0], title: attack }])

    expect(screen.getByRole('heading', { name: attack })).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })

  test('문의가 없으면 안내를 보여준다', () => {
    renderInquiries([])

    expect(screen.getByText('아직 접수된 문의가 없습니다.')).toBeInTheDocument()
  })
})

describe('리포트', () => {
  async function renderReport(items: AlertItem[] = alerts) {
    render(<ReportPage loadAlerts={async () => items} revision={0} now={demoNow} />)
    await screen.findByText('감지 이벤트')
  }

  test('통계, 추이, 요약이 같은 숫자를 보여준다', async () => {
    await renderReport()

    expect(statValue('감지 이벤트')).toHaveTextContent('12건')
    expect(statValue('처리 완료')).toHaveTextContent('11건')
    expect(statValue('미확인')).toHaveTextContent('01건')

    const bars = screen.getByRole('list', { name: '일별 이벤트 수' })
    const counts = within(bars)
      .getAllByText(/^\d+건$/)
      .map((label) => parseInt(label.textContent!, 10))

    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(12)
    expect(screen.getByText('선택한 기간의 이상행동 감지 이벤트 12건')).toBeInTheDocument()
    expect(screen.getByText('미확인 이벤트 1건 확인 필요')).toBeInTheDocument()
  })

  test('월간을 누르면 기간과 통계가 바뀐다', async () => {
    await renderReport()

    await userEvent.click(screen.getByRole('button', { name: '월간' }))

    expect(screen.getByText('2026. 09. 24 ~ 10. 23')).toBeInTheDocument()
    await waitFor(() => expect(statValue('감지 이벤트')).toHaveTextContent('15건'))
    expect(screen.getByRole('button', { name: '월간' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('날짜를 직접 고르면 그 기간으로 집계한다', async () => {
    await renderReport()

    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-10-20' } })
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-10-20' } })

    expect(screen.getByText('2026. 10. 20 ~ 10. 20')).toBeInTheDocument()
    await waitFor(() => expect(statValue('감지 이벤트')).toHaveTextContent('04건'))
  })

  test('잘못된 기간은 서버에 요청하지 않고 직전 기간의 결과를 유지한다', async () => {
    const loadAlerts = vi.fn(async () => alerts)
    render(<ReportPage loadAlerts={loadAlerts} revision={0} now={demoNow} />)
    await screen.findByText('감지 이벤트')

    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-10-24' } })

    expect(screen.getByRole('alert')).toHaveTextContent('시작일은 종료일보다 늦을 수 없습니다.')
    expect(statValue('감지 이벤트')).toHaveTextContent('12건')
    expect(loadAlerts).toHaveBeenCalledTimes(1)
  })

  test('선택한 기간으로 데이터를 요청한다', async () => {
    const loadAlerts = vi.fn(async () => alerts)
    render(<ReportPage loadAlerts={loadAlerts} revision={0} now={demoNow} />)
    await screen.findByText('감지 이벤트')

    await userEvent.click(screen.getByRole('button', { name: '월간' }))

    expect(loadAlerts).toHaveBeenLastCalledWith({ start: '2026-09-24', end: '2026-10-23' })
  })

  test('데이터가 바뀌었다는 신호를 받으면 다시 요청한다', async () => {
    const loadAlerts = vi.fn(async () => alerts)
    const { rerender } = render(<ReportPage loadAlerts={loadAlerts} revision={0} now={demoNow} />)
    await screen.findByText('감지 이벤트')

    rerender(<ReportPage loadAlerts={loadAlerts} revision={1} now={demoNow} />)

    await waitFor(() => expect(loadAlerts).toHaveBeenCalledTimes(2))
  })

  test('불러오기에 실패하면 안내하고 다시 시도할 수 있다', async () => {
    const loadAlerts = vi.fn<() => Promise<AlertItem[]>>().mockRejectedValueOnce(new Error('down'))
    loadAlerts.mockResolvedValue(alerts)
    render(<ReportPage loadAlerts={loadAlerts} revision={0} now={demoNow} />)

    expect(await screen.findByText('리포트를 불러오지 못했습니다.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(await screen.findByText('감지 이벤트')).toBeInTheDocument()
    expect(screen.queryByText('리포트를 불러오지 못했습니다.')).not.toBeInTheDocument()
  })

  test('늦게 도착한 이전 기간의 응답은 무시한다', async () => {
    let finishWeekly: (items: AlertItem[]) => void = () => {}
    const loadAlerts = vi.fn(({ start }: { start: string }) =>
      start === '2026-10-17' ? new Promise<AlertItem[]>((resolve) => (finishWeekly = resolve)) : Promise.resolve(alerts),
    )
    render(<ReportPage loadAlerts={loadAlerts} revision={0} now={demoNow} />)

    await userEvent.click(screen.getByRole('button', { name: '월간' }))
    await waitFor(() => expect(statValue('감지 이벤트')).toHaveTextContent('15건'))
    await act(async () => finishWeekly([]))

    expect(statValue('감지 이벤트')).toHaveTextContent('15건')
  })

  test('시간대별을 누르면 가장 잦은 시간대와 범례를 보여준다', async () => {
    await renderReport()

    await userEvent.click(screen.getByRole('button', { name: '시간대별' }))

    expect(screen.getByText('가장 자주 발생한 시간대는 12~16시입니다 (4건)')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: '범례' })).getAllByRole('listitem')).toHaveLength(3)
  })

  test('막대를 누르면 해당 구간의 유형별 건수를 보여준다', async () => {
    await renderReport()

    await userEvent.click(screen.getByRole('button', { name: '시간대별' }))
    await userEvent.click(screen.getByRole('button', { name: /^20~24시/ }))

    expect(screen.getByText('20~24시: 3건 (상품 이동 1 · 문 개방 2 · 상품 훼손 0)')).toBeInTheDocument()
  })

  test('표로 보기에도 같은 숫자가 있다', async () => {
    await renderReport()

    await userEvent.click(screen.getByRole('button', { name: '시간대별' }))
    const row = screen.getByRole('rowheader', { name: '12~16시' }).closest('tr')!

    expect(within(row).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['2', '2', '0', '4'])
  })

  test('이벤트가 없는 기간은 그래프 대신 안내를 보여준다', async () => {
    await renderReport([])

    expect(screen.getByText('아직 집계된 이벤트가 없습니다.')).toBeInTheDocument()
    expect(screen.getByText('선택한 기간에 집계된 이벤트가 없습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: '일별 이벤트 수' })).not.toBeInTheDocument()
  })
})

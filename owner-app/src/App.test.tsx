import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import App from './App'
import OwnerApp from './OwnerApp'
import { createFixtureApi, demoNow } from './test/fixtures'

function statValue(label: string) {
  return within(screen.getByText(label).parentElement!).getByRole('strong')
}

async function goTo(tab: string) {
  await userEvent.click(screen.getByRole('button', { name: tab }))
}

test('카메라가 한 대도 없어도 앱이 열리고 CCTV 탭에서 안내가 보인다', async () => {
  render(<OwnerApp api={createFixtureApi({ cameras: [] })} startAt={demoNow} pollMs={0} />)

  await userEvent.click(await screen.findByRole('button', { name: 'CCTV' }))

  expect(screen.getByText('등록된 카메라가 없습니다')).toBeInTheDocument()
})

describe('서버 없이 화면만 볼 때', () => {
  test('모든 숫자가 0이고 집계 전이라고 안내한다', async () => {
    render(<App dataSource="preview" />)

    await screen.findByText('매장 대시보드')

    expect(statValue('오늘 감지')).toHaveTextContent('00건')
    expect(statValue('미확인 알림')).toHaveTextContent('00건')
    expect(statValue('고객 문의')).toHaveTextContent('00건')
    expect(screen.getByRole('status')).toHaveTextContent('집계를 시작하지 않았습니다')
    expect(screen.getByText('연동 대기')).toBeInTheDocument()
    expect(screen.getByText('아직 집계된 활동이 없습니다.')).toBeInTheDocument()
    expect(screen.getByText('아직 집계된 데이터가 없습니다.')).toBeInTheDocument()
  })

  test('다른 탭에도 지어낸 데이터가 없다', async () => {
    render(<App dataSource="preview" />)
    await screen.findByText('매장 대시보드')

    await goTo('CCTV')
    expect(screen.getByText('등록된 카메라가 없습니다')).toBeInTheDocument()
    expect(screen.getByText('오늘 감지된 클립이 없습니다.')).toBeInTheDocument()

    await goTo('알림')
    expect(screen.getByText('아직 집계된 알림이 없습니다.')).toBeInTheDocument()

    await goTo('문의')
    expect(screen.getByText('아직 접수된 문의가 없습니다.')).toBeInTheDocument()
    expect(screen.getByText('총 0건 · 점주 확인 필요 0건')).toBeInTheDocument()

    await goTo('리포트')
    expect(await screen.findByText('아직 집계된 이벤트가 없습니다.')).toBeInTheDocument()
    expect(screen.getByText('선택한 기간에 집계된 이벤트가 없습니다.')).toBeInTheDocument()
    expect(statValue('감지 이벤트')).toHaveTextContent('00건')
  })

  test('안내 띠는 모든 탭에서 유지된다', async () => {
    render(<App dataSource="preview" />)
    await screen.findByText('매장 대시보드')

    await goTo('알림')

    expect(screen.getByRole('status')).toHaveTextContent('집계를 시작하지 않았습니다')
  })
})

describe('관리용 앱 연결 상태', () => {
  test('연결된 매장은 안내 없이 운영 정상으로 표시한다', async () => {
    render(<OwnerApp api={createFixtureApi()} startAt={demoNow} pollMs={0} />)

    await screen.findByText('매장 대시보드')

    expect(screen.getByText('운영 정상')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  test('연결이 끊긴 매장은 마지막 수신 시각을 알리고 정상으로 표시하지 않는다', async () => {
    const api = createFixtureApi({
      integration: { status: 'offline', lastSeenAt: '2026-10-23T12:30:00+09:00' },
    })
    render(<OwnerApp api={api} startAt={demoNow} pollMs={0} />)

    await screen.findByText('매장 대시보드')

    expect(screen.getByText('연결 확인 필요')).toBeInTheDocument()
    expect(screen.queryByText('운영 정상')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('마지막 수신(12:30) 이후는 집계되지 않았습니다.')
  })

  test('서버가 끊기면 서버 안내를 우선한다', async () => {
    const api = createFixtureApi({ integration: { status: 'waiting', lastSeenAt: null } })
    const failing = { ...api, getDashboard: vi.fn(api.getDashboard) }
    render(<OwnerApp api={failing} startAt={demoNow} pollMs={0} />)
    await screen.findByText('연동 대기')

    failing.confirmAlert = () => Promise.reject(new Error('down'))
    await goTo('알림')
    await userEvent.click(screen.getByRole('button', { name: '냉장고 문 장시간 개방 확인 완료' }))

    expect(await screen.findByText(/서버에 연결할 수 없습니다/)).toBeInTheDocument()
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

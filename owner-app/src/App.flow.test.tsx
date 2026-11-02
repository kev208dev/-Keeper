import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import OwnerApp from './OwnerApp'
import { createFixtureApi, demoNow } from './test/fixtures'

const HOME_MARKER = '지금 확인할 알림'

function stat(label: string) {
  return screen.getByText(label).parentElement!
}

async function goTo(tab: string) {
  await userEvent.click(within(screen.getByRole('navigation')).getByRole('link', { name: tab }))
}

async function renderApp() {
  render(<OwnerApp api={createFixtureApi()} startAt={demoNow} pollMs={0} />)
  await screen.findByText(HOME_MARKER)
}

test('알림 상세에서 확인하면 홈, 알림 목록, 리포트의 숫자가 함께 바뀐다', async () => {
  await renderApp()
  expect(stat('확인 필요')).toHaveTextContent('1건')

  await goTo('알림')
  await userEvent.click(await screen.findByRole('link', { name: /냉장고 문 장시간 개방/ }))
  await userEvent.click(await screen.findByRole('button', { name: '확인 완료' }))
  expect(await screen.findByRole('button', { name: '처리 완료' })).toBeDisabled()
  expect(screen.getByText('확인 완료로 처리했어요')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('link', { name: '뒤로 가기' }))
  await screen.findByRole('heading', { name: '알림' })
  await goTo('홈')

  await screen.findByText(HOME_MARKER)
  expect(stat('확인 필요')).toHaveTextContent('0건')
  expect(stat('감지 이벤트')).toHaveTextContent('3건')

  await goTo('리포트')
  await screen.findByText('최근 7일 감지 기록')

  expect(screen.getByText('확인 완료').parentElement).toHaveTextContent('12')
  expect(screen.getByText('확인 필요').parentElement).toHaveTextContent('0')
})

test('정상 행동으로 처리하면 목록에 그렇게 표시된다', async () => {
  await renderApp()

  await goTo('알림')
  await userEvent.click(await screen.findByRole('link', { name: /냉장고 문 장시간 개방/ }))
  await userEvent.click(await screen.findByRole('button', { name: '정상 행동' }))
  expect(await screen.findByText('정상 행동으로 기록했어요')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('link', { name: '뒤로 가기' }))

  expect(await screen.findByRole('link', { name: /냉장고 문 장시간 개방/ })).toHaveTextContent('정상 행동')
})

test('전달된 문의를 읽으면 확인 필요 수가 줄어든다', async () => {
  await renderApp()

  await goTo('문의')
  await userEvent.click(await screen.findByRole('button', { name: /결제 후 상품이 나오지 않아요/ }))

  expect(screen.getByText(/최근 접수된 문의 2건/)).toHaveTextContent('· 확인 필요 0건')
  expect(screen.getByText('확인 완료')).toBeInTheDocument()
})

test('답변을 보내면 대화에 나타나고 답변 완료로 바뀐다', async () => {
  await renderApp()

  await goTo('문의')
  await userEvent.click(await screen.findByRole('button', { name: /결제 후 상품이 나오지 않아요/ }))
  const [input] = screen.getAllByLabelText('고객 문의 답변 입력')
  await userEvent.type(input, '환불해 드릴게요{Enter}')

  expect(await screen.findByText('환불해 드릴게요')).toBeInTheDocument()
  expect(screen.getByText(/전달 대기/)).toBeInTheDocument()
  expect(screen.getByText('답변을 보냈어요')).toBeInTheDocument()
})

test('설정에서 매장 이름을 바꾸면 홈에도 반영된다', async () => {
  await renderApp()

  await userEvent.click(screen.getByRole('link', { name: '설정' }))
  await userEvent.click(await screen.findByRole('button', { name: /매장 정보/ }))
  const input = screen.getByLabelText('매장 이름')
  await userEvent.clear(input)
  await userEvent.type(input, '역삼 무인점{Enter}')
  await goTo('홈')

  expect(await screen.findByText('역삼 무인점')).toBeInTheDocument()
})

test('알림 설정을 바꾸면 다시 들어와도 유지된다', async () => {
  await renderApp()

  await goTo('알림')
  await userEvent.click(await screen.findByRole('link', { name: '알림 설정' }))
  await userEvent.click(await screen.findByRole('switch', { name: '고객 문의' }))
  expect(screen.getByRole('switch', { name: '고객 문의' })).not.toBeChecked()

  await userEvent.click(screen.getByRole('link', { name: '뒤로 가기' }))
  await userEvent.click(await screen.findByRole('link', { name: '알림 설정' }))

  expect(await screen.findByRole('switch', { name: '고객 문의' })).not.toBeChecked()
})

test('공지사항은 설정에서 들어가고 뒤로 가면 설정으로 돌아온다', async () => {
  await renderApp()

  await userEvent.click(screen.getByRole('link', { name: '설정' }))
  await userEvent.click(await screen.findByRole('link', { name: /공지사항/ }))
  expect(await screen.findByText('점주 앱 화면 개편 안내')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('link', { name: '뒤로 가기' }))

  expect(await screen.findByRole('heading', { name: '설정' })).toBeInTheDocument()
})

test('주소로 바로 연 상세 화면의 뒤로 가기는 알림 목록으로 간다', async () => {
  window.location.hash = '#alerts/e1'
  // 주소를 바꾼 알림이 지나간 뒤에 앱을 열어야 처음 연 화면과 같아진다
  await new Promise((resolve) => setTimeout(resolve))
  render(<OwnerApp api={createFixtureApi()} startAt={demoNow} pollMs={0} />)

  await screen.findByRole('heading', { name: '냉장고 문 장시간 개방' })

  expect(screen.getByRole('link', { name: '뒤로 가기' })).toHaveAttribute('href', '#alerts')
})

test('상세, 알림 설정, 공지사항 화면에는 하단 메뉴가 없다', async () => {
  window.location.hash = '#settings/notices'
  render(<OwnerApp api={createFixtureApi()} startAt={demoNow} pollMs={0} />)

  await screen.findByText('점주 앱 화면 개편 안내')

  expect(screen.queryByRole('navigation', { name: '하단 메뉴' })).not.toBeInTheDocument()
})

test('확인할 알림이 있으면 종과 알림 탭에 표시하고 없으면 표시하지 않는다', async () => {
  const { container } = render(<OwnerApp api={createFixtureApi()} startAt={demoNow} pollMs={0} />)
  await screen.findByText(HOME_MARKER)

  expect(container.querySelector('.noti-dot')).toBeInTheDocument()
  expect(container.querySelector('.navbadge')).toBeInTheDocument()
})

test('확인할 알림이 없으면 표시가 사라진다', async () => {
  const { container } = render(<OwnerApp api={createFixtureApi({ alerts: [] })} startAt={demoNow} pollMs={0} />)
  await screen.findByText(HOME_MARKER)

  expect(container.querySelector('.noti-dot')).not.toBeInTheDocument()
  expect(container.querySelector('.navbadge')).not.toBeInTheDocument()
})

test('CCTV에서 고른 카메라는 다른 탭에 다녀와도 유지된다', async () => {
  await renderApp()

  await goTo('CCTV')
  await userEvent.click(await screen.findByRole('button', { name: /냉동고 구역/ }))
  await goTo('홈')
  await screen.findByText(HOME_MARKER)
  await goTo('CCTV')

  expect(await screen.findByRole('button', { name: /냉동고 구역/ })).toHaveAttribute('aria-pressed', 'true')
})

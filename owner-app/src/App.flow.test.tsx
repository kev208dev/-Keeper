import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import OwnerApp from './OwnerApp'
import { createFixtureApi, demoNow } from './test/fixtures'

function statValue(label: string) {
  return within(screen.getByText(label).parentElement!).getByRole('strong')
}

async function goTo(tab: string) {
  await userEvent.click(screen.getByRole('button', { name: tab }))
}

async function renderApp() {
  render(<OwnerApp api={createFixtureApi()} startAt={demoNow} pollMs={0} />)
  await screen.findByText('매장 대시보드')
}

test('알림을 확인하면 홈, 최근 활동, 요약, 리포트의 숫자가 함께 바뀐다', async () => {
  await renderApp()
  expect(statValue('미확인 알림')).toHaveTextContent('01건')

  await goTo('알림')
  await userEvent.click(screen.getByRole('button', { name: '냉장고 문 장시간 개방 확인 완료' }))
  await goTo('홈')

  expect(statValue('미확인 알림')).toHaveTextContent('00건')
  expect(statValue('오늘 감지')).toHaveTextContent('03건')
  expect(screen.queryByText('확인 필요')).not.toBeInTheDocument()
  expect(screen.getByText('미확인 이벤트가 없습니다.')).toBeInTheDocument()

  await goTo('리포트')
  await screen.findByText('처리 완료')

  expect(statValue('처리 완료')).toHaveTextContent('12건')
  expect(statValue('미확인')).toHaveTextContent('00건')
  expect(screen.getByText('미확인 이벤트 없음')).toBeInTheDocument()
})

test('전달된 문의를 읽으면 홈의 고객 문의 수가 줄어든다', async () => {
  await renderApp()
  expect(statValue('고객 문의')).toHaveTextContent('01건')

  await goTo('문의')
  await userEvent.click(screen.getAllByRole('button', { name: '상담 내용 확인' })[0])

  expect(screen.getByText('점주 확인 완료')).toBeInTheDocument()
  expect(screen.getByText('총 2건 · 점주 확인 필요 0건')).toBeInTheDocument()

  await goTo('홈')

  expect(statValue('고객 문의')).toHaveTextContent('00건')
})

test('알림의 영상 클립 확인을 누르면 해당 클립을 재생하고 실시간으로 돌아올 수 있다', async () => {
  await renderApp()

  await goTo('알림')
  await userEvent.click(screen.getAllByRole('button', { name: '영상 클립 확인' })[0])

  expect(screen.getByText('클립 · 냉장고 문 장시간 개방')).toBeInTheDocument()
  expect(screen.getByText('카메라 03 / 03')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: '실시간으로 돌아가기' }))

  expect(screen.getByText('카메라 03 · 냉동고 구역')).toBeInTheDocument()
})

test('화살표로 카메라를 전부 돌면 처음 카메라로 돌아온다', async () => {
  await renderApp()

  await goTo('CCTV')
  for (const expected of ['카메라 02 · 상품 진열대', '카메라 03 · 냉동고 구역', '카메라 01 · 매장 입구']) {
    await userEvent.click(screen.getByRole('button', { name: '다음 카메라' }))
    expect(screen.getByText(expected)).toBeInTheDocument()
  }
})

test('클립을 재생하다 카메라를 고르면 실시간 화면으로 바뀐다', async () => {
  await renderApp()

  await goTo('CCTV')
  await userEvent.click(screen.getByRole('button', { name: /상품 훼손 의심/ }))
  expect(screen.getByText('클립 · 상품 훼손 의심')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: /^카메라 01/ }))

  expect(screen.getByText('카메라 01 · 매장 입구')).toBeInTheDocument()
  expect(screen.getByText('실시간 영상 연결 전입니다')).toBeInTheDocument()
})

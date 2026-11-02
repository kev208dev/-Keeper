import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import type { Camera, ClipView } from '../domain/types'
import CctvPage from './CctvPage'

const cameras: Camera[] = [
  { id: 'one', name: '카메라 01', location: '매장 입구', status: 'connected' },
  { id: 'two', name: '카메라 02', location: '상품 진열대', status: 'connected' },
]

const clip: ClipView = {
  id: 'c1',
  kind: 'movement',
  title: '상품 이동 감지',
  time: '14:08',
  cameraId: 'two',
  duration: '00:14',
}

function renderPage(props: Partial<Parameters<typeof CctvPage>[0]> = {}) {
  const handlers = { onSelectCamera: vi.fn(), onPlayClip: vi.fn(), onBackToLive: vi.fn() }
  render(<CctvPage cameras={cameras} clips={[clip]} cameraId="one" activeClip={null} {...handlers} {...props} />)
  return handlers
}

test('선택한 카메라의 정보와 순번을 보여준다', () => {
  renderPage({ cameraId: 'two' })

  expect(screen.getByText('카메라 02 · 상품 진열대')).toBeInTheDocument()
  expect(screen.getByText('카메라 02 / 02')).toBeInTheDocument()
})

test('카메라가 없으면 안내를 보여주고 클립은 그대로 보여준다', () => {
  renderPage({ cameras: [], cameraId: null })

  expect(screen.getByText('등록된 카메라가 없습니다')).toBeInTheDocument()
  expect(screen.queryByText('연결된 카메라')).not.toBeInTheDocument()
  expect(screen.getByText('상품 이동 감지')).toBeInTheDocument()
})

test('선택한 카메라가 삭제되면 첫 번째 카메라를 보여준다', () => {
  renderPage({ cameraId: 'deleted' })

  expect(screen.getByText('카메라 01 · 매장 입구')).toBeInTheDocument()
})

test('클립의 카메라가 삭제되어도 화면이 유지된다', () => {
  renderPage({ cameras: [cameras[0]] })

  expect(screen.getByText('오늘 14:08 · 삭제된 카메라')).toBeInTheDocument()
})

test('카메라 행을 누르면 해당 카메라를 선택한다', async () => {
  const { onSelectCamera } = renderPage()

  await userEvent.click(screen.getByRole('button', { name: /카메라 02/, pressed: false }))

  expect(onSelectCamera).toHaveBeenCalledWith('two')
})

test('화살표로 다음과 이전 카메라로 이동한다', async () => {
  const { onSelectCamera } = renderPage({ cameraId: 'two' })

  await userEvent.click(screen.getByRole('button', { name: '다음 카메라' }))
  await userEvent.click(screen.getByRole('button', { name: '이전 카메라' }))

  expect(onSelectCamera).toHaveBeenNthCalledWith(1, 'one')
  expect(onSelectCamera).toHaveBeenNthCalledWith(2, 'one')
})

test('카메라가 한 대면 화살표를 숨긴다', () => {
  renderPage({ cameras: [cameras[0]] })

  expect(screen.queryByRole('button', { name: '다음 카메라' })).not.toBeInTheDocument()
})

test('연결이 끊긴 카메라는 상태와 안내를 보여주고 복구되면 원래대로 돌아온다', () => {
  const handlers = { onSelectCamera: vi.fn(), onPlayClip: vi.fn(), onBackToLive: vi.fn() }
  const offline: Camera[] = [{ ...cameras[0], status: 'disconnected' }, cameras[1]]
  const props = { clips: [clip], cameraId: 'one', activeClip: null, ...handlers }
  const { rerender } = render(<CctvPage cameras={offline} {...props} />)

  expect(screen.getByText('연결이 끊겼습니다')).toBeInTheDocument()
  expect(screen.getAllByText('연결 끊김')).toHaveLength(2)

  rerender(<CctvPage cameras={cameras} {...props} />)

  expect(screen.queryByText('연결이 끊겼습니다')).not.toBeInTheDocument()
  expect(screen.getByText('실시간 영상 연결 전입니다')).toBeInTheDocument()
})

test('클립을 누르면 해당 클립을 재생한다', async () => {
  const { onPlayClip } = renderPage()

  await userEvent.click(screen.getByRole('button', { name: /상품 이동 감지/ }))

  expect(onPlayClip).toHaveBeenCalledWith('c1')
})

test('클립 재생 중에는 클립 정보를 보여주고 실시간으로 돌아갈 수 있다', async () => {
  const { onBackToLive } = renderPage({ activeClip: clip })

  expect(screen.getByText('클립 · 상품 이동 감지')).toBeInTheDocument()
  expect(screen.getByText('00:14', { selector: '.player__live' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '다음 카메라' })).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: '실시간으로 돌아가기' }))

  expect(onBackToLive).toHaveBeenCalled()
})

test('오늘 클립이 없으면 안내를 보여준다', () => {
  renderPage({ clips: [] })

  expect(screen.getByText('오늘 감지된 클립이 없습니다.')).toBeInTheDocument()
})

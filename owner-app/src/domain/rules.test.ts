import { describe, expect, test } from 'vitest'
import {
  canViewClip,
  confirmAlert,
  filterAlerts,
  getActiveCamera,
  getAlertDescription,
  getAlertFacts,
  getAlertGuide,
  getAlertStatus,
  getCameraCaption,
  getCameraLabel,
  getConnectedCount,
  getDoorStatus,
  getHomeCaption,
  getHomeStats,
  getIntegrationBadge,
  getIntegrationNotice,
  getInquiryMeta,
  getInquiryState,
  getInquirySummary,
  getNewNotifications,
  getPresetPeriod,
  getRecentAlerts,
  getReportStats,
  getReportTrend,
  getSignupError,
  getTodayClips,
  getVisibleAlerts,
  groupAlertsByDay,
  markInquiryRead,
  parseTranscriptLine,
} from './rules'
import type { AlertItem, Camera, Inquiry, Integration, NotificationSettings, Period } from './types'

const NOW = new Date('2026-10-23T15:00:00+09:00')
const WEEK: Period = { start: '2026-10-17', end: '2026-10-23' }
const ONLINE: Integration = { status: 'online', lastSeenAt: '2026-10-23T14:59:00+09:00' }
const WAITING: Integration = { status: 'waiting', lastSeenAt: null }
const OFFLINE: Integration = { status: 'offline', lastSeenAt: '2026-10-23T12:30:00+09:00' }

const CAMERAS: Camera[] = [
  { id: 'one', name: '카메라 01', location: '입구', status: 'connected' },
  { id: 'two', name: '카메라 02', location: '진열대', status: 'disconnected' },
]

function makeAlert(id: string, occurredAt: string, confirmed = false): AlertItem {
  return {
    id,
    kind: 'product',
    product: '초코 아이스크림',
    label: '이상 행동 감지',
    tone: 'red',
    title: `알림 ${id}`,
    occurredAt,
    cameraId: 'one',
    confirmed,
    resolution: null,
  }
}

function makeDoorAlert(overrides: { openedAt?: string; closedAt?: string | null; limitMinutes?: number } = {}) {
  return {
    ...makeAlert('door', '2026-10-23T14:42:00+09:00'),
    kind: 'duration' as const,
    openedAt: '2026-10-23T14:32:00+09:00',
    closedAt: null,
    limitMinutes: 35,
    ...overrides,
  }
}

function makeMovementAlert(unpaid: boolean): AlertItem {
  return { ...makeAlert('move', '2026-10-23T14:08:00+09:00'), kind: 'movement', from: '입구', to: '냉동고', unpaid }
}

function makeInquiry(id: string, overrides: Partial<Inquiry> = {}): Inquiry {
  return {
    id,
    title: `문의 ${id}`,
    note: '',
    transcript: [],
    occurredAt: '2026-10-23T10:00:00+09:00',
    status: 'forwarded',
    read: false,
    replies: [],
    ...overrides,
  }
}

describe('회원가입 입력 검사', () => {
  const valid = {
    storeName: '역삼 무인점',
    email: 'owner@keeper.test',
    password: 'test-password',
    passwordConfirm: 'test-password',
  }

  test('올바른 입력은 오류가 없다', () => {
    expect(getSignupError(valid)).toBeNull()
  })

  test('매장 이름이 비어 있으면 오류다', () => {
    expect(getSignupError({ ...valid, storeName: '   ' })).toContain('매장 이름')
  })

  test.each(['', 'not-an-email', 'a@b', 'a b@keeper.test'])('이메일 "%s"은 오류다', (email) => {
    expect(getSignupError({ ...valid, email })).toContain('이메일')
  })

  test('앞뒤 공백이 있는 이메일은 허용한다', () => {
    expect(getSignupError({ ...valid, email: ' owner@keeper.test ' })).toBeNull()
  })

  test('비밀번호는 8자부터 허용한다', () => {
    expect(getSignupError({ ...valid, password: '1234567', passwordConfirm: '1234567' })).toContain('8자')
    expect(getSignupError({ ...valid, password: '12345678', passwordConfirm: '12345678' })).toBeNull()
  })

  test('비밀번호 확인이 다르면 오류다', () => {
    expect(getSignupError({ ...valid, passwordConfirm: 'different-password' })).toContain('서로 다릅니다')
  })
})

describe('홈 집계', () => {
  test('오늘 감지는 오늘 생긴 알림 수이고 미확인은 확인하지 않은 알림 수다', () => {
    const alerts = [
      makeAlert('a', '2026-10-23T09:00:00+09:00'),
      makeAlert('b', '2026-10-23T10:00:00+09:00', true),
      makeAlert('c', '2026-10-23T11:00:00+09:00', true),
    ]

    expect(getHomeStats(alerts, [], NOW)).toMatchObject({ detected: 3, unconfirmedAlerts: 1 })
  })

  test('알림을 확인하면 미확인만 줄고 오늘 감지는 그대로다', () => {
    const before = [makeAlert('a', '2026-10-23T09:00:00+09:00')]
    const after = [makeAlert('a', '2026-10-23T09:00:00+09:00', true)]

    expect(getHomeStats(before, [], NOW)).toMatchObject({ detected: 1, unconfirmedAlerts: 1 })
    expect(getHomeStats(after, [], NOW)).toMatchObject({ detected: 1, unconfirmedAlerts: 0 })
  })

  test('어제 확인하지 않은 알림은 오늘 감지에서 빠지고 미확인에는 남는다', () => {
    const alerts = [makeAlert('a', '2026-10-22T23:00:00+09:00')]

    expect(getHomeStats(alerts, [], NOW)).toMatchObject({ detected: 0, unconfirmedAlerts: 1 })
  })

  test('오늘의 기준은 UTC가 아니라 한국 시간 자정이다', () => {
    const alerts = [makeAlert('before', '2026-10-22T14:59:59Z'), makeAlert('after', '2026-10-22T15:00:00Z')]

    expect(getHomeStats(alerts, [], NOW).detected).toBe(1)
  })

  test('고객 문의는 점주에게 전달되고 읽지 않은 문의만 센다', () => {
    const inquiries = [
      makeInquiry('unread'),
      makeInquiry('read', { read: true }),
      makeInquiry('ai', { status: 'ai_resolved' }),
    ]

    expect(getHomeStats([], inquiries, NOW).inquiries).toBe(1)
  })

  test('카메라 수와 최근 감지 시각을 문구로 만든다', () => {
    const alerts = [makeAlert('old', '2026-10-23T09:00:00+09:00'), makeAlert('new', '2026-10-23T14:32:00+09:00')]

    expect(getHomeCaption(CAMERAS, alerts, NOW)).toBe('카메라 1대 연결 · 최근 감지 오후 2:32')
  })

  test('감지 기록이 없으면 없다고 말한다', () => {
    expect(getHomeCaption([], [], NOW)).toBe('카메라 0대 연결 · 감지 기록 없음')
  })
})

describe('카메라 표시', () => {
  test('연결된 카메라만 센다', () => {
    expect(getConnectedCount(CAMERAS)).toBe(1)
  })

  test('전부 연결되면 연결 대수만 말한다', () => {
    expect(getCameraCaption([CAMERAS[0]])).toBe('카메라 1대가 연결되어 있습니다.')
  })

  test('끊긴 카메라가 있으면 전체 대수도 말한다', () => {
    expect(getCameraCaption(CAMERAS)).toBe('카메라 2대 중 1대가 연결되어 있습니다.')
  })

  test('카메라가 없으면 없다고 말한다', () => {
    expect(getCameraCaption([])).toBe('등록된 카메라가 없습니다.')
  })

  test('위치와 이름을 함께 보여준다', () => {
    expect(getCameraLabel(CAMERAS, 'two')).toBe('진열대 · 카메라 02')
  })

  test('사라진 카메라는 관리용 앱이 보낸 번호를 그대로 보여준다', () => {
    expect(getCameraLabel(CAMERAS, 'cam-99')).toBe('cam-99')
  })
})

describe('확인 처리', () => {
  test('지정한 알림만 확인 처리하고 원본은 바꾸지 않는다', () => {
    const alerts = [makeAlert('a', '2026-10-23T09:00:00+09:00'), makeAlert('b', '2026-10-23T10:00:00+09:00')]

    const result = confirmAlert(alerts, 'a')

    expect(result.map((alert) => alert.confirmed)).toEqual([true, false])
    expect(alerts[0].confirmed).toBe(false)
  })

  test('같은 알림을 두 번 확인해도 미확인은 한 번만 줄어든다', () => {
    const alerts = [makeAlert('a', '2026-10-23T09:00:00+09:00'), makeAlert('b', '2026-10-23T10:00:00+09:00')]

    const result = confirmAlert(confirmAlert(alerts, 'a'), 'a')

    expect(getHomeStats(result, [], NOW).unconfirmedAlerts).toBe(1)
  })

  test('판단을 기록하고 처음 내린 판단을 유지한다', () => {
    const alerts = [makeAlert('a', '2026-10-23T09:00:00+09:00')]

    const result = confirmAlert(confirmAlert(alerts, 'a', 'normal'), 'a', 'confirmed')

    expect(result[0].resolution).toBe('normal')
  })

  test('지정한 문의만 읽음 처리하고 홈 고객 문의 수가 줄어든다', () => {
    const inquiries = [makeInquiry('a'), makeInquiry('b')]

    const result = markInquiryRead(inquiries, 'a')

    expect(result.map((inquiry) => inquiry.read)).toEqual([true, false])
    expect(getHomeStats([], result, NOW).inquiries).toBe(1)
  })
})

describe('관리용 앱 연결 상태', () => {
  test('연결 전, 정상, 끊김을 서로 다른 배지로 보여준다', () => {
    expect(getIntegrationBadge(WAITING)).toEqual({ label: '연동 대기', tone: 'orange' })
    expect(getIntegrationBadge(ONLINE)).toEqual({ label: '운영 중', tone: 'green' })
    expect(getIntegrationBadge(OFFLINE)).toEqual({ label: '연결 확인 필요', tone: 'red' })
  })

  test('연결 전에는 집계를 시작하지 않았다고 안내한다', () => {
    expect(getIntegrationNotice(WAITING, NOW)).toContain('집계를 시작하지 않았습니다')
  })

  test('정상일 때는 안내가 없다', () => {
    expect(getIntegrationNotice(ONLINE, NOW)).toBeNull()
  })

  test('끊기면 마지막 수신 시각을 알려준다', () => {
    expect(getIntegrationNotice(OFFLINE, NOW)).toContain('마지막 수신(오후 12:30)')
  })

  test('어제 끊겼으면 날짜도 함께 알려준다', () => {
    const yesterday: Integration = { status: 'offline', lastSeenAt: '2026-10-22T23:10:00+09:00' }

    expect(getIntegrationNotice(yesterday, NOW)).toContain('마지막 수신(10.22 오후 11:10)')
  })

  test('마지막 수신 시각을 모르면 시각 없는 안내를 만들지 않는다', () => {
    expect(getIntegrationNotice({ status: 'offline', lastSeenAt: null }, NOW)).toBeNull()
  })
})

describe('최근 감지', () => {
  test('알림을 최신순으로 다섯 건까지 보여준다', () => {
    const alerts = ['08', '14', '12', '13', '10', '09'].map((hour) =>
      makeAlert(hour, `2026-10-23T${hour}:00:00+09:00`),
    )

    expect(getRecentAlerts(alerts).map((item) => item.id)).toEqual(['14', '13', '12', '10', '09'])
  })

  test('건수를 지정할 수 있다', () => {
    const alerts = [makeAlert('a', '2026-10-23T09:00:00+09:00'), makeAlert('b', '2026-10-23T10:00:00+09:00')]

    expect(getRecentAlerts(alerts, 1).map((item) => item.id)).toEqual(['b'])
  })
})

describe('알림 상태', () => {
  test('확인 전에는 확인 필요로 표시한다', () => {
    expect(getAlertStatus(makeAlert('a', '2026-10-23T09:00:00+09:00'))).toEqual({ label: '확인 필요', done: false })
  })

  test('확인한 알림은 확인 완료로 표시한다', () => {
    const alert = { ...makeAlert('a', '2026-10-23T09:00:00+09:00', true), resolution: 'confirmed' as const }

    expect(getAlertStatus(alert)).toEqual({ label: '확인 완료', done: true })
  })

  test('정상 행동으로 판단한 알림은 그렇게 표시한다', () => {
    const alert = { ...makeAlert('a', '2026-10-23T09:00:00+09:00', true), resolution: 'normal' as const }

    expect(getAlertStatus(alert)).toEqual({ label: '정상 행동', done: true })
  })

  test('판단을 기록하기 전에 확인한 알림도 확인 완료로 표시한다', () => {
    expect(getAlertStatus(makeAlert('a', '2026-10-23T09:00:00+09:00', true)).label).toBe('확인 완료')
  })
})

describe('알림 목록', () => {
  const alerts = [
    makeAlert('past-done', '2026-10-22T09:00:00+09:00', true),
    makeAlert('past-todo', '2026-10-22T10:00:00+09:00'),
    makeAlert('today-done', '2026-10-23T09:00:00+09:00', true),
  ]

  test('오늘 알림과 지난 미확인 알림을 최신순으로 보여주고 지난 확인 알림은 뺀다', () => {
    expect(getVisibleAlerts(alerts, NOW).map((alert) => alert.id)).toEqual(['today-done', 'past-todo'])
  })

  test('필터는 확인 상태로 나눈다', () => {
    expect(filterAlerts(alerts, 'all')).toHaveLength(3)
    expect(filterAlerts(alerts, 'pending').map((alert) => alert.id)).toEqual(['past-todo'])
    expect(filterAlerts(alerts, 'done').map((alert) => alert.id)).toEqual(['past-done', 'today-done'])
  })

  test('날짜별로 묶고 오늘은 오늘이라고 표시한다', () => {
    const groups = groupAlertsByDay(getVisibleAlerts(alerts, NOW), NOW)

    expect(groups.map((group) => group.label)).toEqual(['오늘 · 10월 23일', '10월 22일'])
    expect(groups[0].alerts.map((alert) => alert.id)).toEqual(['today-done'])
  })

  test('같은 날 알림은 한 묶음이 된다', () => {
    const sameDay = [makeAlert('a', '2026-10-23T09:00:00+09:00'), makeAlert('b', '2026-10-23T10:00:00+09:00')]

    expect(groupAlertsByDay(sameDay, NOW)).toHaveLength(1)
  })
})

describe('알림 설명', () => {
  test('미결제 상품 이동은 경로와 확인 요청을 말한다', () => {
    expect(getAlertDescription(makeMovementAlert(true), NOW)).toBe('입구 → 냉동고 · 결제 확인이 필요해요.')
  })

  test('결제된 상품 이동은 확인을 요청하지 않는다', () => {
    expect(getAlertDescription(makeMovementAlert(false), NOW)).toBe('입구 → 냉동고 · 결제가 확인됐어요.')
  })

  test('열려 있는 문은 경과 시간을 말한다', () => {
    expect(getAlertDescription(makeDoorAlert(), NOW)).toBe('문이 28분째 열려 있어요.')
  })

  test('닫힌 문은 열려 있던 시간을 말한다', () => {
    const closed = makeDoorAlert({ closedAt: '2026-10-23T14:50:00+09:00' })

    expect(getAlertDescription(closed, NOW)).toBe('문이 18분 열려 있다가 닫혔어요.')
  })

  test('상품 훼손은 상품 이름을 말한다', () => {
    expect(getAlertDescription(makeAlert('a', '2026-10-23T09:00:00+09:00'), NOW)).toBe('감지 상품: 초코 아이스크림')
  })

  test('상품을 알아내지 못하면 그렇게 말한다', () => {
    const unknown: AlertItem = { ...makeAlert('a', '2026-10-23T09:00:00+09:00'), kind: 'product', product: null }

    expect(getAlertDescription(unknown, NOW)).toBe('감지 상품: 상품 확인 불가')
  })
})

describe('알림 상세', () => {
  function fact(alert: AlertItem, label: string) {
    return getAlertFacts(alert, CAMERAS, NOW).find((item) => item.label === label)?.value
  }

  test('공통 정보를 보여준다', () => {
    const alert = makeAlert('a', '2026-10-23T14:32:00+09:00')

    expect(fact(alert, '감지 시각')).toBe('10월 23일 오후 2:32')
    expect(fact(alert, '카메라')).toBe('입구 · 카메라 01')
    expect(fact(alert, '감지 유형')).toBe('상품 훼손')
    expect(fact(alert, '처리 상태')).toBe('확인 필요')
  })

  test('상품 이동은 경로와 결제 상태를 보여준다', () => {
    expect(fact(makeMovementAlert(true), '이동 경로')).toBe('입구 → 냉동고')
    expect(fact(makeMovementAlert(true), '결제 상태')).toBe('미결제')
    expect(fact(makeMovementAlert(false), '결제 상태')).toBe('결제 확인')
  })

  test('문 개방은 개방 시간과 허용 시간을 보여준다', () => {
    expect(fact(makeDoorAlert(), '개방 시간')).toBe('28분 경과')
    expect(fact(makeDoorAlert(), '허용 시간')).toBe('35분')
  })

  test('상품 훼손은 상품을 보여주고 모르면 확인 불가로 표시한다', () => {
    const unknown: AlertItem = { ...makeAlert('a', '2026-10-23T09:00:00+09:00'), kind: 'product', product: null }

    expect(fact(makeAlert('a', '2026-10-23T09:00:00+09:00'), '감지 상품')).toBe('초코 아이스크림')
    expect(fact(unknown, '감지 상품')).toBe('상품 확인 불가')
  })

  test('의심 알림의 안내는 AI 결과만으로 단정하지 않는다고 말한다', () => {
    expect(getAlertGuide(makeMovementAlert(true))).toContain('단정할 수는 없습니다')
    expect(getAlertGuide(makeAlert('a', '2026-10-23T09:00:00+09:00'))).toContain('단정할 수는 없습니다')
  })

  test('결제된 이동과 문 개방은 각자의 안내를 보여준다', () => {
    expect(getAlertGuide(makeMovementAlert(false))).toContain('결제가 확인된')
    expect(getAlertGuide(makeDoorAlert())).toContain('문이 제대로 닫혔는지')
  })
})

describe('클립 확인 버튼', () => {
  const clips = [{ id: 'c1', alertId: 'move', duration: '00:10' }]

  test('미결제 상품 이동은 클립을 볼 수 있다', () => {
    expect(canViewClip(makeMovementAlert(true), clips)).toBe(true)
  })

  test('미결제가 아닌 상품 이동은 클립이 있어도 볼 수 없다', () => {
    expect(canViewClip(makeMovementAlert(false), clips)).toBe(false)
  })

  test('클립이 없는 알림은 볼 수 없다', () => {
    expect(canViewClip(makeAlert('other', '2026-10-23T09:00:00+09:00'), clips)).toBe(false)
  })
})

describe('냉장고 문 개방', () => {
  test('열려 있는 동안 현재 시각까지의 경과 시간을 보여준다', () => {
    expect(getDoorStatus(makeDoorAlert(), NOW)).toEqual({
      isOpen: true,
      elapsedMinutes: 28,
      progress: 80,
      label: '28분 경과',
    })
  })

  test('시간이 지나면 경과 시간이 늘어난다', () => {
    const later = new Date('2026-10-23T15:03:00+09:00')

    expect(getDoorStatus(makeDoorAlert(), later).elapsedMinutes).toBe(31)
  })

  test('기준 시간의 2배가 넘어도 진행률은 100을 넘지 않는다', () => {
    const later = new Date('2026-10-23T16:00:00+09:00')

    expect(getDoorStatus(makeDoorAlert(), later).progress).toBe(100)
  })

  test('문이 닫히면 경과 시간이 멈춘다', () => {
    const closed = makeDoorAlert({ closedAt: '2026-10-23T14:50:00+09:00' })

    expect(getDoorStatus(closed, NOW)).toMatchObject({ isOpen: false, elapsedMinutes: 18, label: '18분 개방 후 닫힘' })
  })

  test('기기 시각이 개방 시각보다 빨라도 음수가 되지 않는다', () => {
    const earlier = new Date('2026-10-23T14:00:00+09:00')

    expect(getDoorStatus(makeDoorAlert(), earlier).elapsedMinutes).toBe(0)
  })
})

describe('오늘의 클립', () => {
  test('오늘 알림의 클립만 최신순으로 알림 정보와 묶어 보여준다', () => {
    const alerts = [
      makeAlert('morning', '2026-10-23T09:00:00+09:00'),
      makeAlert('noon', '2026-10-23T12:00:00+09:00'),
      makeAlert('yesterday', '2026-10-22T23:59:00+09:00'),
    ]
    const clips = [
      { id: 'c1', alertId: 'morning', duration: '00:10' },
      { id: 'c2', alertId: 'noon', duration: '00:20' },
      { id: 'c3', alertId: 'yesterday', duration: '00:30' },
    ]

    expect(getTodayClips(clips, alerts, NOW)).toEqual([
      {
        id: 'c2',
        alertId: 'noon',
        kind: 'product',
        title: '알림 noon',
        time: '오후 12:00',
        cameraId: 'one',
        duration: '00:20',
      },
      {
        id: 'c1',
        alertId: 'morning',
        kind: 'product',
        title: '알림 morning',
        time: '오전 9:00',
        cameraId: 'one',
        duration: '00:10',
      },
    ])
  })

  test('원본 알림이 없는 클립은 뺀다', () => {
    expect(getTodayClips([{ id: 'c1', alertId: 'gone', duration: '00:10' }], [], NOW)).toEqual([])
  })

  test('결제가 확인된 상품 이동의 클립은 뺀다', () => {
    expect(getTodayClips([{ id: 'c1', alertId: 'move', duration: '00:10' }], [makeMovementAlert(false)], NOW)).toEqual([])
  })

  test('자정 전후 클립은 각각 자기 날짜에 들어간다', () => {
    const alerts = [makeAlert('before', '2026-10-22T23:59:00+09:00'), makeAlert('after', '2026-10-23T00:01:00+09:00')]
    const clips = [
      { id: 'c1', alertId: 'before', duration: '00:10' },
      { id: 'c2', alertId: 'after', duration: '00:10' },
    ]

    expect(getTodayClips(clips, alerts, NOW).map((clip) => clip.id)).toEqual(['c2'])
  })
})

describe('선택 카메라', () => {
  test('카메라가 없으면 null을 돌려준다', () => {
    expect(getActiveCamera([], null)).toBeNull()
  })

  test('선택한 카메라를 돌려준다', () => {
    expect(getActiveCamera(CAMERAS, 'two')).toBe(CAMERAS[1])
  })

  test('선택한 카메라가 삭제되면 첫 번째 카메라를 돌려준다', () => {
    expect(getActiveCamera(CAMERAS, 'deleted')).toBe(CAMERAS[0])
  })
})

describe('문의', () => {
  test('전체 문의와 점주 확인이 필요한 문의를 센다', () => {
    const inquiries = [
      makeInquiry('forwarded'),
      makeInquiry('ai', { status: 'ai_resolved' }),
      makeInquiry('past', { occurredAt: '2026-10-22T10:00:00+09:00' }),
      makeInquiry('read', { read: true }),
    ]

    expect(getInquirySummary(inquiries)).toEqual({ total: 4, needsOwner: 2 })
  })

  test('문의 상태를 고른다', () => {
    const reply = { id: 'r', body: '답변', sentAt: '2026-10-23T10:00:00+09:00', delivered: false }

    expect(getInquiryState(makeInquiry('a'))).toEqual({ label: '확인 필요', done: false })
    expect(getInquiryState(makeInquiry('b', { read: true }))).toEqual({ label: '확인 완료', done: true })
    expect(getInquiryState(makeInquiry('c', { status: 'ai_resolved' }))).toEqual({ label: '답변 완료', done: true })
    expect(getInquiryState(makeInquiry('d', { read: true, replies: [reply] }))).toEqual({ label: '답변 완료', done: true })
  })

  test('시각과 응대 주체를 함께 보여준다', () => {
    expect(getInquiryMeta(makeInquiry('a'), NOW)).toBe('오전 10:00 · 점주 전달')
    expect(getInquiryMeta(makeInquiry('b', { status: 'ai_resolved' }), NOW)).toBe('오전 10:00 · AI 응대')
  })

  test('고객의 말과 AI의 말을 구분한다', () => {
    expect(parseTranscriptLine('고객: 문이 안 열려요')).toEqual({ sender: '고객', text: '문이 안 열려요', fromCustomer: true })
    expect(parseTranscriptLine('AI: 전달했습니다')).toEqual({ sender: 'AI 상담', text: '전달했습니다', fromCustomer: false })
  })

  test('보낸 사람이 없는 줄도 내용을 잃지 않는다', () => {
    expect(parseTranscriptLine('시스템 기록입니다')).toEqual({ sender: '기록', text: '시스템 기록입니다', fromCustomer: false })
  })

  test('내용 안의 콜론은 보낸 사람으로 착각하지 않는다', () => {
    expect(parseTranscriptLine('고객: 오후 3:12에 결제했어요').text).toBe('오후 3:12에 결제했어요')
    expect(parseTranscriptLine('아주 긴 문장으로 시작하는 줄입니다: 내용').sender).toBe('기록')
  })
})

describe('새 소식 알림', () => {
  const allOn: NotificationSettings = { push: true, alert: true, door: true, inquiry: true, camera: true, sound: true }
  const empty = { alerts: [], inquiries: [], cameras: [], notificationSettings: allOn }
  const offline = { ...CAMERAS[0], status: 'disconnected' as const }

  test('새 알림과 새 문의를 알려준다', () => {
    const next = {
      ...empty,
      alerts: [makeAlert('a', '2026-10-23T09:00:00+09:00'), makeDoorAlert()],
      inquiries: [makeInquiry('q')],
    }

    expect(getNewNotifications(empty, next)).toEqual(['알림 a', '알림 door', '새 고객 문의: 문의 q'])
  })

  test('이미 본 항목은 다시 알리지 않는다', () => {
    const current = { ...empty, alerts: [makeAlert('a', '2026-10-23T09:00:00+09:00')], inquiries: [makeInquiry('q')] }

    expect(getNewNotifications(current, current)).toEqual([])
  })

  test('카메라 끊김과 복구를 알려준다', () => {
    const on = { ...empty, cameras: [CAMERAS[0]] }
    const off = { ...empty, cameras: [offline] }

    expect(getNewNotifications(on, off)).toEqual(['입구 카메라 연결 끊김'])
    expect(getNewNotifications(off, on)).toEqual(['입구 카메라 연결 복구'])
  })

  test('처음 연결된 카메라는 알리지 않는다', () => {
    expect(getNewNotifications(empty, { ...empty, cameras: [CAMERAS[0]] })).toEqual([])
  })

  test('꺼 둔 종류는 알리지 않는다', () => {
    const next = {
      alerts: [makeAlert('a', '2026-10-23T09:00:00+09:00'), makeDoorAlert()],
      inquiries: [makeInquiry('q')],
      cameras: [offline],
      notificationSettings: { ...allOn, alert: false, door: false, inquiry: false, camera: false },
    }

    expect(getNewNotifications({ ...empty, cameras: [CAMERAS[0]] }, next)).toEqual([])
  })

  test('문 개방과 이상 행동은 따로 끌 수 있다', () => {
    const alerts = [makeAlert('a', '2026-10-23T09:00:00+09:00'), makeDoorAlert()]

    expect(
      getNewNotifications(empty, { ...empty, alerts, notificationSettings: { ...allOn, door: false } }),
    ).toEqual(['알림 a'])
    expect(
      getNewNotifications(empty, { ...empty, alerts, notificationSettings: { ...allOn, alert: false } }),
    ).toEqual(['알림 door'])
  })
})

describe('리포트 기간', () => {
  test('오늘은 하루짜리 기간이다', () => {
    expect(getPresetPeriod(1, NOW)).toEqual({ start: '2026-10-23', end: '2026-10-23' })
  })

  test('7일은 오늘을 포함한 최근 7일이다', () => {
    expect(getPresetPeriod(7, NOW)).toEqual({ start: '2026-10-17', end: '2026-10-23' })
  })

  test('월말을 넘겨도 시작일을 계산한다', () => {
    expect(getPresetPeriod(30, NOW)).toEqual({ start: '2026-09-24', end: '2026-10-23' })
  })
})

describe('리포트', () => {
  const alerts = [
    makeAlert('before', '2026-10-16T23:59:00+09:00', true),
    makeAlert('first', '2026-10-17T00:00:00+09:00', true),
    makeAlert('peak-1', '2026-10-20T09:00:00+09:00', true),
    makeAlert('peak-2', '2026-10-20T10:00:00+09:00'),
    makeAlert('last', '2026-10-23T23:59:00+09:00', true),
    makeAlert('after', '2026-10-24T00:00:00+09:00'),
  ]

  function total(period: Period, items = alerts) {
    return getReportTrend(items, period).reduce((sum, point) => sum + point.count, 0)
  }

  test('기간의 첫날과 마지막 날을 포함해 집계한다', () => {
    expect(getReportStats(alerts, WEEK)).toEqual({ detected: 4, resolved: 3, unconfirmed: 1 })
  })

  test('총 이벤트는 처리 완료와 미확인의 합이다', () => {
    const { detected, resolved, unconfirmed } = getReportStats(alerts, WEEK)

    expect(resolved + unconfirmed).toBe(detected)
  })

  test('7일 추이는 요일별이고 이벤트가 없는 날도 포함한다', () => {
    const trend = getReportTrend(alerts, WEEK)

    expect(trend.map((point) => point.label)).toEqual(['토', '일', '월', '화', '수', '목', '금'])
    expect(trend[1]).toMatchObject({ count: 0, ratio: 0 })
  })

  test('7일 추이의 합계는 총 이벤트와 같다', () => {
    expect(total(WEEK)).toBe(getReportStats(alerts, WEEK).detected)
  })

  test('가장 많은 날을 기준으로 막대 비율을 계산하고 강조한다', () => {
    const trend = getReportTrend(alerts, WEEK)

    expect(trend[0]).toMatchObject({ count: 1, ratio: 0.5, isPeak: false })
    expect(trend[3]).toMatchObject({ count: 2, ratio: 1, isPeak: true })
  })

  test('기간 내 이벤트가 없으면 비율이 0이고 강조하지 않는다', () => {
    expect(getReportTrend([], WEEK).every((point) => point.ratio === 0 && !point.isPeak)).toBe(true)
  })

  test('오늘 추이는 4시간 단위 여섯 구간이다', () => {
    const day = { start: '2026-10-20', end: '2026-10-20' }

    expect(getReportTrend(alerts, day).map((point) => point.label)).toEqual(['0시', '4시', '8시', '12시', '16시', '20시'])
    expect(total(day)).toBe(2)
  })

  test('시간대는 한국 시간으로 나누고 구간 경계는 뒤 구간에 넣는다', () => {
    const day = { start: '2026-10-20', end: '2026-10-20' }
    const edges = [makeAlert('a', '2026-10-20T03:59:00+09:00'), makeAlert('b', '2026-10-20T04:00:00+09:00')]

    expect(getReportTrend(edges, day).map((point) => point.count)).toEqual([1, 1, 0, 0, 0, 0])
  })

  test('30일 추이는 7일씩 묶고 합계는 총 이벤트와 같다', () => {
    const month = getPresetPeriod(30, NOW)
    const trend = getReportTrend(alerts, month)

    expect(trend.map((point) => point.label)).toEqual(['1주', '2주', '3주', '4주', '5주'])
    expect(total(month)).toBe(getReportStats(alerts, month).detected)
  })

  test('8일부터 주 단위로 묶는다', () => {
    const period = { start: '2026-10-16', end: '2026-10-23' }

    expect(getReportTrend(alerts, period).map((point) => point.label)).toEqual(['1주', '2주'])
  })
})

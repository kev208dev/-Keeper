import { describe, expect, test } from 'vitest'
import {
  canViewClip,
  confirmAlert,
  getActiveCamera,
  getAdjacentCameraId,
  getClipView,
  getDailyTrend,
  getDoorStatus,
  getHomeStats,
  getIntegrationBadge,
  getIntegrationNotice,
  getInquiryBadge,
  getInquirySummary,
  getPeriodError,
  getPresetPeriod,
  getRecentActivities,
  getReportStats,
  getReportSummary,
  getSignupError,
  getTimeTrend,
  getTodayClips,
  getTodaySummary,
  getVisibleAlerts,
  markInquiryRead,
} from './rules'
import type { AlertItem, Camera, Inquiry, Integration, Period } from './types'

const NOW = new Date('2026-10-23T15:00:00+09:00')
const WEEK: Period = { start: '2026-10-17', end: '2026-10-23' }
const ONLINE: Integration = { status: 'online', lastSeenAt: '2026-10-23T14:59:00+09:00' }
const WAITING: Integration = { status: 'waiting', lastSeenAt: null }
const OFFLINE: Integration = { status: 'offline', lastSeenAt: '2026-10-23T12:30:00+09:00' }

function makeAlert(id: string, occurredAt: string, confirmed = false): AlertItem {
  return {
    id,
    kind: 'product',
    product: '초코 아이스크림',
    label: '이상 행동 감지',
    tone: 'red',
    title: `알림 ${id}`,
    occurredAt,
    cameraId: 'cam-01',
    confirmed,
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

  test('지정한 문의만 읽음 처리하고 홈 고객 문의 수가 줄어든다', () => {
    const inquiries = [makeInquiry('a'), makeInquiry('b')]

    const result = markInquiryRead(inquiries, 'a')

    expect(result.map((inquiry) => inquiry.read)).toEqual([true, false])
    expect(getHomeStats([], result, NOW).inquiries).toBe(1)
  })
})

describe('관리용 앱 연결 상태', () => {
  test('연결 전, 정상, 끊김을 서로 다른 배지로 보여준다', () => {
    expect(getIntegrationBadge(WAITING).label).toBe('연동 대기')
    expect(getIntegrationBadge(ONLINE).label).toBe('운영 정상')
    expect(getIntegrationBadge(OFFLINE).label).toBe('연결 확인 필요')
  })

  test('연결 전에는 집계를 시작하지 않았다고 안내한다', () => {
    expect(getIntegrationNotice(WAITING, NOW)).toContain('집계를 시작하지 않았습니다')
  })

  test('정상일 때는 안내가 없다', () => {
    expect(getIntegrationNotice(ONLINE, NOW)).toBeNull()
  })

  test('끊기면 마지막 수신 시각을 알려준다', () => {
    expect(getIntegrationNotice(OFFLINE, NOW)).toContain('마지막 수신(12:30)')
  })

  test('어제 끊겼으면 날짜도 함께 알려준다', () => {
    const yesterday: Integration = { status: 'offline', lastSeenAt: '2026-10-22T23:10:00+09:00' }

    expect(getIntegrationNotice(yesterday, NOW)).toContain('마지막 수신(10.22 23:10)')
  })

  test('마지막 수신 시각을 모르면 시각 없는 안내를 만들지 않는다', () => {
    expect(getIntegrationNotice({ status: 'offline', lastSeenAt: null }, NOW)).toBeNull()
  })
})

describe('오늘의 요약', () => {
  test('미확인 건수를 문구에 그대로 쓴다', () => {
    expect(getTodaySummary(2, ONLINE).headline).toBe('미확인 이벤트 2건이 있습니다.')
  })

  test('미확인이 없으면 확인을 요청하지 않는다', () => {
    const summary = getTodaySummary(0, ONLINE)

    expect(summary.headline).toBe('미확인 이벤트가 없습니다.')
    expect(summary.detail).not.toContain('기록하세요')
  })

  test('연동 전에는 문제 없음이 아니라 집계 전이라고 말한다', () => {
    const summary = getTodaySummary(0, WAITING)

    expect(summary.headline).toBe('아직 집계된 데이터가 없습니다.')
    expect(summary.headline).not.toContain('미확인 이벤트가 없습니다')
  })
})

describe('최근 활동', () => {
  test('알림을 최신순으로 세 건까지 보여준다', () => {
    const alerts = [
      makeAlert('old', '2026-10-23T08:00:00+09:00'),
      makeAlert('newest', '2026-10-23T14:00:00+09:00'),
      makeAlert('middle', '2026-10-23T12:00:00+09:00'),
      makeAlert('second', '2026-10-23T13:00:00+09:00'),
    ]

    expect(getRecentActivities(alerts, NOW).map((item) => item.id)).toEqual(['newest', 'second', 'middle'])
  })

  test('확인 상태를 문구로 표시한다', () => {
    const alerts = [
      makeAlert('done', '2026-10-23T09:00:00+09:00', true),
      makeAlert('todo', '2026-10-23T10:00:00+09:00'),
    ]

    expect(getRecentActivities(alerts, NOW).map((item) => item.status)).toEqual(['확인 필요', '확인 완료'])
  })
})

describe('알림 목록', () => {
  test('오늘 알림과 지난 미확인 알림을 최신순으로 보여주고 지난 확인 알림은 뺀다', () => {
    const alerts = [
      makeAlert('past-done', '2026-10-22T09:00:00+09:00', true),
      makeAlert('past-todo', '2026-10-22T10:00:00+09:00'),
      makeAlert('today-done', '2026-10-23T09:00:00+09:00', true),
    ]

    expect(getVisibleAlerts(alerts, NOW).map((alert) => alert.id)).toEqual(['today-done', 'past-todo'])
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
        kind: 'product',
        title: '알림 noon',
        time: '12:00',
        cameraId: 'cam-01',
        duration: '00:20',
      },
      {
        id: 'c1',
        kind: 'product',
        title: '알림 morning',
        time: '09:00',
        cameraId: 'cam-01',
        duration: '00:10',
      },
    ])
  })

  test('원본 알림이 없는 클립은 뺀다', () => {
    expect(getTodayClips([{ id: 'c1', alertId: 'gone', duration: '00:10' }], [], NOW)).toEqual([])
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

describe('클립 정보', () => {
  const clip = { id: 'c1', alertId: 'past', duration: '00:10' }

  test('지난 알림의 클립도 날짜와 함께 찾는다', () => {
    const alerts = [makeAlert('past', '2026-10-22T16:40:00+09:00')]

    expect(getClipView(clip, alerts, NOW)).toMatchObject({ title: '알림 past', time: '10.22 16:40' })
  })

  test('원본 알림이 없으면 null을 돌려준다', () => {
    expect(getClipView(clip, [], NOW)).toBeNull()
  })
})

describe('선택 카메라', () => {
  const cameras: Camera[] = [
    { id: 'one', name: '카메라 01', location: '입구', status: 'connected' },
    { id: 'two', name: '카메라 02', location: '진열대', status: 'connected' },
  ]

  test('카메라가 없으면 null을 돌려준다', () => {
    expect(getActiveCamera([], null)).toBeNull()
  })

  test('선택한 카메라와 순번을 돌려준다', () => {
    expect(getActiveCamera(cameras, 'two')).toEqual({ camera: cameras[1], index: 1 })
  })

  test('선택한 카메라가 삭제되면 첫 번째 카메라를 돌려준다', () => {
    expect(getActiveCamera(cameras, 'deleted')).toEqual({ camera: cameras[0], index: 0 })
  })

  test('다음 카메라로 이동하고 마지막에서는 첫 번째로 돌아간다', () => {
    expect(getAdjacentCameraId(cameras, 'one', 1)).toBe('two')
    expect(getAdjacentCameraId(cameras, 'two', 1)).toBe('one')
  })

  test('첫 번째에서 이전으로 가면 마지막 카메라로 간다', () => {
    expect(getAdjacentCameraId(cameras, 'one', -1)).toBe('two')
  })

  test('카메라가 없으면 이동할 곳이 없다', () => {
    expect(getAdjacentCameraId([], null, 1)).toBeNull()
  })

  test('카메라가 100대여도 끝까지 순서대로 돌아온다', () => {
    const many: Camera[] = Array.from({ length: 100 }, (_, index) => ({
      id: `cam-${index}`,
      name: `카메라 ${index}`,
      location: '매장',
      status: 'connected',
    }))

    let current = 'cam-0'
    for (let step = 0; step < 100; step += 1) {
      current = getAdjacentCameraId(many, current, 1)!
    }

    expect(current).toBe('cam-0')
  })
})

describe('문의 집계', () => {
  test('총 문의와 응대 현황은 오늘 기준이고 점주 확인 필요는 지난 문의도 포함한다', () => {
    const inquiries = [
      makeInquiry('today-forwarded'),
      makeInquiry('today-ai', { status: 'ai_resolved' }),
      makeInquiry('past-forwarded', { occurredAt: '2026-10-22T10:00:00+09:00' }),
    ]

    expect(getInquirySummary(inquiries, NOW)).toEqual({
      total: 2,
      needsOwner: 2,
      aiResolved: 1,
      forwarded: 1,
    })
  })

  test('문의 상태에 맞는 배지를 고른다', () => {
    expect(getInquiryBadge(makeInquiry('a')).label).toBe('점주 확인 필요')
    expect(getInquiryBadge(makeInquiry('b', { read: true })).label).toBe('점주 확인 완료')
    expect(getInquiryBadge(makeInquiry('c', { status: 'ai_resolved' })).label).toBe('AI 응대 완료')
  })
})

describe('리포트 기간', () => {
  test('주간은 오늘을 포함한 최근 7일이다', () => {
    expect(getPresetPeriod(7, NOW)).toEqual({ start: '2026-10-17', end: '2026-10-23' })
  })

  test('월말을 넘겨도 시작일을 계산한다', () => {
    expect(getPresetPeriod(30, NOW)).toEqual({ start: '2026-09-24', end: '2026-10-23' })
  })

  test('올바른 기간은 오류가 없다', () => {
    expect(getPeriodError(WEEK, NOW)).toBeNull()
  })

  test('하루짜리 기간도 허용한다', () => {
    expect(getPeriodError({ start: '2026-10-23', end: '2026-10-23' }, NOW)).toBeNull()
  })

  test('날짜가 비어 있으면 오류다', () => {
    expect(getPeriodError({ start: '', end: '2026-10-23' }, NOW)).toContain('모두 선택')
    expect(getPeriodError({ start: '2026-10-17', end: '' }, NOW)).toContain('모두 선택')
  })

  test('시작일이 종료일보다 늦으면 오류다', () => {
    expect(getPeriodError({ start: '2026-10-23', end: '2026-10-17' }, NOW)).toContain('늦을 수 없습니다')
  })

  test('오늘 이후 날짜는 오류다', () => {
    expect(getPeriodError({ start: '2026-10-17', end: '2026-10-24' }, NOW)).toContain('오늘 이후')
  })

  test('31일까지 허용하고 32일부터 오류다', () => {
    expect(getPeriodError({ start: '2026-09-23', end: '2026-10-23' }, NOW)).toBeNull()
    expect(getPeriodError({ start: '2026-09-22', end: '2026-10-23' }, NOW)).toContain('최대 31일')
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

  test('기간의 첫날과 마지막 날을 포함해 집계한다', () => {
    expect(getReportStats(alerts, WEEK)).toEqual({ detected: 4, resolved: 3, unconfirmed: 1 })
  })

  test('총 이벤트는 처리 완료와 미확인의 합이다', () => {
    const { detected, resolved, unconfirmed } = getReportStats(alerts, WEEK)

    expect(resolved + unconfirmed).toBe(detected)
  })

  test('추이의 합계는 총 이벤트와 같다', () => {
    const total = getDailyTrend(alerts, WEEK).reduce((sum, point) => sum + point.count, 0)

    expect(total).toBe(getReportStats(alerts, WEEK).detected)
  })

  test('이벤트가 없는 날도 0건으로 포함한다', () => {
    const trend = getDailyTrend(alerts, WEEK)

    expect(trend).toHaveLength(7)
    expect(trend[1]).toMatchObject({ date: '2026-10-18', label: '18일', count: 0, ratio: 0 })
  })

  test('가장 많은 날을 기준으로 막대 비율을 계산하고 강조한다', () => {
    const trend = getDailyTrend(alerts, WEEK)

    expect(trend[0]).toMatchObject({ count: 1, ratio: 0.5, isPeak: false })
    expect(trend[3]).toMatchObject({ count: 2, ratio: 1, isPeak: true })
  })

  test('기간 내 이벤트가 하나도 없으면 비율이 0이고 강조하지 않는다', () => {
    const trend = getDailyTrend([], WEEK)

    expect(trend.every((point) => point.ratio === 0 && !point.isPeak)).toBe(true)
  })

  test('시간대 추이는 4시간 단위 여섯 구간이고 합계는 총 이벤트와 같다', () => {
    const trend = getTimeTrend(alerts, WEEK)

    expect(trend.map((slot) => slot.label)).toEqual(['0~4시', '4~8시', '8~12시', '12~16시', '16~20시', '20~24시'])
    expect(trend.reduce((sum, slot) => sum + slot.count, 0)).toBe(getReportStats(alerts, WEEK).detected)
  })

  test('시간대는 한국 시간으로 나누고 구간 경계는 뒤 구간에 넣는다', () => {
    const edges = [makeAlert('a', '2026-10-20T03:59:00+09:00'), makeAlert('b', '2026-10-20T04:00:00+09:00')]

    const counts = getTimeTrend(edges, WEEK).map((slot) => slot.count)

    expect(counts).toEqual([1, 1, 0, 0, 0, 0])
  })

  test('시간대별로 유형을 나누어 센다', () => {
    const mixed = [
      makeAlert('a', '2026-10-20T13:00:00+09:00'),
      { ...makeMovementAlert(true), occurredAt: '2026-10-20T14:00:00+09:00' },
    ]

    expect(getTimeTrend(mixed, WEEK)[3]).toMatchObject({
      count: 2,
      byKind: { movement: 1, duration: 0, product: 1 },
      ratio: 1,
      isPeak: true,
    })
  })

  test('이벤트가 없으면 시간대 추이도 비어 있다', () => {
    expect(getTimeTrend([], WEEK).every((slot) => slot.count === 0 && !slot.isPeak)).toBe(true)
  })

  test('요약 문구의 숫자는 집계 결과와 같다', () => {
    expect(getReportSummary({ detected: 12, unconfirmed: 1 })).toEqual([
      '선택한 기간의 이상행동 감지 이벤트 12건',
      '미확인 이벤트 1건 확인 필요',
    ])
  })

  test('미확인이 없으면 확인 요청 문구를 쓰지 않는다', () => {
    expect(getReportSummary({ detected: 12, unconfirmed: 0 })[1]).toBe('미확인 이벤트 없음')
  })

  test('이벤트가 없으면 집계된 내용이 없다고만 말한다', () => {
    expect(getReportSummary({ detected: 0, unconfirmed: 0 })).toEqual(['선택한 기간에 집계된 이벤트가 없습니다.'])
  })
})

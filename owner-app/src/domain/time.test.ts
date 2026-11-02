import { describe, expect, test } from 'vitest'
import {
  formatEventTime,
  formatKstDate,
  formatKstTime,
  formatPeriod,
  kstDay,
  kstDayStart,
  kstHour,
  listDays,
  shiftDay,
} from './time'

const NOW = new Date('2026-10-23T15:00:00+09:00')

describe('한국 시간 변환', () => {
  test('UTC 15시는 한국의 다음 날 0시다', () => {
    expect(kstDay('2026-10-22T14:59:59Z')).toBe('2026-10-22')
    expect(kstDay('2026-10-22T15:00:00Z')).toBe('2026-10-23')
  })

  test('자정은 24시가 아니라 00시로 표시한다', () => {
    expect(formatKstTime('2026-10-22T15:05:00Z')).toBe('00:05')
  })

  test('오늘의 시작은 한국 시간 자정이다', () => {
    expect(kstDayStart('2026-10-22T15:00:00Z')).toBe('2026-10-23T00:00:00+09:00')
  })

  test('시는 한국 시간 기준 숫자로 돌려준다', () => {
    expect(kstHour('2026-10-22T15:05:00Z')).toBe(0)
    expect(kstHour('2026-10-23T14:59:00Z')).toBe(23)
  })

  test('날짜를 앞뒤로 옮길 수 있다', () => {
    expect(shiftDay('2026-10-01', -1)).toBe('2026-09-30')
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
  })

  test('날짜를 시안의 형식으로 표시한다', () => {
    expect(formatKstDate(NOW)).toBe('2026. 10. 23')
  })
})

describe('이벤트 시각 표시', () => {
  test('오늘 이벤트는 시각만 보여준다', () => {
    expect(formatEventTime('2026-10-23T14:08:00+09:00', NOW)).toBe('14:08')
  })

  test('지난 이벤트는 날짜를 함께 보여준다', () => {
    expect(formatEventTime('2026-10-22T16:40:00+09:00', NOW)).toBe('10.22 16:40')
  })
})

describe('기간', () => {
  test('같은 해의 기간은 끝 날짜에서 연도를 생략한다', () => {
    expect(formatPeriod({ start: '2026-10-17', end: '2026-10-23' })).toBe('2026. 10. 17 ~ 10. 23')
  })

  test('해를 넘기는 기간은 끝 날짜에도 연도를 표시한다', () => {
    expect(formatPeriod({ start: '2026-12-28', end: '2027-01-03' })).toBe('2026. 12. 28 ~ 2027. 01. 03')
  })

  test('월말을 넘겨도 날짜를 빠짐없이 나열한다', () => {
    expect(listDays({ start: '2026-10-30', end: '2026-11-02' })).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ])
  })
})

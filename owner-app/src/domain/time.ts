import type { Period } from './types'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const timeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export function kstDay(value: Date | string): string {
  return dayFormat.format(new Date(value))
}

export function kstDayStart(value: Date | string): string {
  return `${kstDay(value)}T00:00:00+09:00`
}

export function kstHour(value: Date | string): number {
  return Number(timeFormat.format(new Date(value)).slice(0, 2))
}

export function shiftDay(day: string, delta: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10)
}

export function formatKstTime(value: Date | string): string {
  const [hour, minute] = timeFormat.format(new Date(value)).split(':').map(Number)
  return `${hour < 12 ? '오전' : '오후'} ${hour % 12 || 12}:${String(minute).padStart(2, '0')}`
}

export function weekdayOf(day: string): string {
  return WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]
}

export function formatDayLabel(day: string): string {
  const [, month, date] = day.split('-').map(Number)
  return `${month}월 ${date}일`
}

export function formatKstDate(value: Date | string): string {
  const day = kstDay(value)
  return `${formatDayLabel(day)} ${weekdayOf(day)}요일`
}

export function formatKstDateTime(value: Date | string): string {
  return `${formatDayLabel(kstDay(value))} ${formatKstTime(value)}`
}

export function formatNoticeDate(value: Date | string): string {
  return kstDay(value).replaceAll('-', '.')
}

export function formatEventTime(value: Date | string, now: Date): string {
  const day = kstDay(value)
  if (day === kstDay(now)) return formatKstTime(value)
  return `${day.slice(5).replace('-', '.')} ${formatKstTime(value)}`
}

export function formatPeriod({ start, end }: Period): string {
  if (start === end) return start.replaceAll('-', '. ')
  const [startYear] = start.split('-')
  const [endYear, endMonth, endDay] = end.split('-')
  const endLabel = startYear === endYear ? `${endMonth}. ${endDay}` : `${endYear}. ${endMonth}. ${endDay}`
  return `${start.replaceAll('-', '. ')} ~ ${endLabel}`
}

export function listDays({ start, end }: Period): string[] {
  const days: string[] = []
  const last = Date.parse(`${end}T00:00:00Z`)
  for (let time = Date.parse(`${start}T00:00:00Z`); time <= last; time += DAY_MS) {
    days.push(new Date(time).toISOString().slice(0, 10))
  }
  return days
}

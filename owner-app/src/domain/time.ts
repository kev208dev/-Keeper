import type { Period } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

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

export function formatKstTime(value: Date | string): string {
  return timeFormat.format(new Date(value))
}

export function kstDayStart(value: Date | string): string {
  return `${kstDay(value)}T00:00:00+09:00`
}

export function kstHour(value: Date | string): number {
  return Number(formatKstTime(value).slice(0, 2))
}

export function shiftDay(day: string, delta: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10)
}

export function formatKstDate(value: Date | string): string {
  return kstDay(value).replaceAll('-', '. ')
}

export function formatEventTime(value: Date | string, now: Date): string {
  const day = kstDay(value)
  if (day === kstDay(now)) return formatKstTime(value)
  return `${day.slice(5).replace('-', '.')} ${formatKstTime(value)}`
}

export function formatPeriod({ start, end }: Period): string {
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

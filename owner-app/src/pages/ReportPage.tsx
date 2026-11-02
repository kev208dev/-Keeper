import { useEffect, useState } from 'react'
import { PageHeader, StatRow } from '../components/common'
import { DailyChart, DailyTable, TimeChart, TimeTable } from '../components/ReportCharts'
import {
  getDailyTrend,
  getPeriodError,
  getPresetPeriod,
  getReportStats,
  getReportSummary,
  getTimeTrend,
} from '../domain/rules'
import { formatPeriod, kstDay } from '../domain/time'
import type { AlertItem, Period } from '../domain/types'

const presets = [
  { label: '주간', days: 7 },
  { label: '월간', days: 30 },
]

const chartViews = [
  { id: 'daily', label: '일별' },
  { id: 'time', label: '시간대별' },
] as const

function ReportResult({ alerts, period }: { alerts: AlertItem[]; period: Period }) {
  const [view, setView] = useState<'daily' | 'time'>('daily')
  const stats = getReportStats(alerts, period)
  const dailyTrend = getDailyTrend(alerts, period)
  const timeTrend = getTimeTrend(alerts, period)
  const summary = getReportSummary(stats)

  return (
    <>
      <StatRow
        items={[
          { label: '감지 이벤트', value: stats.detected, tone: 'blue' },
          { label: '처리 완료', value: stats.resolved, tone: 'blue' },
          { label: '미확인', value: stats.unconfirmed, tone: 'red' },
        ]}
      />

      <section className="card">
        <div className="card__head">
          <h2>알림 이벤트 발생 추이</h2>
          <div className="pill-group">
            {chartViews.map((item) => (
              <button
                type="button"
                key={item.id}
                className="pill-button"
                aria-pressed={view === item.id}
                onClick={() => setView(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        {stats.detected === 0 ? (
          <p className="empty-note">아직 집계된 이벤트가 없습니다.</p>
        ) : view === 'daily' ? (
          <>
            <DailyChart points={dailyTrend} />
            <DailyTable points={dailyTrend} />
          </>
        ) : (
          <>
            <TimeChart points={timeTrend} />
            <TimeTable points={timeTrend} />
          </>
        )}
      </section>

      <section className="card">
        <h2>AI 점검 요약</h2>
        <ul className="summary-list">
          {summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </>
  )
}

type Props = {
  loadAlerts: (period: Period) => Promise<AlertItem[]>
  revision: number
  now: Date
}

export default function ReportPage({ loadAlerts, revision, now }: Props) {
  const [period, setPeriod] = useState<Period>(() => getPresetPeriod(7, now))
  const [draft, setDraft] = useState(period)
  const [result, setResult] = useState<{ alerts: AlertItem[]; period: Period } | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let stale = false
    loadAlerts(period).then(
      (alerts) => {
        if (stale) return
        setResult({ alerts, period })
        setLoadFailed(false)
      },
      () => {
        if (!stale) setLoadFailed(true)
      },
    )
    return () => {
      stale = true
    }
  }, [loadAlerts, period, revision, retryCount])

  const error = getPeriodError(draft, now)

  const changePeriod = (next: Period) => {
    setDraft(next)
    if (!getPeriodError(next, now)) setPeriod(next)
  }

  const isPresetActive = (days: number) => {
    const preset = getPresetPeriod(days, now)
    return preset.start === period.start && preset.end === period.end
  }

  return (
    <>
      <PageHeader title="AI 매장 점검 리포트" subtitle="선택한 기간의 주요 상황을 정리했어요" />
      <div className="page-body">
        <section className="card period-card">
          <div className="split-card">
            <strong className="period">{formatPeriod(period)}</strong>
            <div className="pill-group">
              {presets.map((preset) => (
                <button
                  type="button"
                  key={preset.label}
                  className="pill-button"
                  aria-pressed={isPresetActive(preset.days)}
                  onClick={() => changePeriod(getPresetPeriod(preset.days, now))}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <div className="date-fields">
            <label htmlFor="report-start">
              시작일
              <input
                id="report-start"
                type="date"
                value={draft.start}
                max={kstDay(now)}
                onChange={(event) => changePeriod({ ...draft, start: event.target.value })}
              />
            </label>
            <label htmlFor="report-end">
              종료일
              <input
                id="report-end"
                type="date"
                value={draft.end}
                max={kstDay(now)}
                onChange={(event) => changePeriod({ ...draft, end: event.target.value })}
              />
            </label>
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </section>

        {loadFailed && (
          <section className="card split-card">
            <p className="field-error">리포트를 불러오지 못했습니다.</p>
            <button type="button" className="pill-button" onClick={() => setRetryCount((count) => count + 1)}>
              다시 시도
            </button>
          </section>
        )}
        {!result && !loadFailed && <p className="card empty-note">불러오는 중입니다.</p>}
        {result && <ReportResult alerts={result.alerts} period={result.period} />}
      </div>
    </>
  )
}

import { useEffect, useState } from 'react'
import { AlertFeedEntry, SectionHead } from '../components/common'
import {
  getPresetPeriod,
  getRecentAlerts,
  getReportStats,
  getReportTrend,
  reportPresets,
  type ReportPresetId,
} from '../domain/rules'
import { formatPeriod } from '../domain/time'
import type { AlertItem, Camera, Period } from '../domain/types'

const HIGHLIGHT_COUNT = 6
const MIN_BAR_PERCENT = 5

function ReportResult({
  alerts,
  period,
  name,
  cameras,
  now,
}: {
  alerts: AlertItem[]
  period: Period
  name: string
  cameras: Camera[]
  now: Date
}) {
  const stats = getReportStats(alerts, period)
  const trend = getReportTrend(alerts, period)
  const highlights = getRecentAlerts(alerts, HIGHLIGHT_COUNT)

  return (
    <>
      <SectionHead title="감지 현황" />
      <div className="report-summary">
        <div className="eyebrow">{name} 감지 기록</div>
        <div className="big">
          {stats.detected}
          <small>건</small>
        </div>
        <div className="duo">
          <div>
            <div className="eyebrow">확인 완료</div>
            <div className="value">{stats.resolved}</div>
          </div>
          <div>
            <div className="eyebrow">확인 필요</div>
            <div className="value value--blue">{stats.unconfirmed}</div>
          </div>
        </div>
      </div>

      <SectionHead title="감지 추이" />
      <div className="chartbox">
        <div className="d-flex chartbox__head">
          <strong>기간별 감지 건수</strong>
          <span className="eyebrow">{formatPeriod(period)}</span>
        </div>
        {stats.detected === 0 ? (
          <p className="feed-empty">아직 집계된 이벤트가 없습니다.</p>
        ) : (
          <ol className="bars" aria-label="기간별 감지 건수">
            {trend.map((point) => (
              <li className="barcol" key={point.label}>
                <div className="barnum">{point.count}</div>
                <div className="bartrack">
                  <div
                    className={point.isPeak ? 'bar high' : 'bar'}
                    style={{ height: `${Math.max(MIN_BAR_PERCENT, point.ratio * 100)}%` }}
                  />
                </div>
                <div className="barname">{point.label}</div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <SectionHead title="주요 기록" />
      <div className="feed">
        {highlights.length === 0 ? (
          <p className="feed-empty">이 기간에 기록된 감지가 없습니다.</p>
        ) : (
          highlights.map((alert) => <AlertFeedEntry key={alert.id} alert={alert} cameras={cameras} now={now} />)
        )}
      </div>
    </>
  )
}

type Props = {
  loadAlerts: (period: Period) => Promise<AlertItem[]>
  cameras: Camera[]
  revision: number
  now: Date
}

export default function ReportPage({ loadAlerts, cameras, revision, now }: Props) {
  const [presetId, setPresetId] = useState<ReportPresetId>('week')
  const [result, setResult] = useState<{ alerts: AlertItem[]; period: Period; name: string } | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  const preset = reportPresets.find((item) => item.id === presetId)!
  const { start, end } = getPresetPeriod(preset.days, now)

  useEffect(() => {
    let stale = false
    const period = { start, end }
    loadAlerts(period).then(
      (alerts) => {
        if (stale) return
        setResult({ alerts, period, name: preset.name })
        setLoadFailed(false)
      },
      () => {
        if (!stale) setLoadFailed(true)
      },
    )
    return () => {
      stale = true
    }
  }, [loadAlerts, start, end, preset.name, revision, retryCount])

  return (
    <>
      <div className="page-intro page-intro--tight">
        <p className="subline subline--flat">감지 이벤트와 처리 현황을 확인하세요.</p>
      </div>
      <div className="periods" role="group" aria-label="기간 선택">
        {reportPresets.map((item) => (
          <button
            type="button"
            key={item.id}
            className={item.id === presetId ? 'active' : undefined}
            aria-pressed={item.id === presetId}
            onClick={() => setPresetId(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loadFailed && (
        <div className="load-failed">
          <p>리포트를 불러오지 못했습니다.</p>
          <button type="button" className="wide-action" onClick={() => setRetryCount((count) => count + 1)}>
            다시 시도
          </button>
        </div>
      )}
      {!result && !loadFailed && <p className="event-empty">불러오는 중입니다.</p>}
      {result && (
        <ReportResult alerts={result.alerts} period={result.period} name={result.name} cameras={cameras} now={now} />
      )}
    </>
  )
}

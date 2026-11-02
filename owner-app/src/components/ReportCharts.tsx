import { useState, type CSSProperties } from 'react'
import { alertKindLabels, alertKinds, type getDailyTrend, type getTimeTrend } from '../domain/rules'

type DailyPoint = ReturnType<typeof getDailyTrend>[number]
type TimePoint = ReturnType<typeof getTimeTrend>[number]

const DENSE_DAYS = 14
const DAY_LABEL_STEP = 5

function barStyle(ratio: number) {
  return { '--ratio': ratio } as CSSProperties
}

function kindBreakdown(point: TimePoint) {
  return alertKinds.map((kind) => `${alertKindLabels[kind]} ${point.byKind[kind]}`).join(' · ')
}

export function DailyChart({ points }: { points: DailyPoint[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const dense = points.length > DENSE_DAYS
  const active = activeIndex === null ? null : points[activeIndex]
  const peak = points.find((point) => point.isPeak)

  return (
    <>
      <p className="chart-readout" aria-live="polite">
        {active ? `${active.label}: ${active.count}건` : `가장 많은 날은 ${peak?.label}입니다 (${peak?.count}건)`}
      </p>
      <ol
        className={dense ? 'bar-chart bar-chart--dense' : 'bar-chart'}
        style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
        aria-label="일별 이벤트 수"
        onMouseLeave={() => setActiveIndex(null)}
      >
        {points.map((point, index) => (
          <li key={point.date}>
            <button
              type="button"
              aria-label={`${point.label} ${point.count}건`}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onClick={() => setActiveIndex(index)}
            >
              <span className="bar-chart__value">{!dense || point.isPeak ? `${point.count}건` : ''}</span>
              <span
                className={point.isPeak ? 'bar-chart__bar is-highlight' : 'bar-chart__bar'}
                style={barStyle(point.ratio)}
              />
              <span className="bar-chart__day">{!dense || index % DAY_LABEL_STEP === 0 ? point.label : ''}</span>
            </button>
          </li>
        ))}
      </ol>
    </>
  )
}

export function TimeChart({ points }: { points: TimePoint[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const active = activeIndex === null ? null : points[activeIndex]
  const peak = points.find((point) => point.isPeak)

  return (
    <>
      <p className="chart-readout" aria-live="polite">
        {active
          ? `${active.label}: ${active.count}건 (${kindBreakdown(active)})`
          : `가장 자주 발생한 시간대는 ${peak?.label}입니다 (${peak?.count}건)`}
      </p>
      <ol className="bar-chart bar-chart--time" aria-label="시간대별 이벤트 수" onMouseLeave={() => setActiveIndex(null)}>
        {points.map((point, index) => (
          <li key={point.label}>
            <button
              type="button"
              aria-label={`${point.label} ${point.count}건, ${kindBreakdown(point)}`}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onClick={() => setActiveIndex(index)}
            >
              <span className="bar-chart__value">{point.count}건</span>
              <span className="bar-chart__stack" style={barStyle(point.ratio)}>
                {alertKinds
                  .filter((kind) => point.byKind[kind] > 0)
                  .map((kind) => (
                    <span
                      key={kind}
                      className={`bar-chart__segment series--${kind}`}
                      style={{ flexGrow: point.byKind[kind] }}
                    />
                  ))}
              </span>
              <span className="bar-chart__day">{point.label}</span>
            </button>
          </li>
        ))}
      </ol>
      <ul className="chart-legend" aria-label="범례">
        {alertKinds.map((kind) => (
          <li key={kind}>
            <span className={`chart-legend__swatch series--${kind}`} aria-hidden />
            {alertKindLabels[kind]}
          </li>
        ))}
      </ul>
    </>
  )
}

export function DailyTable({ points }: { points: DailyPoint[] }) {
  return (
    <details className="chart-table">
      <summary>표로 보기</summary>
      <table>
        <thead>
          <tr>
            <th scope="col">날짜</th>
            <th scope="col">건수</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.date}>
              <th scope="row">{point.date}</th>
              <td>{point.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

export function TimeTable({ points }: { points: TimePoint[] }) {
  return (
    <details className="chart-table">
      <summary>표로 보기</summary>
      <table>
        <thead>
          <tr>
            <th scope="col">시간대</th>
            {alertKinds.map((kind) => (
              <th scope="col" key={kind}>
                {alertKindLabels[kind]}
              </th>
            ))}
            <th scope="col">합계</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.label}>
              <th scope="row">{point.label}</th>
              {alertKinds.map((kind) => (
                <td key={kind}>{point.byKind[kind]}</td>
              ))}
              <td>{point.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

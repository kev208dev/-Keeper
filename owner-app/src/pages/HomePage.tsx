import { Badge, PageHeader, StatRow } from '../components/common'
import { getHomeStats, getIntegrationBadge, getRecentActivities, getTodaySummary } from '../domain/rules'
import { formatKstDate } from '../domain/time'
import type { AlertItem, Inquiry, Integration, Store } from '../domain/types'

type Props = {
  store: Store
  integration: Integration
  alerts: AlertItem[]
  inquiries: Inquiry[]
  now: Date
  onLogout?: () => void
}

export default function HomePage({ store, integration, alerts, inquiries, now, onLogout }: Props) {
  const stats = getHomeStats(alerts, inquiries, now)
  const activities = getRecentActivities(alerts, now)
  const summary = getTodaySummary(stats.unconfirmedAlerts, integration)
  const badge = getIntegrationBadge(integration)

  return (
    <>
      <PageHeader title="매장 대시보드" subtitle="우리 매장의 오늘을 한눈에" />
      <div className="page-body">
        <section className="card store-card">
          <div>
            <h2>{store.name}</h2>
            <p className="caption">{formatKstDate(now)} · 실시간 운영 현황</p>
          </div>
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </section>

        <StatRow
          items={[
            { label: '오늘 감지', value: stats.detected, tone: 'blue' },
            { label: '미확인 알림', value: stats.unconfirmedAlerts, tone: 'red' },
            { label: '고객 문의', value: stats.inquiries, tone: 'ink' },
          ]}
        />

        <section className="card">
          <h2>최근 활동</h2>
          {activities.length === 0 ? (
            <p className="empty-note">아직 집계된 활동이 없습니다.</p>
          ) : (
            <ul className="activity-list">
              {activities.map((activity) => (
                <li key={activity.id}>
                  <span className={`dot dot--${activity.tone}`} aria-hidden />
                  <div className="activity-list__text">
                    <strong>{activity.title}</strong>
                    <span className="caption">{activity.status}</span>
                  </div>
                  <time className="caption">{activity.time}</time>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>AI 오늘의 요약</h2>
          <p className="caption">매장 운영 중 확인이 필요한 항목을 정리했어요.</p>
          <div className="callout">
            <strong>{summary.headline}</strong>
            <span>{summary.detail}</span>
          </div>
        </section>

        {onLogout && (
          <button type="button" className="logout-button" onClick={onLogout}>
            로그아웃
          </button>
        )}
      </div>
    </>
  )
}

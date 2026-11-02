import { Check } from 'lucide-react'
import { Badge, LinkButton, PageHeader } from '../components/common'
import { canViewClip, getDoorStatus, getVisibleAlerts } from '../domain/rules'
import { formatEventTime } from '../domain/time'
import type { AlertItem, Clip } from '../domain/types'

function AlertDetail({ alert, now }: { alert: AlertItem; now: Date }) {
  switch (alert.kind) {
    case 'movement':
      if (!alert.unpaid) return null
      return (
        <p className="alert-route">
          {alert.from} → {alert.to}
        </p>
      )
    case 'duration': {
      const door = getDoorStatus(alert, now)
      return (
        <>
          <div
            className="progress"
            role="progressbar"
            aria-label={alert.title}
            aria-valuenow={door.progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${door.progress}%` }} />
          </div>
          <p className="caption">{door.label}</p>
        </>
      )
    }
    case 'product':
      return <p className="alert-product">감지 상품: {alert.product ?? '상품 확인 불가'}</p>
  }
}

type Props = {
  alerts: AlertItem[]
  clips: Clip[]
  now: Date
  onConfirm: (id: string) => void
  onOpenClip: (alertId: string) => void
}

export default function AlertsPage({ alerts, clips, now, onConfirm, onOpenClip }: Props) {
  const visible = getVisibleAlerts(alerts, now)

  return (
    <>
      <PageHeader title="AI 이상행동 알림" subtitle="매장 내 이상행동을 AI가 실시간으로 알려드립니다" />
      <div className="page-body">
        {visible.length === 0 && <p className="card empty-note">아직 집계된 알림이 없습니다.</p>}
        {visible.map((alert) => (
          <article className="card notice" key={alert.id}>
            <div className="notice__head">
              <Badge tone={alert.tone}>{alert.label}</Badge>
              <time className="caption">{formatEventTime(alert.occurredAt, now)}</time>
            </div>
            <h2 className="notice__title">{alert.title}</h2>
            <AlertDetail alert={alert} now={now} />
            <div className="notice__foot">
              {canViewClip(alert, clips) ? (
                <LinkButton onClick={() => onOpenClip(alert.id)}>영상 클립 확인</LinkButton>
              ) : (
                <span />
              )}
              {alert.confirmed ? (
                <span className="confirmed-tag">
                  <Check size={13} strokeWidth={2.6} aria-hidden />
                  확인됨
                </span>
              ) : (
                <button
                  type="button"
                  className="confirm-button"
                  aria-label={`${alert.title} 확인 완료`}
                  onClick={() => onConfirm(alert.id)}
                >
                  확인 완료
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  )
}

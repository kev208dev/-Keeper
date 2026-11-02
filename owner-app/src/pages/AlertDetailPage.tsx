import { useEffect, useState } from 'react'
import type { AlertDetail } from '../api/types'
import CameraPreview from '../components/CameraPreview'
import { SectionHead } from '../components/common'
import { getAlertFacts, getAlertGuide, getAlertStatus, getCameraLabel, getDoorStatus } from '../domain/rules'
import { formatEventTime } from '../domain/time'
import type { AlertItem, Camera, Clip, Resolution } from '../domain/types'

function clipCaption(clip: Clip | null): string {
  return clip ? `감지 클립 ${clip.duration}` : '감지 클립이 아직 없습니다'
}

type DetailProps = {
  alert: AlertItem
  clip: Clip | null
  cameras: Camera[]
  now: Date
  onResolve: (id: string, resolution: Resolution) => void
}

function Detail({ alert, clip, cameras, now, onResolve }: DetailProps) {
  const status = getAlertStatus(alert)
  const camera = cameras.find((item) => item.id === alert.cameraId)
  // 결제가 확인된 상품 이동은 영상과 정황을 보여주지 않는다
  const showPreview = alert.kind !== 'movement' || alert.unpaid

  return (
    <>
      <div className="detail-hero">
        <span className={status.done ? 'tag green' : 'tag orange'}>{status.label}</span>
        <h1 className="detail-title">{alert.title}</h1>
        <div className="subline">
          {formatEventTime(alert.occurredAt, now)} · {getCameraLabel(cameras, alert.cameraId)}
        </div>
      </div>

      {showPreview && (
        <div className="page-x detail-preview">
          <CameraPreview
            title={camera?.location ?? alert.cameraId}
            caption={clipCaption(clip)}
            connected={camera?.status === 'connected'}
          />
        </div>
      )}

      <SectionHead title="감지 정보" />
      <div className="details">
        {getAlertFacts(alert, cameras, now).map((fact) => (
          <div className="detail-line" key={fact.label}>
            <span>{fact.label}</span>
            <b>{fact.value}</b>
          </div>
        ))}
      </div>
      {alert.kind === 'duration' && (
        <div
          className="door-progress"
          role="progressbar"
          aria-label="문 개방 시간"
          aria-valuenow={getDoorStatus(alert, now).progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${getDoorStatus(alert, now).progress}%` }} />
        </div>
      )}

      <SectionHead title="확인 안내" />
      <div className="explain">{getAlertGuide(alert)}</div>
      <div className="action-bottom">
        <button type="button" className="btn" disabled={status.done} onClick={() => onResolve(alert.id, 'normal')}>
          정상 행동
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={status.done}
          onClick={() => onResolve(alert.id, 'confirmed')}
        >
          {status.done ? '처리 완료' : '확인 완료'}
        </button>
      </div>
    </>
  )
}

type Props = {
  alertId: string
  alerts: AlertItem[]
  clips: Clip[]
  cameras: Camera[]
  now: Date
  revision: number
  loadAlert: (id: string) => Promise<AlertDetail>
  onResolve: (id: string, resolution: Resolution) => void
}

export default function AlertDetailPage({ alertId, alerts, clips, cameras, now, revision, loadAlert, onResolve }: Props) {
  const inDashboard = alerts.find((alert) => alert.id === alertId)
  const [loaded, setLoaded] = useState<AlertDetail | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (inDashboard) return
    let stale = false
    loadAlert(alertId).then(
      (detail) => {
        if (!stale) setLoaded(detail)
      },
      () => {
        if (!stale) setMissing(true)
      },
    )
    return () => {
      stale = true
    }
  }, [alertId, inDashboard, loadAlert, revision])

  if (inDashboard) {
    const clip = clips.find((item) => item.alertId === alertId) ?? null
    return <Detail alert={inDashboard} clip={clip} cameras={cameras} now={now} onResolve={onResolve} />
  }
  if (loaded?.alert.id === alertId) {
    return <Detail alert={loaded.alert} clip={loaded.clip} cameras={cameras} now={now} onResolve={onResolve} />
  }
  return <p className="event-empty">{missing ? '알림을 찾을 수 없습니다.' : '불러오는 중입니다.'}</p>
}

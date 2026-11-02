import { useState } from 'react'
import { alertIcons } from '../components/common'
import { Chevron, Icon } from '../components/icons'
import {
  filterAlerts,
  getAlertDescription,
  getAlertStatus,
  getCameraLabel,
  getVisibleAlerts,
  groupAlertsByDay,
} from '../domain/rules'
import { formatEventTime } from '../domain/time'
import type { AlertFilter, AlertItem, Camera } from '../domain/types'
import { NOTIFICATION_SETTINGS_HASH, alertHash } from '../tabs'

const filters: { id: AlertFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'pending', label: '확인 필요' },
  { id: 'done', label: '확인 완료' },
]

type Props = {
  alerts: AlertItem[]
  cameras: Camera[]
  now: Date
}

export default function AlertsPage({ alerts, cameras, now }: Props) {
  const [filter, setFilter] = useState<AlertFilter>('all')
  const visible = getVisibleAlerts(alerts, now)
  const groups = groupAlertsByDay(filterAlerts(visible, filter), now)

  return (
    <>
      <div className="glass-alert-header">
        <div className="notice-top">
          <h1>알림</h1>
          <a href={NOTIFICATION_SETTINGS_HASH}>
            알림 설정 <Chevron size={16} />
          </a>
        </div>
        <div className="tabbar" role="group" aria-label="알림 필터">
          {filters.map((item) => (
            <button
              type="button"
              key={item.id}
              className={item.id === filter ? 'active' : undefined}
              aria-pressed={item.id === filter}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 && (
        <p className="event-empty">
          {visible.length === 0 ? '아직 집계된 알림이 없습니다.' : '해당하는 알림이 없습니다.'}
        </p>
      )}
      {groups.map((group) => (
        <section key={group.day}>
          <div className="event-intro">{group.label}</div>
          <div className="event-list">
            {group.alerts.map((alert) => {
              const status = getAlertStatus(alert)
              return (
                <a className="alert-entry" key={alert.id} href={alertHash(alert.id)}>
                  <span className={status.done ? 'event-icon green' : 'event-icon'}>
                    <Icon name={alertIcons[alert.kind]} size={22} />
                  </span>
                  <span className="event-main">
                    <div className="event-title">{alert.title}</div>
                    <div className="event-desc">{getAlertDescription(alert, now)}</div>
                    <div className="event-meta">{getCameraLabel(cameras, alert.cameraId)}</div>
                  </span>
                  <span className="event-side">
                    <time>{formatEventTime(alert.occurredAt, now)}</time>
                    <span className={status.done ? 'event-state done' : 'event-state'}>{status.label}</span>
                  </span>
                </a>
              )
            })}
          </div>
        </section>
      ))}

      <div className="context-note">
        <Icon name="information" size={15} />
        AI 감지 결과는 확인을 돕는 정보입니다. 영상만으로 도난 여부를 단정하지 않습니다.
      </div>
    </>
  )
}

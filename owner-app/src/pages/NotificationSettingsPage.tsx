import type { NotificationSettings } from '../domain/types'

const rows: { key: keyof NotificationSettings; name: string; desc: string }[] = [
  { key: 'push', name: '푸시 알림', desc: '중요한 매장 상황을 브라우저 알림으로 받아요.' },
  { key: 'alert', name: '이상 행동 감지', desc: 'AI가 확인이 필요한 움직임을 감지했을 때' },
  { key: 'door', name: '냉동고 문 개방', desc: '문이 오랜 시간 열려 있을 때' },
  { key: 'inquiry', name: '고객 문의', desc: '새로운 고객 문의가 접수됐을 때' },
  { key: 'camera', name: '카메라 연결 상태', desc: 'CCTV 연결이 끊기거나 복구됐을 때' },
  { key: 'sound', name: '알림 소리', desc: '알림이 도착할 때 소리를 재생해요.' },
]

type Props = {
  settings: NotificationSettings
  onChange: (key: keyof NotificationSettings, enabled: boolean) => void
}

export default function NotificationSettingsPage({ settings, onChange }: Props) {
  return (
    <>
      <div className="simple-intro simple-intro--tight">
        <p>매장에 필요한 알림만 받아보세요.</p>
      </div>
      <div className="flat-list flat-group">
        {rows.map((row) => (
          <div className="flat-row" key={row.key}>
            <div className="left">
              <div className="name">{row.name}</div>
              <div className="desc">{row.desc}</div>
            </div>
            <button
              type="button"
              role="switch"
              className="switch"
              aria-checked={settings[row.key]}
              aria-label={row.name}
              onClick={() => onChange(row.key, !settings[row.key])}
            />
          </div>
        ))}
      </div>
      <div className="context-note">
        설정은 매장 계정에 저장됩니다. 앱이 열려 있는 동안 화면 안내와 소리, 브라우저 알림으로 받을 수 있어요. 앱을 닫았을 때
        오는 휴대폰 푸시는 아직 지원하지 않습니다.
      </div>
    </>
  )
}

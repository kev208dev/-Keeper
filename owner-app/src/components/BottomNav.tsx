import type { TabId } from '../tabs'
import { Icon, type IconName } from './icons'

const items: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'home', label: '홈', icon: 'home' },
  { id: 'cctv', label: 'CCTV', icon: 'video' },
  { id: 'alerts', label: '알림', icon: 'bell' },
  { id: 'inquiries', label: '문의', icon: 'chatProcessing' },
  { id: 'report', label: '리포트', icon: 'chartBar' },
]

type Props = {
  active: string
  hasPendingAlerts: boolean
}

export default function BottomNav({ active, hasPendingAlerts }: Props) {
  return (
    <nav className="floating-nav" aria-label="하단 메뉴">
      {items.map(({ id, label, icon }) => {
        const isActive = id === active
        return (
          <a key={id} className={isActive ? 'navitem active' : 'navitem'} aria-current={isActive ? 'page' : undefined} href={`#${id}`}>
            <Icon name={icon} />
            <span>{label}</span>
            {id === 'alerts' && hasPendingAlerts && <i className="navbadge" aria-hidden />}
          </a>
        )
      })}
    </nav>
  )
}

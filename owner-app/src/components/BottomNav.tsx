import { Bell, ChartNoAxesColumn, House, MessageSquareText, SquareSquare } from 'lucide-react'
import type { TabId } from '../tabs'

const items: { id: TabId; label: string; icon: typeof House }[] = [
  { id: 'home', label: '홈', icon: House },
  { id: 'cctv', label: 'CCTV', icon: SquareSquare },
  { id: 'alerts', label: '알림', icon: Bell },
  { id: 'inquiries', label: '문의', icon: MessageSquareText },
  { id: 'report', label: '리포트', icon: ChartNoAxesColumn },
]

type Props = {
  active: TabId
  onChange: (tab: TabId) => void
}

export default function BottomNav({ active, onChange }: Props) {
  return (
    <nav className="tabbar" aria-label="주요 메뉴">
      {items.map(({ id, label, icon: Icon }) => {
        const isActive = id === active
        return (
          <button
            type="button"
            key={id}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onChange(id)}
          >
            <Icon size={20} strokeWidth={1.8} fill={isActive && id === 'alerts' ? 'currentColor' : 'none'} aria-hidden />
            {label}
          </button>
        )
      })}
    </nav>
  )
}

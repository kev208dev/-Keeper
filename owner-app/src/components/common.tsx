import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Tone } from '../domain/types'

export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="page-header">
      <div className="page-header__top">
        <span className="logo">#Keeper</span>
        <span className="page-header__role">점주 앱</span>
      </div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  )
}

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>
}

type LinkButtonProps = {
  children: ReactNode
  expanded?: boolean
  onClick?: () => void
}

export function LinkButton({ children, expanded, onClick }: LinkButtonProps) {
  return (
    <button type="button" className="link-button" aria-expanded={expanded} onClick={onClick}>
      {children}
      <ArrowRight size={14} strokeWidth={2.2} aria-hidden />
    </button>
  )
}

export function StatRow({ items }: { items: { label: string; value: number; tone: 'blue' | 'red' | 'ink' }[] }) {
  return (
    <div className="stat-row">
      {items.map((item) => (
        <div className="card stat" key={item.label}>
          <span className="stat__label">{item.label}</span>
          <strong className={`stat__value stat__value--${item.tone}`}>
            {String(item.value).padStart(2, '0')}건
          </strong>
        </div>
      ))}
    </div>
  )
}

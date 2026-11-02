import type { ReactNode } from 'react'
import { getAlertStatus, getCameraLabel } from '../domain/rules'
import { formatEventTime, formatKstTime } from '../domain/time'
import type { AlertItem, AlertKind, Camera } from '../domain/types'
import { alertHash } from '../tabs'
import { BackArrow, Chevron, Icon, type IconName } from './icons'

export const alertIcons: Record<AlertKind, IconName> = {
  movement: 'cctv',
  duration: 'door',
  product: 'alert',
}

// 데스크톱의 휴대폰 틀에서만 보인다. 실제 휴대폰에서는 기기의 상태 표시줄을 쓴다
export function StatusBar({ now }: { now: Date }) {
  return (
    <div className="statusbar" aria-hidden>
      <span>{formatKstTime(now).split(' ')[1]}</span>
      <div className="status-right">
        <span className="signal">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="battery">
          <i />
        </span>
      </div>
    </div>
  )
}

type TopBarProps = {
  title?: string
  hasPendingAlerts: boolean
}

export function TopBar({ title, hasPendingAlerts }: TopBarProps) {
  return (
    <header className="topbar">
      {title ? (
        <span className="header-title">{title}</span>
      ) : (
        <a className="brand" href="#home">
          #Keeper<b>.</b>
        </a>
      )}
      <div className="header-actions">
        <a className="header-icon" aria-label="알림 목록" href="#alerts">
          <Icon name="bell" size={22} />
          {hasPendingAlerts && <i className="noti-dot" aria-hidden />}
        </a>
        <a className="header-icon" aria-label="설정" href="#settings">
          <Icon name="cog" size={20} />
        </a>
      </div>
    </header>
  )
}

export function BackBar({ title, href }: { title: string; href: string }) {
  return (
    <header className="topbar">
      <div className="back-head">
        <a className="back" href={href} aria-label="뒤로 가기">
          <BackArrow />
        </a>
        <span className="header-label">{title}</span>
        <span className="head-right" />
      </div>
    </header>
  )
}

export function SectionHead({ title, link }: { title: string; link?: { label: string; href: string } }) {
  return (
    <div className="section">
      <div className="section-row">
        <h2 className="section-title">{title}</h2>
        {link && (
          <a className="more" href={link.href}>
            {link.label} <Chevron size={15} />
          </a>
        )}
      </div>
    </div>
  )
}

export function AlertFeedEntry({ alert, cameras, now }: { alert: AlertItem; cameras: Camera[]; now: Date }) {
  const status = getAlertStatus(alert)
  return (
    <a className="feed-entry" href={alertHash(alert.id)}>
      <span className={status.done ? 'link-icon green' : 'link-icon orange'}>
        <Icon name={alertIcons[alert.kind]} size={20} />
      </span>
      <span className="item-grow">
        <div className="feed-title">{alert.title}</div>
        <div className="feed-description">
          {getCameraLabel(cameras, alert.cameraId)} · {formatEventTime(alert.occurredAt, now)} · {status.label}
        </div>
      </span>
      <Chevron />
    </a>
  )
}

type SheetProps = {
  title: string
  description?: string
  children?: ReactNode
  onClose: () => void
}

export function Sheet({ title, description, children, onClose }: SheetProps) {
  return (
    <div
      className="modal-back show"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
        {children}
        <button type="button" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  )
}

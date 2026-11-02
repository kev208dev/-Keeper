import { useState } from 'react'
import CameraPreview from '../components/CameraPreview'
import { AlertFeedEntry, SectionHead, Sheet } from '../components/common'
import { Chevron, Icon } from '../components/icons'
import {
  getConnectedCount,
  getHomeCaption,
  getHomeStats,
  getIntegrationBadge,
  getRecentAlerts,
} from '../domain/rules'
import { formatKstDate } from '../domain/time'
import type { AlertItem, Camera, Inquiry, Integration, Store } from '../domain/types'

type Props = {
  store: Store
  integration: Integration
  cameras: Camera[]
  alerts: AlertItem[]
  inquiries: Inquiry[]
  now: Date
}

export default function HomePage({ store, integration, cameras, alerts, inquiries, now }: Props) {
  const [showStore, setShowStore] = useState(false)
  const stats = getHomeStats(alerts, inquiries, now)
  const badge = getIntegrationBadge(integration)
  const connected = getConnectedCount(cameras)
  const recent = getRecentAlerts(alerts)
  const [firstCamera] = cameras

  return (
    <>
      <div className="today-head">
        <div>
          <div className="today-label">{formatKstDate(now)} · 매장 현황</div>
          <div className="today-store">
            {store.name}
            <button type="button" className="today-store__more" aria-label="매장 선택" onClick={() => setShowStore(true)}>
              <Chevron size={20} />
            </button>
          </div>
        </div>
        <div className={`today-state today-state--${badge.tone}`}>
          <i />
          {badge.label}
        </div>
      </div>

      <a className="home-main" href="#alerts">
        <div className="eyebrow">지금 확인할 알림</div>
        <strong className="num">
          <span>{stats.unconfirmedAlerts}</span>건
        </strong>
        <div className="mini">{getHomeCaption(cameras, alerts, now)}</div>
        <span className="home-main-visual">
          <Icon name="bell" />
        </span>
        <div className="main-cta">
          알림 확인하기 <Chevron size={17} />
        </div>
      </a>

      <SectionHead title="빠른 메뉴" />
      <div className="primary-actions">
        <a className="feature blue" href="#cctv">
          <span className="feature-symbol">
            <Icon name="video" size={22} />
          </span>
          <span>
            <div className="feature-name">실시간 CCTV</div>
            <div className="feature-sub">연결된 카메라 {connected}대</div>
          </span>
        </a>
        <a className="feature mint" href="#inquiries">
          <span className="feature-symbol">
            <Icon name="chatProcessing" size={22} />
          </span>
          <span>
            <div className="feature-name">고객 문의</div>
            <div className="feature-sub">접수된 문의 {inquiries.length}건</div>
          </span>
        </a>
      </div>

      <SectionHead title="오늘의 기록" link={{ label: '리포트', href: '#report' }} />
      <div className="mini-stats">
        {[
          { label: '감지 이벤트', value: stats.detected, unit: '건' },
          { label: '확인 필요', value: stats.unconfirmedAlerts, unit: '건' },
          { label: '연결 상태', value: connected, unit: '대' },
        ].map((item) => (
          <div className="mini-stat" key={item.label}>
            <div className="stat-lab">{item.label}</div>
            <div className="stat-val">
              <span className="metric-number">{item.value}</span>
              <span className="metric-unit">{item.unit}</span>
            </div>
          </div>
        ))}
      </div>

      <SectionHead title="최근 감지" link={{ label: '전체 보기', href: '#alerts' }} />
      <div className="feed">
        {recent.length === 0 ? (
          <p className="feed-empty">아직 집계된 활동이 없습니다.</p>
        ) : (
          recent.map((alert) => <AlertFeedEntry key={alert.id} alert={alert} cameras={cameras} now={now} />)
        )}
      </div>

      <SectionHead title="매장 카메라" link={{ label: '전체 보기', href: '#cctv' }} />
      <div className="page-x">
        {firstCamera ? (
          <a aria-label="카메라 화면 열기" href="#cctv">
            <CameraPreview
              title={firstCamera.location}
              caption={firstCamera.name}
              connected={firstCamera.status === 'connected'}
            />
          </a>
        ) : (
          <p className="feed-empty feed-empty--card">등록된 카메라가 없습니다.</p>
        )}
      </div>

      {showStore && (
        <Sheet
          title="매장 선택"
          description={`연결된 매장은 ${store.name} 1곳입니다.`}
          onClose={() => setShowStore(false)}
        />
      )}
    </>
  )
}

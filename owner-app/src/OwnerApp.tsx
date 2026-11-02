import { useEffect, useRef, useState } from 'react'
import type { KeeperApi } from './api/types'
import BottomNav from './components/BottomNav'
import { getClipView, getIntegrationNotice, getTodayClips } from './domain/rules'
import { useDashboard } from './hooks/useDashboard'
import { useNow } from './hooks/useNow'
import AlertsPage from './pages/AlertsPage'
import CctvPage from './pages/CctvPage'
import HomePage from './pages/HomePage'
import InquiriesPage from './pages/InquiriesPage'
import ReportPage from './pages/ReportPage'
import { isTabId, type TabId } from './tabs'

function tabFromHash(): TabId {
  const hash = window.location.hash.slice(1)
  return isTabId(hash) ? hash : 'home'
}

type Props = {
  api: KeeperApi
  startAt: Date
  pollMs: number
  onUnauthorized?: () => void
  onLogout?: () => void
}

export default function OwnerApp({ api, startAt, pollMs, onUnauthorized, onLogout }: Props) {
  const now = useNow(startAt)
  const { data, failed, revision, refresh, confirmAlert, markInquiryRead } = useDashboard(api, now, {
    pollMs,
    onUnauthorized,
  })
  const [tab, setTab] = useState<TabId>(tabFromHash)
  const [cameraId, setCameraId] = useState<string | null>(null)
  const [clipId, setClipId] = useState<string | null>(null)
  const screenRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const onHashChange = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    screenRef.current?.scrollTo(0, 0)
  }, [tab])

  if (!data) {
    return (
      <div className="app">
        <main className="status-screen">
          {failed ? (
            <>
              <p>서버에 연결할 수 없습니다.</p>
              <button type="button" className="pill-button" onClick={() => void refresh()}>
                다시 시도
              </button>
            </>
          ) : (
            <p>불러오는 중입니다.</p>
          )}
        </main>
      </div>
    )
  }

  const { store, integration, cameras, alerts, clips, inquiries } = data
  const notice = failed
    ? '서버에 연결할 수 없습니다. 마지막으로 받은 내용을 보여주고 있어요.'
    : getIntegrationNotice(integration, now)

  const goToTab = (next: TabId) => {
    setTab(next)
    window.location.hash = next
  }

  const selectCamera = (id: string) => {
    setCameraId(id)
    setClipId(null)
  }

  const playClip = (id: string) => {
    const view = getClipView(clips.find((clip) => clip.id === id)!, alerts, now)
    setCameraId(view?.cameraId ?? cameraId)
    setClipId(id)
  }

  const openAlertClip = (alertId: string) => {
    playClip(clips.find((clip) => clip.alertId === alertId)!.id)
    goToTab('cctv')
  }

  const activeClip = clips.find((clip) => clip.id === clipId)

  return (
    <div className="app">
      {notice && (
        <p className="connection-banner" role="status">
          {notice}
        </p>
      )}
      <main className="screen" ref={screenRef}>
        {tab === 'home' && (
          <HomePage
            store={store}
            integration={integration}
            alerts={alerts}
            inquiries={inquiries}
            now={now}
            onLogout={onLogout}
          />
        )}
        {tab === 'cctv' && (
          <CctvPage
            cameras={cameras}
            clips={getTodayClips(clips, alerts, now)}
            cameraId={cameraId}
            activeClip={activeClip ? getClipView(activeClip, alerts, now) : null}
            onSelectCamera={selectCamera}
            onPlayClip={playClip}
            onBackToLive={() => setClipId(null)}
          />
        )}
        {tab === 'alerts' && (
          <AlertsPage
            alerts={alerts}
            clips={clips}
            now={now}
            onConfirm={(id) => void confirmAlert(id)}
            onOpenClip={openAlertClip}
          />
        )}
        {tab === 'inquiries' && (
          <InquiriesPage inquiries={inquiries} now={now} onRead={(id) => void markInquiryRead(id)} />
        )}
        {tab === 'report' && <ReportPage loadAlerts={api.getAlerts} revision={revision} now={now} />}
      </main>
      <BottomNav active={tab} onChange={goToTab} />
    </div>
  )
}

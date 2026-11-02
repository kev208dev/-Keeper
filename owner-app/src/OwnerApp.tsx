import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeeperApi } from './api/types'
import BottomNav from './components/BottomNav'
import { BackBar, StatusBar, TopBar } from './components/common'
import { getIntegrationNotice, getTodayClips } from './domain/rules'
import type { NotificationSettings, Resolution } from './domain/types'
import { useDashboard } from './hooks/useDashboard'
import { useNotifier } from './hooks/useNotifier'
import { useNow } from './hooks/useNow'
import { requestPushPermission } from './notifications'
import AlertDetailPage from './pages/AlertDetailPage'
import AlertsPage from './pages/AlertsPage'
import CctvPage from './pages/CctvPage'
import HomePage from './pages/HomePage'
import InquiriesPage from './pages/InquiriesPage'
import NoticesPage from './pages/NoticesPage'
import NotificationSettingsPage from './pages/NotificationSettingsPage'
import ReportPage from './pages/ReportPage'
import SettingsPage from './pages/SettingsPage'
import { parseRoute, type Route } from './tabs'

const TOAST_MS = 2300

type Layout = {
  className: string
  nav: boolean
  title?: string
  topBar?: boolean
  back?: { title: string; fallback: string }
}

const layouts: Record<Route['page'], Layout> = {
  home: { className: '', nav: true, topBar: true },
  cctv: { className: '', nav: true, topBar: true, title: '실시간 CCTV' },
  alerts: { className: 'inner-page alerts-page', nav: true },
  alertDetail: {
    className: 'inner-page plain-page detail-v7',
    nav: false,
    back: { title: '알림 상세', fallback: '#alerts' },
  },
  inquiries: { className: '', nav: true, topBar: true, title: '고객 문의' },
  report: { className: '', nav: true, topBar: true, title: '운영 리포트' },
  settings: { className: 'inner-page settings-v7', nav: true, topBar: true, title: '설정' },
  notificationSettings: {
    className: 'inner-page plain-page',
    nav: false,
    back: { title: '알림 설정', fallback: '#settings' },
  },
  notices: {
    className: 'inner-page plain-page',
    nav: false,
    back: { title: '공지사항', fallback: '#settings' },
  },
}

const resolutionMessages: Record<Resolution, string> = {
  confirmed: '확인 완료로 처리했어요',
  normal: '정상 행동으로 기록했어요',
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
  const {
    data,
    failed,
    revision,
    refresh,
    confirmAlert,
    markInquiryRead,
    replyInquiry,
    renameStore,
    updateNotificationSettings,
  } = useDashboard(api, now, { pollMs, onUnauthorized })
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))
  const [previousHash, setPreviousHash] = useState<string | null>(null)
  const [cameraId, setCameraId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const screenRef = useRef<HTMLDivElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const showToast = useCallback((message: string) => {
    setToast(message)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS)
  }, [])

  useNotifier(data, showToast)

  useEffect(() => {
    const onHashChange = (event: HashChangeEvent) => {
      setPreviousHash(new URL(event.oldURL).hash || '#home')
      setRoute(parseRoute(window.location.hash))
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    screenRef.current?.scrollTo(0, 0)
  }, [route])

  if (!data) {
    return (
      <main className="device">
        <div className="status-screen">
          {failed ? (
            <>
              <p>서버에 연결할 수 없습니다.</p>
              <button type="button" className="wide-action" onClick={() => void refresh()}>
                다시 시도
              </button>
            </>
          ) : (
            <p>불러오는 중입니다.</p>
          )}
        </div>
      </main>
    )
  }

  const { store, integration, cameras, alerts, clips, inquiries, notificationSettings } = data
  const layout = layouts[route.page]
  const hasPendingAlerts = alerts.some((alert) => !alert.confirmed)
  const notice = failed
    ? '서버에 연결할 수 없습니다. 마지막으로 받은 내용을 보여주고 있어요.'
    : getIntegrationNotice(integration, now)

  const resolveAlert = async (id: string, resolution: Resolution) => {
    if (await confirmAlert(id, resolution)) showToast(resolutionMessages[resolution])
    else showToast('처리하지 못했습니다. 다시 시도해 주세요.')
  }

  const sendReply = async (id: string, body: string) => {
    const sent = await replyInquiry(id, body)
    showToast(sent ? '답변을 보냈어요' : '답변을 보내지 못했습니다. 다시 시도해 주세요.')
    return sent
  }

  const changeSetting = async (key: keyof NotificationSettings, enabled: boolean) => {
    if (key === 'push' && enabled && !(await requestPushPermission())) {
      showToast('브라우저에서 알림을 허용해야 받을 수 있어요')
      return
    }
    const saved = await updateNotificationSettings({ ...notificationSettings, [key]: enabled })
    if (!saved) showToast('설정을 저장하지 못했습니다.')
  }

  return (
    <main className={`device ${layout.className}`.trim()}>
      <StatusBar now={now} />
      {layout.topBar && <TopBar title={layout.title} hasPendingAlerts={hasPendingAlerts} />}
      {layout.back && <BackBar title={layout.back.title} href={previousHash ?? layout.back.fallback} />}
      <div className="scroll" ref={screenRef}>
        {notice && (
          <p className="connection-banner" role="status">
            {notice}
          </p>
        )}
        {route.page === 'home' && (
          <HomePage
            store={store}
            integration={integration}
            cameras={cameras}
            alerts={alerts}
            inquiries={inquiries}
            now={now}
          />
        )}
        {route.page === 'cctv' && (
          <CctvPage
            cameras={cameras}
            clips={getTodayClips(clips, alerts, now)}
            cameraId={cameraId}
            onSelectCamera={setCameraId}
          />
        )}
        {route.page === 'alerts' && <AlertsPage alerts={alerts} cameras={cameras} now={now} />}
        {route.page === 'alertDetail' && (
          <AlertDetailPage
            key={route.alertId}
            alertId={route.alertId}
            alerts={alerts}
            clips={clips}
            cameras={cameras}
            now={now}
            revision={revision}
            loadAlert={api.getAlert}
            onResolve={(id, resolution) => void resolveAlert(id, resolution)}
          />
        )}
        {route.page === 'inquiries' && (
          <InquiriesPage
            inquiries={inquiries}
            now={now}
            onRead={(id) => void markInquiryRead(id)}
            onReply={sendReply}
          />
        )}
        {route.page === 'report' && (
          <ReportPage loadAlerts={api.getAlerts} cameras={cameras} revision={revision} now={now} />
        )}
        {route.page === 'settings' && (
          <SettingsPage
            store={store}
            integration={integration}
            cameras={cameras}
            onRename={renameStore}
            onLogout={onLogout}
          />
        )}
        {route.page === 'notificationSettings' && (
          <NotificationSettingsPage
            settings={notificationSettings}
            onChange={(key, enabled) => void changeSetting(key, enabled)}
          />
        )}
        {route.page === 'notices' && <NoticesPage loadNotices={api.getNotices} />}
      </div>
      {layout.nav && <BottomNav active={route.page} hasPendingAlerts={hasPendingAlerts} />}
      <div className="home-indicator" aria-hidden />
      <div className={toast ? 'toast show' : 'toast'} role="status" aria-live="polite">
        {toast}
      </div>
    </main>
  )
}

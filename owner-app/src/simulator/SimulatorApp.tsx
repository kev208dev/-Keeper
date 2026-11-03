import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, createHttpApi } from '../api/httpApi'
import { clearToken, readToken, saveToken } from '../api/session'
import { formatKstTime, kstDayStart } from '../domain/time'
import type { Camera } from '../domain/types'
import LoginPage from '../pages/LoginPage'
import { createDeviceApi, forgetDeviceKey, loadDeviceKey, type WaitingReply } from './deviceApi'
import {
  buildScenario,
  cameraEvent,
  clipEvent,
  damageEvent,
  doorClosedEvent,
  doorOpenEvent,
  inquiryEvent,
  movementEvent,
  newEventId,
  SIM_CAMERAS,
  type DeviceEvent,
} from './events'

const API_BASE_URL = import.meta.env.VITE_API_URL ?? ''
const REPLY_POLL_MS = 5_000
const STEP_MS = 2_000
const MAX_LOG = 100

type LogEntry = {
  id: number
  time: string
  message: string
  result: string
  failed: boolean
}

function occurredNow(): string {
  return new Date().toISOString()
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function SimulatorPage({
  token,
  stepMs,
  onUnauthorized,
}: {
  token: string
  stepMs: number
  onUnauthorized: () => void
}) {
  const owner = useMemo(() => createHttpApi(API_BASE_URL, token), [token])
  const [deviceKey, setDeviceKey] = useState<string | null>(null)
  const device = useMemo(() => (deviceKey ? createDeviceApi(API_BASE_URL, deviceKey) : null), [deviceKey])
  const [storeName, setStoreName] = useState<string | null>(null)
  const [cameras, setCameras] = useState<Camera[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [replies, setReplies] = useState<WaitingReply[]>([])
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [sending, setSending] = useState(false)
  const [movementId, setMovementId] = useState<string | null>(null)
  const [doorId, setDoorId] = useState<string | null>(null)
  const logCount = useRef(0)
  const stopped = useRef(false)

  const addLog = useCallback((message: string, result: string, failed = false) => {
    logCount.current += 1
    const entry = { id: logCount.current, time: formatKstTime(new Date()), message, result, failed }
    setLog((current) => [entry, ...current].slice(0, MAX_LOG))
  }, [])

  const handleOwnerFailure = useCallback(
    (failure: unknown) => {
      if (failure instanceof ApiError && failure.status === 401) onUnauthorized()
      else if (failure instanceof ApiError && failure.status === 429) {
        setProblem('기기 키를 너무 많이 만들었습니다. 잠시 후 다시 시도하세요.')
      } else setProblem('서버에 연결할 수 없습니다.')
    },
    [onUnauthorized],
  )

  // 서버 DB가 바뀌면 저장해 둔 키가 무효가 되므로 새로 발급받는다
  const handleDeviceFailure = useCallback((failure: unknown) => {
    if (failure instanceof ApiError && failure.status === 401) {
      forgetDeviceKey()
      setDeviceKey(null)
    } else setProblem('서버에 연결할 수 없습니다.')
  }, [])

  const refresh = useCallback(async () => {
    try {
      const dashboard = await owner.getDashboard(kstDayStart(new Date()))
      setStoreName(dashboard.store.name)
      setCameras(dashboard.cameras)
    } catch (failure) {
      handleOwnerFailure(failure)
    }
  }, [owner, handleOwnerFailure])

  useEffect(() => {
    if (deviceKey) return
    let active = true
    loadDeviceKey(API_BASE_URL, token)
      .then((key) => {
        if (active) setDeviceKey(key)
      })
      .catch((failure) => {
        if (active) handleOwnerFailure(failure)
      })
    return () => {
      active = false
    }
  }, [deviceKey, token, handleOwnerFailure])

  useEffect(() => {
    if (!device) return
    const listen = async () => {
      try {
        const received = await device.receiveReplies()
        setProblem(null)
        setReplies((current) => {
          const added = received.filter((reply) => !current.some((known) => known.id === reply.id))
          return [...added.reverse(), ...current]
        })
      } catch (failure) {
        handleDeviceFailure(failure)
      }
    }
    void listen()
    void refresh()
    const timer = setInterval(listen, REPLY_POLL_MS)
    return () => clearInterval(timer)
  }, [device, refresh, handleDeviceFailure])

  useEffect(
    () => () => {
      stopped.current = true
    },
    [],
  )

  const deliver = async (message: string, event: DeviceEvent): Promise<boolean> => {
    try {
      const status = await device!.send(event)
      addLog(message, status === 'accepted' ? '반영' : '중복이라 무시됨')
      return true
    } catch (failure) {
      addLog(message, '실패', true)
      handleDeviceFailure(failure)
      return false
    }
  }

  const sendOne = async (message: string, event: DeviceEvent, onSent?: () => void) => {
    setSending(true)
    if (await deliver(message, event)) onSent?.()
    await refresh()
    setSending(false)
  }

  const runScenario = async () => {
    const steps = buildScenario()
    stopped.current = false
    setProgress({ done: 0, total: steps.length })
    for (const [index, step] of steps.entries()) {
      if (index > 0) await wait(stepMs)
      if (stopped.current || !(await deliver(step.message, step.build(occurredNow())))) break
      setProgress({ done: index + 1, total: steps.length })
      await refresh()
    }
    setProgress(null)
    addLog(stopped.current ? '시나리오 중지' : '시나리오 끝', '')
  }

  if (storeName === null) {
    return (
      <div className="status-screen sim-loading">
        {problem ? <p role="alert">{problem}</p> : <p>불러오는 중입니다.</p>}
      </div>
    )
  }

  const running = progress !== null
  const ready = device !== null && !running && !sending

  const sendMovement = () => {
    const id = newEventId('movement')
    void sendOne('상품 이동 감지 (미결제)', movementEvent(id, occurredNow()), () => setMovementId(id))
  }

  const sendClip = () => {
    void sendOne('상품 이동 영상 클립 생성', clipEvent(newEventId('clip'), movementId!, occurredNow()), () =>
      setMovementId(null),
    )
  }

  const sendDoorOpen = () => {
    const id = newEventId('door')
    void sendOne('냉장고 문 장시간 개방 감지', doorOpenEvent(id, occurredNow()), () => setDoorId(id))
  }

  const sendDoorClosed = () => {
    void sendOne('냉장고 문 닫힘', doorClosedEvent(newEventId('door-closed'), doorId!, occurredNow()), () =>
      setDoorId(null),
    )
  }

  return (
    <div className="sim">
      <header className="sim-head">
        <div>
          <span className="logo">#Keeper</span>
          <h1>시뮬레이터</h1>
          <p className="subline subline--flat">
            <strong className="sim-store">{storeName}</strong> 매장으로 보냅니다. 실제 관리용 앱과 같은 경로입니다.
          </p>
        </div>
        <a className="btn sim-open" href="./" target="_blank" rel="noreferrer">
          점주 앱 열기
        </a>
      </header>

      {problem && (
        <p className="connection-banner sim-banner" role="alert">
          {problem}
        </p>
      )}

      <div className="sim-columns">
        <div className="sim-column">
          <section className="card sim-card" aria-label="전체 시나리오">
            <h2>전체 시나리오</h2>
            <p className="subline subline--flat">
              카메라 연결부터 이상행동, 고객 문의, 카메라 끊김까지 순서대로 보냅니다.
            </p>
            {running ? (
              <button type="button" className="btn full" onClick={() => (stopped.current = true)}>
                중지 ({progress.done}/{progress.total})
              </button>
            ) : (
              <button type="button" className="btn primary full" disabled={!ready} onClick={runScenario}>
                시나리오 실행
              </button>
            )}
          </section>

          <section className="card sim-card" aria-label="이벤트 하나씩 보내기">
            <h2>이벤트 하나씩 보내기</h2>
            <div className="sim-actions">
              <button type="button" className="btn" disabled={!ready} onClick={sendMovement}>
                상품 이동 감지
              </button>
              <button type="button" className="btn" disabled={!ready || !movementId} onClick={sendClip}>
                영상 클립 생성
              </button>
              <button type="button" className="btn" disabled={!ready} onClick={sendDoorOpen}>
                냉장고 문 개방
              </button>
              <button type="button" className="btn" disabled={!ready || !doorId} onClick={sendDoorClosed}>
                냉장고 문 닫힘
              </button>
              <button
                type="button"
                className="btn"
                disabled={!ready}
                onClick={() => sendOne('상품 훼손 의심 감지', damageEvent(newEventId('damage'), occurredNow()))}
              >
                상품 훼손 의심
              </button>
              <button
                type="button"
                className="btn"
                disabled={!ready}
                onClick={() =>
                  sendOne(
                    '고객 문의 접수 (점주에게 전달)',
                    inquiryEvent(newEventId('inquiry'), 'forwarded', occurredNow()),
                  )
                }
              >
                문의 (점주 전달)
              </button>
              <button
                type="button"
                className="btn"
                disabled={!ready}
                onClick={() =>
                  sendOne('고객 문의 접수 (AI가 해결)', inquiryEvent(newEventId('inquiry'), 'ai_resolved', occurredNow()))
                }
              >
                문의 (AI 해결)
              </button>
            </div>
          </section>

          <section className="card sim-card" aria-label="카메라">
            <h2>카메라</h2>
            <ul className="sim-list">
              {SIM_CAMERAS.map((camera) => {
                const connected = cameras.some((item) => item.id === camera.id && item.status === 'connected')
                const next = connected ? 'disconnected' : 'connected'
                const action = connected ? '연결 끊기' : '연결하기'
                return (
                  <li key={camera.id} className="sim-camera">
                    <div className="item-grow">
                      <strong>{camera.name}</strong>
                      <span className="sim-note">{camera.location}</span>
                    </div>
                    <span className={`tag ${connected ? 'green' : 'neutral'}`}>{connected ? '연결됨' : '끊김'}</span>
                    <button
                      type="button"
                      className="btn sim-small"
                      aria-label={`${camera.name} ${action}`}
                      disabled={!ready}
                      onClick={() =>
                        sendOne(
                          `${camera.name} ${connected ? '연결 끊김' : '연결'}`,
                          cameraEvent(newEventId(`${camera.id}-${next}`), camera.id, next, occurredNow()),
                        )
                      }
                    >
                      {action}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>

        <div className="sim-column">
          <section className="card sim-card" aria-label="키오스크에 표시된 답변">
            <h2>키오스크에 표시된 답변</h2>
            {replies.length === 0 ? (
              <p className="subline subline--flat">점주 앱의 문의 화면에서 답변을 보내면 여기에 표시됩니다.</p>
            ) : (
              <ul className="sim-list">
                {replies.map((reply) => (
                  <li key={reply.id}>
                    {reply.body}
                    <span className="sim-note">{formatKstTime(reply.sentAt)} 전달 완료</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card sim-card" aria-label="보낸 기록">
            <h2>보낸 기록</h2>
            {log.length === 0 ? (
              <p className="subline subline--flat">아직 보낸 이벤트가 없습니다.</p>
            ) : (
              <ol className="sim-list sim-log">
                {log.map((entry) => (
                  <li key={entry.id}>
                    <span className="sim-note">{entry.time}</span>
                    {entry.message}
                    {entry.result && (
                      <span className={entry.failed ? 'sim-result sim-result--failed' : 'sim-result'}>
                        {entry.result}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

export default function SimulatorApp({ stepMs = STEP_MS }: { stepMs?: number }) {
  const [token, setToken] = useState(readToken)

  const signOut = useCallback(() => {
    clearToken()
    setToken(null)
  }, [])

  const signIn = (next: string) => {
    saveToken(next)
    setToken(next)
  }

  if (!token) {
    return <LoginPage baseUrl={API_BASE_URL} onLogin={signIn} onSignup={() => window.location.assign('./')} />
  }
  return <SimulatorPage token={token} stepMs={stepMs} onUnauthorized={signOut} />
}

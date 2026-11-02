import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  DoorClosed,
  Maximize,
  Package,
  PackageX,
  Play,
  Video,
  VideoOff,
  Volume2,
} from 'lucide-react'
import { PageHeader } from '../components/common'
import { getActiveCamera, getAdjacentCameraId } from '../domain/rules'
import type { Camera, ClipView } from '../domain/types'

const clipIcons: Record<ClipView['kind'], typeof Package> = {
  movement: Package,
  duration: DoorClosed,
  product: PackageX,
}

function formatOrder(value: number) {
  return String(value).padStart(2, '0')
}

function ConnectionBadge({ status }: { status: Camera['status'] }) {
  const connected = status === 'connected'
  return (
    <span className={connected ? 'badge badge--green' : 'badge badge--red'}>
      <span className={connected ? 'dot dot--green' : 'dot dot--red'} aria-hidden />
      {connected ? '연결됨' : '연결 끊김'}
    </span>
  )
}

type Props = {
  cameras: Camera[]
  clips: ClipView[]
  cameraId: string | null
  activeClip: ClipView | null
  onSelectCamera: (id: string) => void
  onPlayClip: (id: string) => void
  onBackToLive: () => void
}

export default function CctvPage({
  cameras,
  clips,
  cameraId,
  activeClip,
  onSelectCamera,
  onPlayClip,
  onBackToLive,
}: Props) {
  const active = getActiveCamera(cameras, cameraId)
  const connected = active?.camera.status === 'connected'

  const moveCamera = (step: 1 | -1) => {
    const next = getAdjacentCameraId(cameras, cameraId, step)
    if (next) onSelectCamera(next)
  }

  return (
    <>
      <PageHeader title="실시간 CCTV" subtitle="기본 CCTV 연결 상태 및 현장 확인" />
      <div className="page-body">
        {active ? (
          <>
            <section className="player" aria-label={`${active.camera.name} 영상`}>
              <div className="player__top">
                <span className="player__pill">
                  {activeClip ? `클립 · ${activeClip.title}` : `${active.camera.name} · ${active.camera.location}`}
                </span>
                {activeClip ? (
                  <button type="button" className="player__pill player__pill--live" onClick={onBackToLive}>
                    실시간으로 돌아가기
                  </button>
                ) : (
                  <span className="player__pill player__pill--live">
                    <span className={connected ? 'dot dot--green' : 'dot dot--red'} aria-hidden />
                    {connected ? '연결됨' : '연결 끊김'}
                  </span>
                )}
              </div>
              <div className="player__stage">
                {activeClip ? (
                  <>
                    <Play size={32} fill="currentColor" strokeWidth={1.5} aria-hidden />
                    <span>클립 영상 연결 전입니다</span>
                  </>
                ) : connected ? (
                  <>
                    <Video size={34} fill="currentColor" strokeWidth={1.5} aria-hidden />
                    <span>실시간 영상 연결 전입니다</span>
                  </>
                ) : (
                  <>
                    <VideoOff size={34} strokeWidth={1.6} aria-hidden />
                    <span>연결이 끊겼습니다</span>
                  </>
                )}
                {!activeClip && cameras.length > 1 && (
                  <>
                    <button
                      type="button"
                      className="player__arrow player__arrow--prev"
                      aria-label="이전 카메라"
                      onClick={() => moveCamera(-1)}
                    >
                      <ChevronLeft size={20} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="player__arrow player__arrow--next"
                      aria-label="다음 카메라"
                      onClick={() => moveCamera(1)}
                    >
                      <ChevronRight size={20} aria-hidden />
                    </button>
                  </>
                )}
              </div>
              <div className="player__bar">
                <span className="player__live">
                  <span className="player__rec" aria-hidden />
                  {activeClip ? activeClip.duration : '대기 중'}
                </span>
                <span>
                  카메라 {formatOrder(active.index + 1)} / {formatOrder(cameras.length)}
                </span>
                <span className="player__controls">
                  <button type="button" aria-label="소리">
                    <Volume2 size={16} fill="currentColor" />
                  </button>
                  <button type="button" aria-label="전체 화면">
                    <Maximize size={15} />
                  </button>
                </span>
              </div>
            </section>

            <section className="card">
              <h2>연결된 카메라</h2>
              <ul className="camera-list">
                {cameras.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={item.id === active.camera.id ? 'is-selected' : undefined}
                      aria-pressed={item.id === active.camera.id}
                      onClick={() => onSelectCamera(item.id)}
                    >
                      <Video size={16} fill="currentColor" strokeWidth={1.5} aria-hidden />
                      <strong>{item.name}</strong>
                      <span className="camera-list__location">{item.location}</span>
                      <ConnectionBadge status={item.status} />
                      <ChevronRight size={15} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : (
          <section className="card empty-card">
            <Video size={30} fill="currentColor" strokeWidth={1.5} aria-hidden />
            <h2>등록된 카메라가 없습니다</h2>
            <p className="caption">관리용 앱에 카메라를 연결하면 여기에 표시됩니다.</p>
          </section>
        )}

        <section className="card">
          <div className="card__head">
            <h2>주요 감지 클립 돌아보기</h2>
            <button type="button" className="link-button link-button--small">
              전체 보기
              <ArrowRight size={12} strokeWidth={2.2} aria-hidden />
            </button>
          </div>
          <p className="caption">AI가 감지한 주요 상황을 영상으로 바로 확인하세요.</p>
          {clips.length === 0 ? (
            <p className="empty-note">오늘 감지된 클립이 없습니다.</p>
          ) : (
            <ul className="clip-grid">
              {clips.map((clip) => {
                const Icon = clipIcons[clip.kind]
                const clipCamera = cameras.find((item) => item.id === clip.cameraId)
                return (
                  <li key={clip.id}>
                    <button type="button" onClick={() => onPlayClip(clip.id)}>
                      <span className={`clip-thumb clip-thumb--${clip.kind}`}>
                        <Icon size={36} strokeWidth={1.4} fill="currentColor" fillOpacity={0.35} aria-hidden />
                        <span className="clip-thumb__duration">
                          <Play size={8} fill="currentColor" aria-hidden />
                          {clip.duration}
                        </span>
                      </span>
                      <strong>{clip.title}</strong>
                      <span className="caption">
                        오늘 {clip.time} · {clipCamera?.name ?? '삭제된 카메라'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}

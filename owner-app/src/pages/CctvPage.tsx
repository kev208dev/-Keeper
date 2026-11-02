import { useState } from 'react'
import CameraPreview from '../components/CameraPreview'
import { SectionHead, Sheet, alertIcons } from '../components/common'
import { Chevron, Icon } from '../components/icons'
import { getActiveCamera, getCameraCaption, getCameraLabel, getConnectedCount } from '../domain/rules'
import type { Camera, ClipView } from '../domain/types'
import { alertHash } from '../tabs'

type Props = {
  cameras: Camera[]
  clips: ClipView[]
  cameraId: string | null
  onSelectCamera: (id: string) => void
}

export default function CctvPage({ cameras, clips, cameraId, onSelectCamera }: Props) {
  const [showInfo, setShowInfo] = useState(false)
  const active = getActiveCamera(cameras, cameraId)

  return (
    <>
      <div className="page-intro">
        <h1 className="page-heading">카메라</h1>
        <p className="subline subline--flat">{getCameraCaption(cameras)}</p>
      </div>

      {active ? (
        <>
          <div className="page-x">
            <CameraPreview title={active.location} caption={active.name} connected={active.status === 'connected'} />
          </div>
          <p className="subline page-x cam-hint">카메라를 선택해 화면을 전환해 보세요.</p>
          <div className="cam-tabs">
            {cameras.map((camera) => (
              <button
                type="button"
                key={camera.id}
                className={camera.id === active.id ? 'cam-tab selected' : 'cam-tab'}
                aria-pressed={camera.id === active.id}
                onClick={() => onSelectCamera(camera.id)}
              >
                <strong>{camera.location}</strong>
                <span>{camera.name}</span>
              </button>
            ))}
          </div>

          <SectionHead title="카메라 연결 상태" />
          <div className="feed">
            {cameras.map((camera) => {
              const connected = camera.status === 'connected'
              return (
                <div className="feed-entry" key={camera.id}>
                  <span className="link-icon blue">
                    <Icon name="cctv" size={21} />
                  </span>
                  <span className="item-grow">
                    <div className="feed-title">{camera.location}</div>
                    <div className="feed-description">
                      {camera.name} · {connected ? '연결 양호' : '연결이 끊겼습니다'}
                    </div>
                  </span>
                  <span className={connected ? 'tag green' : 'tag orange'}>{connected ? '정상' : '끊김'}</span>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <p className="feed-empty feed-empty--card page-gutter">관리용 앱에 카메라를 연결하면 여기에 표시됩니다.</p>
      )}

      <SectionHead title="오늘의 감지 클립" />
      <div className="feed">
        {clips.length === 0 ? (
          <p className="feed-empty">오늘 감지된 클립이 없습니다.</p>
        ) : (
          clips.map((clip) => (
            <a className="feed-entry" key={clip.id} href={alertHash(clip.alertId)}>
              <span className="link-icon orange">
                <Icon name={alertIcons[clip.kind]} size={20} />
              </span>
              <span className="item-grow">
                <div className="feed-title">{clip.title}</div>
                <div className="feed-description">
                  {getCameraLabel(cameras, clip.cameraId)} · {clip.time} · {clip.duration}
                </div>
              </span>
              <Chevron />
            </a>
          ))
        )}
      </div>

      <button type="button" className="wide-action" onClick={() => setShowInfo(true)}>
        카메라 관리 정보 보기
      </button>
      <p className="bottom-note">실시간 영상은 아직 연결되지 않았습니다. 화면은 매장 그림으로 대신 표시합니다.</p>

      {showInfo && (
        <Sheet
          title="카메라 연결"
          description={`전체 ${cameras.length}대 중 ${getConnectedCount(cameras)}대가 연결되어 있습니다. 카메라 추가와 이름 변경은 매장의 관리용 앱에서 할 수 있습니다.`}
          onClose={() => setShowInfo(false)}
        />
      )}
    </>
  )
}

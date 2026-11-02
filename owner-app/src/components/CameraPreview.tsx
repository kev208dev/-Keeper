import { Icon } from './icons'

// 실제 영상이 연결되기 전까지 보여주는 매장 그림. 영상으로 오해하지 않도록 라벨을 함께 표시한다
function StoreScene() {
  return (
    <svg className="scene" viewBox="0 0 350 205" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect fill="#e9e8e1" height="205" width="350" />
      <rect fill="#deddd5" height="45" width="350" />
      <path d="M0 125 350 100v105H0z" fill="#cbc9c0" />
      <path d="M0 128 350 103" stroke="#b9b7ae" strokeWidth="2" />
      <rect fill="#bdc9c7" height="111" rx="4" width="95" x="18" y="48" />
      <rect fill="#eff3ef" height="98" rx="3" width="83" x="24" y="54" />
      <path d="M65 54v98" stroke="#bac8c6" strokeWidth="3" />
      <path d="M30 78h30m-30 29h30m-30 28h30M72 78h28m-28 29h28m-28 28h28" stroke="#d8e0dc" strokeWidth="3" />
      <rect fill="#c7d2ce" height="119" rx="5" width="100" x="129" y="41" />
      <rect fill="#f2f4ed" height="105" rx="3" width="86" x="136" y="48" />
      <path d="M179 48v105" stroke="#c6d0cc" strokeWidth="3" />
      <path d="M142 73h30m-30 29h30m-30 29h30m7-58h37m-37 29h37m-37 29h37" stroke="#d7ded7" strokeWidth="3" />
      <rect fill="#b9c8c4" height="101" rx="5" width="88" x="245" y="57" />
      <rect fill="#edf2ef" height="87" rx="3" width="76" x="251" y="63" />
      <path d="M289 63v87" stroke="#b6c5c0" strokeWidth="3" />
      <path d="M256 87h28m-28 27h28m11-27h27m-27 27h27" stroke="#d3ddd8" strokeWidth="3" />
      <rect fill="#f8f7f2" height="4" width="350" y="31" />
      <circle cx="74" cy="28" fill="#f8f4e6" r="10" />
      <circle cx="175" cy="28" fill="#f8f4e6" r="10" />
      <circle cx="276" cy="28" fill="#f8f4e6" r="10" />
      <path d="M0 175 350 148" opacity=".5" stroke="#b9b7ae" strokeWidth="1" />
    </svg>
  )
}

type Props = {
  title: string
  caption: string
  connected: boolean
}

export default function CameraPreview({ title, caption, connected }: Props) {
  return (
    <div className={connected ? 'preview' : 'preview preview--off'}>
      <StoreScene />
      <div className="cam-top">
        <span className="cam-label">영상 연결 전</span>
        <span className="cam-status">
          <span className="tiny-dot" />
          {connected ? '연결됨' : '연결 끊김'}
        </span>
      </div>
      <div className="cam-bottom">
        <div>
          <strong>{title}</strong>
          <br />
          <small>{caption}</small>
        </div>
        <Icon name="video" size={20} />
      </div>
    </div>
  )
}

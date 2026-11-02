import { useState, type FormEvent, type ReactNode } from 'react'
import { Sheet } from '../components/common'
import { Chevron, Icon, type IconName } from '../components/icons'
import { getConnectedCount, getIntegrationBadge } from '../domain/rules'
import type { Camera, Integration, Store } from '../domain/types'
import { NOTICES_HASH, NOTIFICATION_SETTINGS_HASH } from '../tabs'

const MAX_STORE_NAME_LENGTH = 100

const guides = {
  help: {
    title: '서비스 도움말',
    description:
      '홈에서 지금 확인할 알림을 보고, 알림을 눌러 감지 정보를 확인한 뒤 처리하세요. 고객 문의는 문의 탭에서 답변하면 매장 키오스크로 전달됩니다.',
  },
  privacy: {
    title: '개인정보 및 보안',
    description:
      '매장 데이터는 로그인한 점주만 볼 수 있고 다른 매장에서는 접근할 수 없습니다. 비밀번호와 기기 키는 원문을 저장하지 않습니다.',
  },
}

function SettingRow({ icon, name, desc }: { icon: IconName; name: string; desc: string }) {
  return (
    <>
      <span className="link-icon">
        <Icon name={icon} size={19} />
      </span>
      <span className="copy">
        <div className="name">{name}</div>
        <div className="desc">{desc}</div>
      </span>
      <Chevron size={17} />
    </>
  )
}

function SettingButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="setting setting--wide" onClick={onClick}>
      {children}
    </button>
  )
}

function StoreForm({
  name,
  onRename,
  onClose,
}: {
  name: string
  onRename: (name: string) => Promise<boolean>
  onClose: () => void
}) {
  const [draft, setDraft] = useState(name)
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const next = draft.trim()
    if (!next || saving) return
    setSaving(true)
    if (await onRename(next)) onClose()
    else setSaving(false)
  }

  return (
    <Sheet title="매장 정보" description="매장 이름을 바꾸면 점주 앱 전체에 반영됩니다." onClose={onClose}>
      <form className="store-form" onSubmit={(event) => void submit(event)}>
        <label htmlFor="store-name">매장 이름</label>
        <input
          id="store-name"
          maxLength={MAX_STORE_NAME_LENGTH}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className="btn primary btn--block" disabled={saving || !draft.trim()}>
          저장
        </button>
      </form>
    </Sheet>
  )
}

type SheetId = 'store' | 'camera' | keyof typeof guides

type Props = {
  store: Store
  integration: Integration
  cameras: Camera[]
  onRename: (name: string) => Promise<boolean>
  onLogout?: () => void
}

export default function SettingsPage({ store, integration, cameras, onRename, onLogout }: Props) {
  const [sheet, setSheet] = useState<SheetId | null>(null)
  const badge = getIntegrationBadge(integration)
  const connected = getConnectedCount(cameras)
  const closeSheet = () => setSheet(null)

  return (
    <>
      <div className="page-intro">
        <h1 className="page-heading">설정</h1>
      </div>
      <div className="store-summary">
        <span className="store-icon">
          <Icon name="store" />
        </span>
        <span className="item-grow">
          <div className="store-summary__name">{store.name}</div>
          <div className="row-desc">{connected > 0 ? `카메라 ${connected}대 연결됨` : '연결된 카메라 없음'}</div>
        </span>
        <span className={badge.tone === 'green' ? 'tag green' : 'tag orange'}>{badge.label}</span>
      </div>

      <div className="group-title">매장 관리</div>
      <div className="settings-list">
        <SettingButton onClick={() => setSheet('store')}>
          <SettingRow icon="store" name="매장 정보" desc="이름 및 매장 기본 정보" />
        </SettingButton>
        <SettingButton onClick={() => setSheet('camera')}>
          <SettingRow icon="video" name="카메라 연결" desc={`${connected}대 연결됨`} />
        </SettingButton>
      </div>

      <div className="group-title">알림 및 소식</div>
      <div className="settings-list">
        <a className="setting setting--wide" href={NOTIFICATION_SETTINGS_HASH}>
          <SettingRow icon="cctv" name="알림 설정" desc="감지·문의·카메라 알림" />
        </a>
        <a className="setting setting--wide" href={NOTICES_HASH}>
          <SettingRow icon="information" name="공지사항" desc="서비스 변경 및 안내" />
        </a>
      </div>

      <div className="group-title">도움말</div>
      <div className="settings-list">
        <SettingButton onClick={() => setSheet('help')}>
          <SettingRow icon="information" name={guides.help.title} desc="앱 사용 안내" />
        </SettingButton>
        <SettingButton onClick={() => setSheet('privacy')}>
          <SettingRow icon="alert" name={guides.privacy.title} desc="매장 데이터 보호 안내" />
        </SettingButton>
      </div>

      {onLogout && (
        <button type="button" className="wide-action wide-action--quiet" onClick={onLogout}>
          로그아웃
        </button>
      )}

      {sheet === 'store' && <StoreForm name={store.name} onRename={onRename} onClose={closeSheet} />}
      {sheet === 'camera' && (
        <Sheet
          title="카메라 연결"
          description={`전체 ${cameras.length}대 중 ${connected}대가 연결되어 있습니다. 카메라 추가와 이름 변경은 매장의 관리용 앱에서 할 수 있습니다.`}
          onClose={closeSheet}
        />
      )}
      {(sheet === 'help' || sheet === 'privacy') && <Sheet {...guides[sheet]} onClose={closeSheet} />}
    </>
  )
}

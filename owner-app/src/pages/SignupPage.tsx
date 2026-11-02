import { useState, type FormEvent } from 'react'
import { ApiError, signup } from '../api/httpApi'
import { getSignupError } from '../domain/rules'

function signupFailureMessage(failure: unknown): string {
  if (failure instanceof ApiError && failure.status === 409) return '이미 가입된 이메일입니다.'
  if (failure instanceof ApiError && failure.status === 422) return '입력한 내용을 확인해 주세요.'
  if (failure instanceof ApiError && failure.status === 429) return '시도가 너무 많습니다. 잠시 후 다시 시도하세요.'
  return '서버에 연결할 수 없습니다.'
}

type Account = { token: string; deviceKey: string }

function DeviceKeyStep({ account, onDone }: { account: Account; onDone: (token: string) => void }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(account.deviceKey)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <div className="app">
      <main className="login">
        <section className="card login__form">
          <span className="logo">#Keeper</span>
          <h1>가입이 완료되었습니다</h1>
          <p className="caption">
            아래 기기 키를 매장의 관리용 앱에 입력하면 매장이 연결됩니다. 이 키는 지금만 볼 수 있으니 안전한 곳에 저장해
            주세요.
          </p>
          <code className="device-key">{account.deviceKey}</code>
          <button type="button" className="pill-button login__copy" onClick={() => void copy()}>
            기기 키 복사
          </button>
          {copyState === 'copied' && (
            <p className="caption" role="status">
              복사했습니다.
            </p>
          )}
          {copyState === 'failed' && (
            <p className="field-error" role="alert">
              복사하지 못했습니다. 키를 직접 선택해 복사해 주세요.
            </p>
          )}
          <button type="button" className="confirm-button login__submit" onClick={() => onDone(account.token)}>
            시작하기
          </button>
        </section>
      </main>
    </div>
  )
}

type Props = {
  baseUrl: string
  onDone: (token: string) => void
  onBack: () => void
}

export default function SignupPage({ baseUrl, onDone, onBack }: Props) {
  const [storeName, setStoreName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [account, setAccount] = useState<Account | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const invalid = getSignupError({ storeName, email, password, passwordConfirm })
    setError(invalid)
    if (invalid) return

    setSubmitting(true)
    try {
      setAccount(await signup(baseUrl, { storeName, email, password }))
    } catch (failure) {
      setError(signupFailureMessage(failure))
      setSubmitting(false)
    }
  }

  if (account) return <DeviceKeyStep account={account} onDone={onDone} />

  return (
    <div className="app">
      <main className="login">
        <form className="card login__form" onSubmit={submit} noValidate>
          <span className="logo">#Keeper</span>
          <h1>점주 회원가입</h1>
          <label htmlFor="signup-store">
            매장 이름
            <input
              id="signup-store"
              autoComplete="organization"
              value={storeName}
              onChange={(event) => setStoreName(event.target.value)}
            />
          </label>
          <label htmlFor="signup-email">
            이메일
            <input
              id="signup-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label htmlFor="signup-password">
            비밀번호 (8자 이상)
            <input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label htmlFor="signup-password-confirm">
            비밀번호 확인
            <input
              id="signup-password-confirm"
              type="password"
              autoComplete="new-password"
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
            />
          </label>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="confirm-button login__submit" disabled={submitting}>
            가입하기
          </button>
          <button type="button" className="login__switch" onClick={onBack}>
            이미 계정이 있어요
          </button>
        </form>
      </main>
    </div>
  )
}

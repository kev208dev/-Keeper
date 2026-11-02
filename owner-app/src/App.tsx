import { useCallback, useMemo, useState } from 'react'
import { createHttpApi } from './api/httpApi'
import { createPreviewApi } from './api/previewApi'
import { clearToken, readToken, saveToken } from './api/session'
import OwnerApp from './OwnerApp'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'

const API_BASE_URL = import.meta.env.VITE_API_URL ?? ''
const POLL_MS = 10_000

function PreviewApp() {
  const [api] = useState(createPreviewApi)
  const [startAt] = useState(() => new Date())
  return <OwnerApp api={api} startAt={startAt} pollMs={0} />
}

function ServerApp() {
  const [token, setToken] = useState(readToken)
  const [signingUp, setSigningUp] = useState(false)
  const [startAt] = useState(() => new Date())
  const api = useMemo(() => (token ? createHttpApi(API_BASE_URL, token) : null), [token])

  const signOut = useCallback(() => {
    clearToken()
    setToken(null)
  }, [])

  const signIn = (next: string) => {
    saveToken(next)
    setSigningUp(false)
    setToken(next)
  }

  if (!api) {
    return signingUp ? (
      <SignupPage baseUrl={API_BASE_URL} onDone={signIn} onBack={() => setSigningUp(false)} />
    ) : (
      <LoginPage baseUrl={API_BASE_URL} onLogin={signIn} onSignup={() => setSigningUp(true)} />
    )
  }

  const logout = () => {
    api.logout().catch(() => {})
    signOut()
  }

  return <OwnerApp api={api} startAt={startAt} pollMs={POLL_MS} onUnauthorized={signOut} onLogout={logout} />
}

export default function App({ dataSource = import.meta.env.VITE_DATA_SOURCE }: { dataSource?: string }) {
  return dataSource === 'preview' ? <PreviewApp /> : <ServerApp />
}

const TOKEN_KEY = 'keeper.token'

// 저장소를 쓸 수 없는 환경에서는 이번 접속 동안만 로그인을 유지한다
export function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function saveToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // 저장에 실패해도 현재 화면의 로그인은 유지된다
  }
}

export function clearToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY)
  } catch {
    // 지울 저장소가 없으면 할 일이 없다
  }
}

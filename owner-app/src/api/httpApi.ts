import type { AlertItem } from '../domain/types'
import type { Dashboard, KeeperApi } from './types'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request(baseUrl: string, path: string, init: RequestInit = {}): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, init)
  } catch {
    throw new ApiError(0, '서버에 연결할 수 없습니다.')
  }
  if (!response.ok) {
    throw new ApiError(response.status, `요청을 처리하지 못했습니다. (${response.status})`)
  }
  return response
}

export async function login(baseUrl: string, email: string, password: string): Promise<string> {
  const response = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body: { token: string } = await response.json()
  return body.token
}

export async function signup(
  baseUrl: string,
  account: { email: string; password: string; storeName: string },
): Promise<{ token: string; deviceKey: string }> {
  const response = await request(baseUrl, '/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(account),
  })
  return (await response.json()) as { token: string; deviceKey: string }
}

export function createHttpApi(baseUrl: string, token: string): KeeperApi & { logout(): Promise<void> } {
  const authorized = (path: string, method = 'GET') =>
    request(baseUrl, path, { method, headers: { Authorization: `Bearer ${token}` } })

  return {
    getDashboard: async (since) => {
      const response = await authorized(`/api/dashboard?${new URLSearchParams({ since })}`)
      return (await response.json()) as Dashboard
    },
    getAlerts: async ({ start, end }) => {
      const response = await authorized(`/api/alerts?${new URLSearchParams({ start, end })}`)
      return (await response.json()) as AlertItem[]
    },
    confirmAlert: async (id) => {
      await authorized(`/api/alerts/${encodeURIComponent(id)}/confirm`, 'POST')
    },
    markInquiryRead: async (id) => {
      await authorized(`/api/inquiries/${encodeURIComponent(id)}/read`, 'POST')
    },
    logout: async () => {
      await authorized('/api/auth/logout', 'POST')
    },
  }
}

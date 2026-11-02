import type { KeeperApi } from './types'

// 서버 없이 화면만 볼 때 쓰는 구현. 데이터를 지어내지 않고 연동 전 상태를 그대로 보여준다
export function createPreviewApi(): KeeperApi {
  return {
    getDashboard: async () => ({
      store: { name: '내 매장' },
      integration: { status: 'waiting', lastSeenAt: null },
      cameras: [],
      alerts: [],
      clips: [],
      inquiries: [],
    }),
    getAlerts: async () => [],
    confirmAlert: async () => {},
    markInquiryRead: async () => {},
  }
}

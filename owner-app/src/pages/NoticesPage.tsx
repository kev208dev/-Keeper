import { useEffect, useState } from 'react'
import { Chevron } from '../components/icons'
import { formatNoticeDate } from '../domain/time'
import type { Notice } from '../domain/types'

export default function NoticesPage({ loadNotices }: { loadNotices: () => Promise<Notice[]> }) {
  const [notices, setNotices] = useState<Notice[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let stale = false
    loadNotices().then(
      (items) => {
        if (!stale) setNotices(items)
      },
      () => {
        if (!stale) setFailed(true)
      },
    )
    return () => {
      stale = true
    }
  }, [loadNotices])

  return (
    <>
      <div className="simple-intro simple-intro--tight">
        <p>#Keeper의 소식을 확인하세요.</p>
      </div>
      {failed && <p className="event-empty">공지사항을 불러오지 못했습니다.</p>}
      {!failed && !notices && <p className="event-empty">불러오는 중입니다.</p>}
      {notices?.length === 0 && <p className="event-empty">등록된 공지사항이 없습니다.</p>}
      {notices && notices.length > 0 && (
        <div className="notice-list">
          {notices.map((notice) => (
            <details className="notice-item" key={notice.id}>
              <summary>
                <h2>{notice.title}</h2>
                <time>{formatNoticeDate(notice.publishedAt)}</time>
                <span className="more-icon">
                  <Chevron />
                </span>
              </summary>
              <div className="notice-content">{notice.body}</div>
            </details>
          ))}
        </div>
      )}
    </>
  )
}

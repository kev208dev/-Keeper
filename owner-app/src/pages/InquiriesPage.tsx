import { useState } from 'react'
import { Badge, LinkButton, PageHeader } from '../components/common'
import { getInquiryBadge, getInquirySummary } from '../domain/rules'
import { formatEventTime } from '../domain/time'
import type { Inquiry } from '../domain/types'

type Props = {
  inquiries: Inquiry[]
  now: Date
  onRead: (id: string) => void
}

export default function InquiriesPage({ inquiries, now, onRead }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)
  const summary = getInquirySummary(inquiries, now)

  const toggle = (id: string) => {
    setOpenId(openId === id ? null : id)
    onRead(id)
  }

  return (
    <>
      <PageHeader title="고객 문의 관리" subtitle="AI 상담과 점주 전달 요청을 확인하세요" />
      <div className="page-body">
        <section className="card split-card">
          <div>
            <h2>오늘 고객 문의</h2>
            <p className="caption">
              총 {summary.total}건 · 점주 확인 필요 {summary.needsOwner}건
            </p>
          </div>
          <button type="button" className="pill-button">
            문의 목록
          </button>
        </section>

        {inquiries.length === 0 && <p className="card empty-note">아직 접수된 문의가 없습니다.</p>}
        {inquiries.map((inquiry) => {
          const badge = getInquiryBadge(inquiry)
          const isOpen = openId === inquiry.id
          return (
            <article className="card notice" key={inquiry.id}>
              <div className="notice__head">
                <Badge tone={badge.tone}>{badge.label}</Badge>
                <time className="caption">{formatEventTime(inquiry.occurredAt, now)}</time>
              </div>
              <h2 className="notice__title">{inquiry.title}</h2>
              <p className="note-box">{inquiry.note}</p>
              {isOpen && (
                <ul className="transcript">
                  {inquiry.transcript.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
              <LinkButton expanded={isOpen} onClick={() => toggle(inquiry.id)}>
                {isOpen ? '상담 내용 닫기' : '상담 내용 확인'}
              </LinkButton>
            </article>
          )
        })}

        <section className="card">
          <h2>고객 응대 현황</h2>
          <p className="caption">
            AI 응대 완료 {summary.aiResolved}건 · 점주 전달 {summary.forwarded}건
          </p>
        </section>
      </div>
    </>
  )
}

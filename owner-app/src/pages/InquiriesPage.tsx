import { useState, type FormEvent } from 'react'
import { Chevron, Icon } from '../components/icons'
import { getInquiryMeta, getInquiryState, getInquirySummary, parseTranscriptLine } from '../domain/rules'
import { formatEventTime } from '../domain/time'
import type { Inquiry } from '../domain/types'

const MAX_REPLY_LENGTH = 500

type ItemProps = {
  inquiry: Inquiry
  isOpen: boolean
  now: Date
  onToggle: () => void
  onReply: (id: string, body: string) => Promise<boolean>
}

function InquiryItem({ inquiry, isOpen, now, onToggle, onReply }: ItemProps) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const state = getInquiryState(inquiry)
  const triggerId = `trigger-${inquiry.id}`
  const panelId = `thread-${inquiry.id}`
  const inputId = `reply-${inquiry.id}`

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    if (await onReply(inquiry.id, body)) setDraft('')
    setSending(false)
  }

  return (
    <section className={isOpen ? 'inquiry-item is-open' : 'inquiry-item'}>
      <button
        type="button"
        className="inquiry-trigger"
        id={triggerId}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className="qicon">
          <Icon name="chatProcessing" size={20} />
        </span>
        <span className="inquiry-summary">
          <span className="inquiry-title">{inquiry.title}</span>
          <span className="inquiry-meta">{getInquiryMeta(inquiry, now)}</span>
        </span>
        <span className="inquiry-trailing">
          <span className={state.done ? 'inquiry-state done' : 'inquiry-state pending'}>{state.label}</span>
          <span className="inquiry-chevron">
            <Chevron size={17} />
          </span>
        </span>
      </button>
      <div className="inquiry-panel" id={panelId} role="region" aria-labelledby={triggerId} inert={!isOpen}>
        <div className="inquiry-panel-inner">
          <div className="conversation-body">
            <div className="conversation-divider">
              <span>{inquiry.note}</span>
              <span>{formatEventTime(inquiry.occurredAt, now)}</span>
            </div>
            {inquiry.transcript.map((line, index) => {
              const message = parseTranscriptLine(line)
              return (
                <div className={message.fromCustomer ? 'thread-message from-customer' : 'thread-message from-operator'} key={index}>
                  <div className="thread-sender">{message.sender}</div>
                  <div className="thread-bubble">{message.text}</div>
                </div>
              )
            })}
            {inquiry.replies.map((reply) => (
              <div className="thread-message from-owner" key={reply.id}>
                <div className="thread-sender">
                  점주 · {formatEventTime(reply.sentAt, now)} · {reply.delivered ? '키오스크 전달 완료' : '전달 대기'}
                </div>
                <div className="thread-bubble">{reply.body}</div>
              </div>
            ))}
            <form className="thread-compose" autoComplete="off" onSubmit={(event) => void submit(event)}>
              <label className="sr-only" htmlFor={inputId}>
                고객 문의 답변 입력
              </label>
              <input
                id={inputId}
                placeholder="답변을 입력하세요"
                maxLength={MAX_REPLY_LENGTH}
                enterKeyHint="send"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <button type="submit" aria-label="답변 보내기" disabled={sending}>
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                  <path fill="currentColor" d="M3 19.5 21 12 3 4.5l1.6 6.1 9.3 1.4-9.3 1.4L3 19.5Z" />
                </svg>
              </button>
            </form>
            <p className="thread-footnote">보낸 답변은 매장 키오스크로 전달돼요.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

type Props = {
  inquiries: Inquiry[]
  now: Date
  onRead: (id: string) => void
  onReply: (id: string, body: string) => Promise<boolean>
}

export default function InquiriesPage({ inquiries, now, onRead, onReply }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)
  const summary = getInquirySummary(inquiries)

  const toggle = (inquiry: Inquiry) => {
    setOpenId(openId === inquiry.id ? null : inquiry.id)
    if (!inquiry.read) onRead(inquiry.id)
  }

  return (
    <>
      <div className="page-intro page-intro--tight">
        <p className="subline subline--flat">고객이 남긴 문의를 확인하고 답변하세요.</p>
      </div>
      <div className="date-label date-label--tight">
        최근 접수된 문의 {summary.total}건 <span className="inquiry-count">· 확인 필요 {summary.needsOwner}건</span>
      </div>
      {inquiries.length === 0 ? (
        <p className="feed-empty feed-empty--card page-gutter">아직 접수된 문의가 없습니다.</p>
      ) : (
        <div className="inquiry-accordion">
          {inquiries.map((inquiry) => (
            <InquiryItem
              key={inquiry.id}
              inquiry={inquiry}
              isOpen={openId === inquiry.id}
              now={now}
              onToggle={() => toggle(inquiry)}
              onReply={onReply}
            />
          ))}
        </div>
      )}
      <p className="bottom-note">답변은 관리용 앱이 받아 매장 키오스크에 표시합니다.</p>
    </>
  )
}

'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type {
  ChatMessage, Phase, ValidationResult, KCNode, SSEMessage,
} from '@/lib/types'
import MasteryGate from './MasteryGate'
import KnowledgeMap from './KnowledgeMap'

const B2C_API = '/api/b2c'

interface TrekChatProps {
  sessionId: string
  userId: string
  initialPhase: Phase
  initialMessage: string
  topicId?: string
  topicTitle?: string
  kcGraph?: KCNode[]
  currentKcIndex?: number
}

export default function TrekChat({
  sessionId,
  userId,
  initialPhase,
  initialMessage,
  topicId: initialTopicId = '',
  topicTitle: initialTopicTitle = '',
  kcGraph: initialKcGraph = [],
  currentKcIndex: initialKcIndex = 0,
}: TrekChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessage ? [{ role: 'assistant', content: initialMessage }] : []
  )
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<Phase>(initialPhase)
  const [topicId, setTopicId] = useState(initialTopicId)
  const [topicTitle, setTopicTitle] = useState(initialTopicTitle)
  const [kcGraph, setKcGraph] = useState<KCNode[]>(initialKcGraph)
  const [currentKcIndex, setCurrentKcIndex] = useState(initialKcIndex)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' }
  const serif: React.CSSProperties = { fontFamily: 'var(--font-serif)' }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return

    setInput('')
    setLoading(true)
    setMessages(prev => [...prev, { role: 'user', content: text }])

    try {
      const res = await fetch(`${B2C_API}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          topic_id: topicId,
          session_id: sessionId,
          message: text,
          phase,
        }),
      })

      if (!res.ok || !res.body) {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: 'something went wrong, try again' },
        ])
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue

          let event: SSEMessage
          try {
            event = JSON.parse(raw)
          } catch {
            continue
          }

          if (event.type === 'done') break

          if (event.type === 'error') {
            setMessages(prev => [
              ...prev,
              { role: 'assistant', content: `error: ${event.message}` },
            ])
            break
          }

          if (event.type === 'message' && event.content) {
            const newPhase = event.phase || phase
            setPhase(newPhase)
            setMessages(prev => [
              ...prev,
              { role: 'assistant', content: event.content },
            ])
          }

          if (event.type === 'validation_result') {
            const vr: ValidationResult = {
              type: 'validation_result',
              passed: event.passed || false,
              score: event.score || 0,
              feedback: event.feedback || '',
              what_was_right: event.what_was_right || '',
              what_was_wrong: event.what_was_wrong || '',
              flag_type: event.flag_type || null,
              attempt_number: event.attempt_number || 1,
              next_phase: event.next_phase || phase,
            }
            setMessages(prev => [
              ...prev,
              {
                role: 'assistant',
                content: '',
                type: 'validation',
                validationResult: vr,
              },
            ])
            if (event.next_phase) setPhase(event.next_phase)
          }

          if (event.type === 'curriculum_ready') {
            if (event.topic_id) setTopicId(event.topic_id)
            if (event.topic_title) setTopicTitle(event.topic_title)
            if (event.kc_graph) {
              setKcGraph(event.kc_graph)
              if (typeof event.current_kc_index === 'number') {
                setCurrentKcIndex(event.current_kc_index)
              } else {
                setCurrentKcIndex(0)
              }
            }
          }

          if (event.type === 'kc_graph' && event.kc_graph) {
            setKcGraph(event.kc_graph)
            if (typeof event.current_kc_index === 'number') {
              setCurrentKcIndex(event.current_kc_index)
            } else {
              const inProgressIdx = event.kc_graph.findIndex(k => k.status === 'in_progress')
              if (inProgressIdx >= 0) setCurrentKcIndex(inProgressIdx)
            }
          }
        }
      }
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'connection error, try again' },
      ])
    } finally {
      setLoading(false)
    }
  }, [input, loading, phase, topicId, sessionId, userId])

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const placeholderText = phase === 'awaiting_explanation'
    ? 'explain it back in your own words...'
    : phase === 'discovery'
    ? 'type your answer...'
    : 'type a message...'

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--background)', color: 'var(--foreground)' }}>
      <style>{`
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--muted);border-radius:2px}
        .ta{background:var(--card);border:2px solid var(--border);border-radius:4px;color:var(--foreground);font-size:14px;padding:13px 16px;outline:none;width:100%;font-family:var(--font-sans);resize:none;transition:box-shadow 0.15s;min-height:48px;max-height:140px}.ta:focus{box-shadow:4px 4px 0 0 hsl(0 0% 10%)}.ta::placeholder{color:var(--muted-foreground)}
        .sb{background:var(--foreground);color:var(--background);font-weight:600;font-size:13px;padding:13px 20px;border-radius:4px;border:2px solid var(--border);cursor:pointer;font-family:var(--font-mono);white-space:nowrap;box-shadow:4px 4px 0 0 hsl(0 0% 10%);transition:box-shadow 0.15s,transform 0.15s}.sb:hover{box-shadow:6px 6px 0 0 hsl(0 0% 10%);transform:translate(-2px,-2px)}.sb:disabled{opacity:.3;cursor:not-allowed;transform:none;box-shadow:4px 4px 0 0 hsl(0 0% 10%)}
        .ctd{width:5px;height:5px;border-radius:50%;background:var(--muted-foreground);animation:cbounce 1.2s infinite;display:inline-block}.ctd:nth-child(2){animation-delay:.2s}.ctd:nth-child(3){animation-delay:.4s}
        @keyframes cbounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}
      `}</style>

      {sidebarOpen && kcGraph.length > 0 && (
        <div
          style={{
            width: '240px',
            flexShrink: 0,
            borderRight: '2px solid var(--border)',
            padding: '20px 16px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {topicTitle && (
            <div>
              <div style={{ ...mono, fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '4px' }}>
                topic
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '-0.2px' }}>
                {topicTitle}
              </div>
            </div>
          )}

          <KnowledgeMap nodes={kcGraph} currentKcIndex={currentKcIndex} />
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 24px',
            borderBottom: '2px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Link href="/" style={{ textDecoration: 'none' }}>
              <span style={{ ...serif, fontSize: '20px', letterSpacing: '-0.5px' }}>assign</span>
            </Link>
            <span style={{ ...mono, fontSize: '11px', border: '1.5px solid var(--border)', borderRadius: '4px', padding: '3px 8px' }}>
              trek
            </span>
            {phase === 'awaiting_explanation' && (
              <span style={{ ...mono, fontSize: '10px', border: '1.5px solid #4ade8066', borderRadius: '4px', padding: '3px 8px', color: '#4ade80' }}>
                explain it back
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {kcGraph.length > 0 && (
              <button
                onClick={() => setSidebarOpen(open => !open)}
                style={{ ...mono, fontSize: '11px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}
              >
                {sidebarOpen ? 'hide map' : 'show map'}
              </button>
            )}
            <a href="/notes" style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)', textDecoration: 'none' }}>notes</a>
            <a href="/progress" style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)', textDecoration: 'none' }}>progress</a>
            <a href="/dashboard" style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)', textDecoration: 'none' }}>← back</a>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            maxWidth: '760px',
            width: '100%',
            margin: '0 auto',
            alignSelf: 'center',
          }}
        >
          {messages.map((m, i) => {
            if (m.type === 'validation' && m.validationResult) {
              return (
                <div key={i}>
                  <MasteryGate
                    result={m.validationResult}
                    attemptNumber={m.validationResult.attempt_number}
                    maxAttempts={4}
                  />
                </div>
              )
            }

            if (!m.content) return null

            return (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div
                  style={{
                    maxWidth: '80%',
                    padding: '12px 16px',
                    borderRadius: '4px',
                    fontSize: '14px',
                    lineHeight: 1.65,
                    background: m.role === 'user' ? 'var(--foreground)' : 'var(--card)',
                    color: m.role === 'user' ? 'var(--background)' : 'var(--foreground)',
                    border: '2px solid var(--border)',
                    boxShadow: '3px 3px 0 0 hsl(0 0% 10%)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {m.content}
                </div>
              </div>
            )
          })}

          {loading && (
            <div style={{ display: 'flex', gap: '4px', padding: '12px 0' }}>
              <span className="ctd" /><span className="ctd" /><span className="ctd" />
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div
          style={{
            borderTop: '2px solid var(--border)',
            padding: '16px 24px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', gap: '10px', maxWidth: '760px', margin: '0 auto' }}>
            <textarea
              ref={inputRef}
              className="ta"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder={placeholderText}
              rows={1}
              disabled={loading}
            />
            <button
              className="sb"
              onClick={send}
              disabled={loading || !input.trim()}
            >
              send
            </button>
          </div>
          {phase === 'awaiting_explanation' && (
            <p style={{ ...mono, fontSize: '10px', color: 'var(--muted-foreground)', textAlign: 'center', marginTop: '8px', letterSpacing: '0.04em' }}>
              shift+enter for newline — enter to send
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Message { role: 'assistant' | 'user'; content: string }

const MODE_META: Record<string, { label: string; tagline: string; placeholder: string; welcome: string }> = {
  spark:  { label: 'spark',  tagline: 'stuck on one thing?',     placeholder: 'ask anything...',                  welcome: "what do you want to understand right now?" },
  recall: { label: 'recall', tagline: 'prove you know it.',       placeholder: 'explain it back...',               welcome: "pick a topic and explain it to me from scratch. i'll find what broke down." },
  build:  { label: 'build',  tagline: 'figure it out yourself.',  placeholder: 'describe what you want to build...', welcome: "what are you building today? walk me through it." },
}

export default function ChatPage({ mode }: { mode: string }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const meta = MODE_META[mode] || MODE_META.spark

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setMessages([{ role: 'assistant', content: meta.welcome }])
    }
    init()
  }, [])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  const send = async () => {
    if (!input.trim() || loading) return
    const userMsg: Message = { role: 'user', content: input }
    const updated = [...messages, userMsg]
    setMessages(updated); setInput(''); setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, messages: updated })
      })
      const data = await res.json()
      if (data.reply) setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "something went wrong, try again" }])
    } finally { setLoading(false) }
  }

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a0a', color: '#f5f5f5', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#222;border-radius:2px}
        .ci{background:#111;border:1.5px solid #222;border-radius:6px;color:#f5f5f5;font-size:14px;padding:14px 18px;outline:none;width:100%;font-family:Inter,sans-serif;transition:border-color 0.15s,box-shadow 0.15s}
        .ci:focus{border-color:#FFE000;box-shadow:0 0 0 2px rgba(255,224,0,0.1)}
        .ci::placeholder{color:#444}
        .csb{background:#FFE000;color:#0a0a0a;font-weight:700;font-size:13px;padding:14px 22px;border-radius:6px;border:none;cursor:pointer;font-family:'DM Mono',monospace;white-space:nowrap;transition:transform 0.15s,box-shadow 0.15s;box-shadow:3px 3px 0px #333}
        .csb:hover{transform:translate(-2px,-2px);box-shadow:5px 5px 0px #333}
        .csb:disabled{opacity:.3;cursor:not-allowed;transform:none;box-shadow:3px 3px 0px #333}
        .dot{width:5px;height:5px;border-radius:50%;background:#555;animation:bounce 1.2s infinite;display:inline-block}
        .dot:nth-child(2){animation-delay:.2s}.dot:nth-child(3){animation-delay:.4s}
        @keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}
      `}</style>

      {/* Nav */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '20px 32px', borderBottom: '1px solid #1a1a1a',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#FFE000', display: 'inline-block' }} />
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '16px', fontWeight: 500, color: '#f5f5f5' }}>assign</span>
          </a>
          <div style={{ width: 1, height: 16, background: '#222' }} />
          <div>
            <span style={{
              fontFamily: 'DM Mono, monospace', fontSize: '13px',
              fontWeight: 600, color: '#FFE000',
            }}>{meta.label}</span>
            <span style={{
              fontFamily: 'DM Mono, monospace', fontSize: '11px',
              color: '#444', marginLeft: '8px',
            }}>{meta.tagline}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <a href="/dashboard" style={{ fontFamily: 'DM Mono, monospace', fontSize: '11px', color: '#555', textDecoration: 'none' }}>dashboard</a>
          <a href="/" style={{ fontFamily: 'DM Mono, monospace', fontSize: '11px', color: '#555', textDecoration: 'none' }}>← home</a>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '32px 24px',
        display: 'flex', flexDirection: 'column', gap: '12px',
        maxWidth: '760px', width: '100%', margin: '0 auto',
      }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '78%', padding: '14px 18px', fontSize: '14px',
              lineHeight: 1.7, whiteSpace: 'pre-wrap', borderRadius: '8px',
              ...(m.role === 'user'
                ? { background: '#FFE000', color: '#0a0a0a', fontWeight: 500 }
                : { background: '#111', color: '#e5e5e5', border: '1.5px solid #1e1e1e' }
              )
            }}>{m.content}</div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              padding: '14px 20px', background: '#111', border: '1.5px solid #1e1e1e',
              borderRadius: '8px', display: 'flex', gap: '6px', alignItems: 'center',
            }}>
              <span className="dot" /><span className="dot" /><span className="dot" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '16px 24px 32px', maxWidth: '760px',
        width: '100%', margin: '0 auto', display: 'flex', gap: '10px',
      }}>
        <input
          className="ci"
          placeholder={meta.placeholder}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          disabled={loading}
        />
        <button className="csb" onClick={send} disabled={loading || !input.trim()}>send →</button>
      </div>
    </main>
  )
}

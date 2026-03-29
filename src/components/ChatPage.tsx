'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Message { role: 'assistant' | 'user'; content: string }

const MODE_META: Record<string, { label: string; placeholder: string; welcome: string }> = {
  spark:  { label: 'spark',  placeholder: 'ask anything...',       welcome: "what do you want to understand right now?" },
  recall: { label: 'recall', placeholder: 'explain it back...',    welcome: "pick a topic and explain it to me from scratch. i'll find what broke down." },
  build:  { label: 'build',  placeholder: 'describe what you want to build...', welcome: "what are you building today? walk me through it." },
}

const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' }
const serif: React.CSSProperties = { fontFamily: 'var(--font-serif)' }
const shadowSm: React.CSSProperties = { boxShadow: '3px 3px 0px 0px hsl(0 0% 10%)' }

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
    } catch { setMessages(prev => [...prev, { role: 'assistant', content: "something went wrong, try again" }]) }
    finally { setLoading(false) }
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--background)', color: 'var(--foreground)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--muted);border-radius:2px}
        .ci{background:var(--card);border:2px solid var(--border);border-radius:4px;color:var(--foreground);font-size:14px;padding:13px 16px;outline:none;width:100%;font-family:var(--font-sans);transition:box-shadow 0.15s}.ci:focus{box-shadow:4px 4px 0 0 hsl(0 0% 10%)}.ci::placeholder{color:var(--muted-foreground)}
        .csb{background:var(--foreground);color:var(--background);font-weight:600;font-size:13px;padding:13px 20px;border-radius:4px;border:2px solid var(--border);cursor:pointer;font-family:var(--font-mono);white-space:nowrap;box-shadow:4px 4px 0 0 hsl(0 0% 10%);transition:box-shadow 0.15s,transform 0.15s}.csb:hover{box-shadow:6px 6px 0 0 hsl(0 0% 10%);transform:translate(-2px,-2px)}.csb:disabled{opacity:.3;cursor:not-allowed;transform:none;box-shadow:4px 4px 0 0 hsl(0 0% 10%)}
        .ctd{width:5px;height:5px;border-radius:50%;background:var(--muted-foreground);animation:cbounce 1.2s infinite;display:inline-block}.ctd:nth-child(2){animation-delay:.2s}.ctd:nth-child(3){animation-delay:.4s}
        @keyframes cbounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}
      `}</style>

      {/* Nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 28px 18px', borderBottom: '2px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <a href="/" style={{ textDecoration: 'none' }}><span style={{ ...serif, fontSize: '22px', letterSpacing: '-0.5px', color: 'var(--foreground)' }}>assign</span></a>
          <span style={{ ...mono, fontSize: '11px', border: '1.5px solid var(--border)', borderRadius: '4px', padding: '3px 8px', color: 'var(--foreground)' }}>{meta.label}</span>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <a href="/dashboard" style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)', textDecoration: 'none' }}>dashboard</a>
          <a href="/" style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)', textDecoration: 'none' }}>← home</a>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '720px', width: '100%', margin: '0 auto' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '78%', padding: '12px 16px', fontSize: '14px', lineHeight: 1.65, whiteSpace: 'pre-wrap', borderRadius: '4px', border: '2px solid var(--border)', ...shadowSm, ...(m.role === 'user' ? { background: 'var(--foreground)', color: 'var(--background)' } : { background: 'var(--card)', color: 'var(--foreground)' }) }}>{m.content}</div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '14px 18px', background: 'var(--card)', border: '2px solid var(--border)', borderRadius: '4px', display: 'flex', gap: '5px', alignItems: 'center', ...shadowSm }}>
              <span className="ctd" /><span className="ctd" /><span className="ctd" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '14px 28px 28px', maxWidth: '720px', width: '100%', margin: '0 auto', display: 'flex', gap: '10px' }}>
        <input className="ci" placeholder={meta.placeholder} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()} disabled={loading} />
        <button className="csb" onClick={send} disabled={loading || !input.trim()}>send</button>
      </div>
    </main>
  )
}
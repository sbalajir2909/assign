'use client'

import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'assistant' | 'user'
  content: string
}

interface ChatPageProps {
  mode: 'spark' | 'trek' | 'recall'
  emoji: string
  accentColor: string
  initialMessage: string
  placeholder: string
  tagline: string
}

export default function ChatPage({ mode, emoji, accentColor, initialMessage, placeholder, tagline }: ChatPageProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: initialMessage }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    if (!input.trim()) return
    const userMessage: Message = { role: 'user', content: input }
    const updated = [...messages, userMessage]
    setMessages(updated)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updated, mode })
      })
      const data = await res.json()
      setMessages([...updated, { role: 'assistant', content: data.reply }])
    } catch {
      setMessages([...updated, { role: 'assistant', content: "something went wrong, try again" }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: '#080808',
      color: '#fff',
      fontFamily: "'Syne', sans-serif",
      display: 'flex',
      flexDirection: 'column',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .chat-input {
          background: #111;
          border: 1px solid #222;
          border-radius: 14px;
          color: #fff;
          font-size: 14px;
          padding: 14px 18px;
          outline: none;
          width: 100%;
          font-family: 'Syne', sans-serif;
          transition: border-color 0.2s ease;
        }
        .chat-input:focus {
          border-color: ${accentColor};
        }
        .chat-input::placeholder {
          color: #333;
        }

        .send-btn {
          background: ${accentColor};
          color: #000;
          font-weight: 700;
          font-size: 13px;
          padding: 14px 22px;
          border-radius: 14px;
          border: none;
          cursor: pointer;
          font-family: 'Syne', sans-serif;
          transition: opacity 0.15s ease, transform 0.15s ease;
          white-space: nowrap;
          letter-spacing: -0.2px;
        }
        .send-btn:hover {
          opacity: 0.85;
          transform: translateY(-1px);
        }
        .send-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
          transform: none;
        }

        .msg-bubble {
          max-width: 80%;
          padding: 14px 18px;
          border-radius: 18px;
          font-size: 14px;
          line-height: 1.6;
          white-space: pre-wrap;
        }

        .msg-user {
          background: ${accentColor};
          color: #000;
          font-weight: 500;
          border-bottom-right-radius: 4px;
          margin-left: auto;
        }

        .msg-assign {
          background: #111;
          color: #ccc;
          border: 1px solid #1a1a1a;
          border-bottom-left-radius: 4px;
        }

        .thinking-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #444;
          animation: bounce 1.2s infinite;
          display: inline-block;
        }
        .thinking-dot:nth-child(2) { animation-delay: 0.2s; }
        .thinking-dot:nth-child(3) { animation-delay: 0.4s; }

        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }

        .back-btn {
          color: #333;
          font-size: 12px;
          text-decoration: none;
          font-family: 'DM Mono', monospace;
          letter-spacing: 0.03em;
          transition: color 0.15s ease;
        }
        .back-btn:hover { color: #fff; }

        .grain {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          opacity: 0.025;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
        }
      `}</style>

      <div className="grain" />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100vh', maxWidth: '680px', margin: '0 auto', width: '100%', padding: '0 24px' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 0 20px', borderBottom: '1px solid #111' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.5px' }}>assign</span>
            <span style={{
              fontSize: '11px',
              fontFamily: "'DM Mono', monospace",
              color: accentColor,
              background: accentColor + '15',
              padding: '3px 8px',
              borderRadius: '6px',
              letterSpacing: '0.05em',
            }}>
              {emoji} {mode}
            </span>
          </div>
          <a href="/" className="back-btn">← back</a>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div className={`msg-bubble ${m.role === 'user' ? 'msg-user' : 'msg-assign'}`}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div className="msg-bubble msg-assign" style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '16px 18px' }}>
                <span className="thinking-dot" />
                <span className="thinking-dot" />
                <span className="thinking-dot" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div style={{ padding: '16px 0 28px', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input
            className="chat-input"
            placeholder={placeholder}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            disabled={loading}
          />
          <button className="send-btn" onClick={send} disabled={loading}>
            send
          </button>
        </div>

      </div>
    </main>
  )
}
'use client'

import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'assistant' | 'user'
  content: string
}

export default function SparkPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "yo, what's the one thing you're stuck on right now?" }
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

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: updated, mode: 'spark' })
    })

    const data = await res.json()
    setMessages([...updated, { role: 'assistant', content: data.reply }])
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-xl flex flex-col h-screen py-8">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">assign</h1>
            <p className="text-xs text-zinc-500 mt-1">⚡ spark</p>
          </div>
          <a href="/" className="text-xs text-zinc-500 hover:text-white transition">← back</a>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                m.role === 'user' ? 'bg-white text-black rounded-br-sm' : 'bg-zinc-900 text-zinc-100 rounded-bl-sm'
              }`}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-zinc-900 text-zinc-400 px-4 py-3 rounded-2xl rounded-bl-sm text-sm">thinking...</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="mt-4 flex gap-2 items-center">
          <input
            className="flex-1 bg-zinc-900 text-white text-sm rounded-xl px-4 py-3 outline-none placeholder-zinc-600 focus:ring-1 focus:ring-zinc-700"
            placeholder="what are you stuck on?"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
          />
          <button onClick={send} className="bg-white text-black text-sm font-medium px-4 py-3 rounded-xl hover:bg-zinc-200 transition">send</button>
        </div>
      </div>
    </main>
  )
}

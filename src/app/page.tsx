'use client'

import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'assistant' | 'user'
  content: string
}

type Mode = 'spark' | 'trek' | 'recall' | null

export default function Home() {
  const [mode, setMode] = useState<Mode>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (mode === 'spark') {
      setMessages([{ role: 'assistant', content: "Yo, what's the one thing you're stuck on right now?" }])
    } else if (mode === 'trek') {
      setMessages([{ role: 'assistant', content: "okay let's go deep. what topic do you want to understand from scratch?" }])
    } else if (mode === 'recall') {
      setMessages([{ role: 'assistant', content: "alright let's see what actually stuck. what did you learn recently that you want to test yourself on?" }])
    }
  }, [mode])

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
      body: JSON.stringify({ messages: updated, mode })
    })

    const data = await res.json()
    setMessages([...updated, { role: 'assistant', content: data.reply }])
    setLoading(false)
  }

  if (!mode) {
    return (
      <main className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-xl">
          <h1 className="text-3xl font-semibold tracking-tight text-white mb-1">assign</h1>
          <p className="text-zinc-500 text-sm mb-12">what do you want to do today?</p>

          <div className="space-y-4">
            <button
              onClick={() => setMode('spark')}
              className="w-full text-left bg-zinc-900 hover:bg-zinc-800 transition rounded-2xl px-6 py-5 group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-white font-medium text-lg">spark ⚡</span>
                <span className="text-zinc-600 text-xs group-hover:text-zinc-400 transition">quick session →</span>
              </div>
              <p className="text-zinc-400 text-sm leading-relaxed">stuck on one specific thing? explain it to me and i'll break it down until you actually get it. five minutes, one concept, done.</p>
            </button>

            <button
              onClick={() => setMode('trek')}
              className="w-full text-left bg-zinc-900 hover:bg-zinc-800 transition rounded-2xl px-6 py-5 group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-white font-medium text-lg">trek 🗺️</span>
                <span className="text-zinc-600 text-xs group-hover:text-zinc-400 transition">full journey →</span>
              </div>
              <p className="text-zinc-400 text-sm leading-relaxed">want to understand something end to end? tell me the topic and we'll go through it together, piece by piece, until the whole thing makes sense.</p>
            </button>

            <button
              onClick={() => setMode('recall')}
              className="w-full text-left bg-zinc-900 hover:bg-zinc-800 transition rounded-2xl px-6 py-5 group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-white font-medium text-lg">recall 🧠</span>
                <span className="text-zinc-600 text-xs group-hover:text-zinc-400 transition">test yourself →</span>
              </div>
              <p className="text-zinc-400 text-sm leading-relaxed">learned something recently? let's find out what actually stuck. i'll ask you questions, catch the gaps, and fix only what's broken.</p>
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-xl flex flex-col h-screen py-8">
        
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">assign</h1>
            <p className="text-xs text-zinc-500 mt-1">
              {mode === 'spark' ? '⚡ spark' : mode === 'trek' ? '🗺️ trek' : '🧠 recall'}
            </p>
          </div>
          <button
            onClick={() => { setMode(null); setMessages([]) }}
            className="text-xs text-zinc-500 hover:text-white transition"
          >
            switch mode
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-white text-black rounded-br-sm'
                  : 'bg-zinc-900 text-zinc-100 rounded-bl-sm'
              }`}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-zinc-900 text-zinc-400 px-4 py-3 rounded-2xl rounded-bl-sm text-sm">
                thinking...
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="mt-4 flex gap-2 items-center">
          <input
            className="flex-1 bg-zinc-900 text-white text-sm rounded-xl px-4 py-3 outline-none placeholder-zinc-600 focus:ring-1 focus:ring-zinc-700"
            placeholder={mode === 'spark' ? "what are you stuck on?" : mode === 'trek' ? "what do you want to learn?" : "what did you learn recently?"}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
          />
          <button
            onClick={send}
            className="bg-white text-black text-sm font-medium px-4 py-3 rounded-xl hover:bg-zinc-200 transition"
          >
            send
          </button>
        </div>

      </div>
    </main>
  )
}
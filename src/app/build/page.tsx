'use client'

import { useState, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

interface Message {
  role: 'assistant' | 'user'
  content: string
}

type Language = 'javascript' | 'python' | 'typescript' | 'java' | 'cpp'

const STARTER_CODE: Record<Language, string> = {
  javascript: '// start writing your code here\n',
  python: '# start writing your code here\n',
  typescript: '// start writing your code here\n',
  java: '// start writing your code here\npublic class Main {\n  public static void main(String[] args) {\n    \n  }\n}\n',
  cpp: '// start writing your code here\n#include <iostream>\nusing namespace std;\n\nint main() {\n  \n  return 0;\n}\n',
}

export default function BuildPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "yo what are we building today? tell me the problem and what language you want to use." }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [code, setCode] = useState<string>(STARTER_CODE['javascript'])
  const [language, setLanguage] = useState<Language>('javascript')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang)
    setCode(STARTER_CODE[lang])
  }

  const send = async (messageToSend?: string) => {
    const content = messageToSend || input
    if (!content.trim()) return

    const userMessage: Message = { role: 'user', content: content }
    const updated = [...messages, userMessage]
    setMessages(updated)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updated,
          mode: 'build',
          code: code,
          language: language
        })
      })

      const data = await res.json()
      setMessages([...updated, { role: 'assistant', content: data.reply }])
    } catch (err) {
      setMessages([...updated, { role: 'assistant', content: "something went wrong, try again" }])
    } finally {
      setLoading(false)
    }
  }

  const submitCode = () => {
    if (!code.trim() || code.trim() === STARTER_CODE[language].trim()) {
      send("i haven't written any code yet, where do i start?")
      return
    }
    send(`here's my code so far:\n\`\`\`${language}\n${code}\n\`\`\``)
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">

      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <div>
          <h1 className="text-xl font-semibold text-white">assign</h1>
          <p className="text-xs text-zinc-500">🛠️ build</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={language}
            onChange={e => handleLanguageChange(e.target.value as Language)}
            className="bg-zinc-900 text-zinc-300 text-xs rounded-lg px-3 py-2 outline-none border border-zinc-700 cursor-pointer"
          >
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="typescript">TypeScript</option>
            <option value="java">Java</option>
            <option value="cpp">C++</option>
          </select>
          <a href="/" className="text-xs text-zinc-500 hover:text-white transition">← back</a>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 65px)' }}>

        <div className="w-1/2 flex flex-col border-r border-zinc-800">
          <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-950">
            <span className="text-xs text-zinc-500 font-mono">{language}</span>
            <button
              onClick={submitCode}
              className="bg-white text-black text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-zinc-200 transition"
            >
              show assign →
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <Editor
              height="100%"
              language={language}
              value={code}
              onChange={value => setCode(value || '')}
              theme="vs-dark"
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                lineNumbers: 'on',
                renderLineHighlight: 'line',
                padding: { top: 16 },
                fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
                cursorBlinking: 'smooth',
                smoothScrolling: true,
              }}
            />
          </div>
        </div>

        <div className="w-1/2 flex flex-col bg-[#0a0a0a]">
          <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-950">
            <span className="text-xs text-zinc-500">assign</span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
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

          <div className="p-4 border-t border-zinc-800 flex gap-2">
            <input
              className="flex-1 bg-zinc-900 text-white text-sm rounded-xl px-4 py-3 outline-none placeholder-zinc-600 focus:ring-1 focus:ring-zinc-700"
              placeholder="ask assign something..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              disabled={loading}
            />
            <button
              onClick={() => send()}
              disabled={loading}
              className="bg-white text-black text-sm font-medium px-4 py-3 rounded-xl hover:bg-zinc-200 transition disabled:opacity-50"
            >
              send
            </button>
          </div>
        </div>

      </div>
    </main>
  )
}
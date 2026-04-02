'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, Mic, MicOff } from 'lucide-react'

type BrowserSpeechRecognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition

export type ChatMessage = {
  id: string
  role: 'ai' | 'user'
  text: string
  isError?: boolean
  timestamp: Date
}

type Props = {
  messages: ChatMessage[]
  onSend: (text: string) => void
  mode: 'chat' | 'voice'
  unread: number
  onOpen: () => void
}

const AssignIcon = () => (
  <svg width="14" height="16" viewBox="0 0 24 30" fill="none">
    <path
      d="M12.8492 24.4945H24V29.962C21.4073 29.8743 18.7213 30.0785 16.1397 29.9643C13.2258 29.836 10.5209 28.6067 9.12138 26.2387C7.89229 24.1602 8.13447 21.3862 9.84793 19.5837C11.735 17.5994 14.3309 15.8416 16.2082 13.8537C19.9804 9.86039 15.2696 3.92914 9.85055 5.88817C8.31789 6.44251 6.26305 8.52334 6.26305 10.061V25.0229H0.00261097L0 10.3523C0.79504 1.90009 11.1462 -3.1849 19.0385 2.24729C23.735 5.47977 25.7161 12.2296 21.5888 16.5295C18.9993 19.2277 15.6103 21.6416 12.9465 24.3173L12.8492 24.4945Z"
      fill="currentColor"
    />
  </svg>
)

export function FloatingChat({ messages, onSend, mode, unread, onOpen }: Props) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [isListening, setIsListening] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null)

  useEffect(() => {
    if (open) {
      onOpen()
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }
  }, [open, onOpen])

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, open])

  const toggleVoice = useCallback(() => {
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor
      webkitSpeechRecognition?: SpeechRecognitionConstructor
    }

    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
    if (!Recognition) {
      window.alert('Voice recognition is not supported in this browser. Try Chrome.')
      return
    }

    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    const recognition = new Recognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? ''
      setInput(transcript)
      setIsListening(false)
    }
    recognition.onerror = () => setIsListening(false)
    recognition.onend = () => setIsListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [isListening])

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed) return
    onSend(trimmed)
    setInput('')
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 16 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="w-[360px] bg-background border-2 border-foreground brutalist-shadow-lg flex flex-col"
            style={{ maxHeight: '70vh', minHeight: '400px' }}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b-2 border-foreground bg-foreground text-background flex-shrink-0">
              <div className="w-7 h-7 bg-background text-foreground flex items-center justify-center">
                <AssignIcon />
              </div>
              <div className="flex-1">
                <p className="font-mono text-xs font-bold uppercase tracking-widest">Assign AI</p>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-green-400 animate-pulse" />
                  <p className="font-mono text-[10px] text-background/60">Online · {mode} mode</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="text-background/60 hover:text-background transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'ai' && (
                    <div className="w-6 h-6 bg-foreground text-background flex items-center justify-center flex-shrink-0 mt-0.5">
                      <AssignIcon />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] px-3 py-2.5 font-sans text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'ai'
                        ? msg.isError
                          ? 'bg-red-50 border-2 border-red-300 text-foreground'
                          : 'bg-muted border-2 border-foreground text-foreground'
                        : 'bg-foreground text-background border-2 border-foreground'
                    }`}
                  >
                    {msg.isError && (
                      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-red-600 block mb-1">
                        Code issue detected
                      </span>
                    )}
                    {msg.text}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="border-t-2 border-foreground flex-shrink-0">
              <div className="flex items-end">
                {mode === 'voice' && (
                  <button
                    onClick={toggleVoice}
                    className={`px-3 py-3 border-r-2 border-foreground transition-colors ${
                      isListening ? 'bg-red-500 text-white' : 'bg-muted hover:bg-primary hover:text-white text-muted-foreground'
                    }`}
                  >
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                )}
                <textarea
                  ref={inputRef}
                  rows={2}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder={isListening ? 'Listening...' : 'Ask me anything...'}
                  disabled={isListening}
                  className="flex-1 resize-none bg-background px-3 py-2.5 font-sans text-sm placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="px-3 py-3 bg-foreground text-background border-l-2 border-foreground hover:bg-primary transition-colors disabled:opacity-30"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen((current) => !current)}
        className="relative w-14 h-14 bg-foreground text-background border-2 border-foreground brutalist-shadow flex items-center justify-center hover:bg-primary transition-colors"
      >
        {open ? <X className="w-5 h-5" /> : <AssignIcon />}

        <AnimatePresence>
          {unread > 0 && !open && (
            <motion.div
              key="badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white flex items-center justify-center font-mono text-[10px] font-bold border-2 border-background"
            >
              {unread > 9 ? '9+' : unread}
            </motion.div>
          )}
        </AnimatePresence>

        {unread > 0 && !open && <span className="absolute inset-0 border-2 border-red-400 animate-ping opacity-50" />}
      </motion.button>
    </div>
  )
}

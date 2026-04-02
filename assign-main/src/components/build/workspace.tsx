'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, ChevronDown, CheckSquare, Square, Lightbulb } from 'lucide-react'
import { FloatingChat, type ChatMessage } from '@/components/build/floating-chat'
import type { Topic, Language } from '@/components/build/topics'

type Props = {
  topic: Topic
  aiMode: 'chat' | 'voice'
  onBack: () => void
}

function createChatMessage(role: 'ai' | 'user', text: string, isError = false): ChatMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    text,
    isError,
    timestamp: new Date(),
  }
}

function getFriendlyError(message: string): string {
  const lower = message.toLowerCase()

  if (lower.includes('unexpected token')) {
    const token = message.match(/'([^']+)'/)?.at(1) ?? 'something unexpected'
    return `Hey! Looks like there's a syntax issue. I spotted ${
      token === '}' || token === ')' ? 'an extra closing bracket or parenthesis' : `an unexpected "${token}"`
    }.\n\nThat usually means a missing comma, semicolon, or mismatched bracket a few lines above.`
  }

  if (lower.includes('is not defined')) {
    const name = message.match(/(\w+) is not defined/)?.at(1) ?? 'something'
    return `Heads up. "${name}" is being used before it exists.\n\nMake sure you declared it with let, const, var, or as a parameter before using it.`
  }

  if (lower.includes('unexpected end of input')) {
    return 'Almost there. Your code ends too early, which usually means a missing closing bracket or parenthesis.'
  }

  if (lower.includes('missing ) after')) {
    return 'Close one. You are missing a closing parenthesis somewhere. Check your function calls and conditions.'
  }

  if (lower.includes('cannot read') || lower.includes('null') || lower.includes('undefined')) {
    return "You're trying to use a value that is null or undefined. Check whether it was assigned before you used it."
  }

  if (lower.includes('expected') || lower.includes('missing') || lower.includes(':')) {
    return `I caught a syntax error: "${message}"\n\nDouble-check the line above for a missing colon, comma, or closing bracket.`
  }

  return `I noticed an issue: ${message}\n\nCompare that line to the task list on the left. What seems off?`
}

function detectJsError(code: string): string | null {
  try {
    new Function(code)
    return null
  } catch (error) {
    return (error as Error).message
  }
}

function detectPythonError(code: string): string | null {
  const lines = code.split('\n')

  for (let index = 0; index < lines.length; index += 1) {
    const stripped = lines[index].trim()
    if (/^(if|elif|else|for|while|def|class|with|try|except|finally)\b/.test(stripped) && !stripped.endsWith(':') && !stripped.endsWith('\\') && stripped !== '') {
      return `Missing colon at end of line ${index + 1}: "${stripped}"`
    }
  }

  return null
}

function getAiResponse(input: string, topic: Topic, hintUsed: number): string {
  const lower = input.toLowerCase()

  if (/hint|help|stuck|don'?t know|no idea|how do i|what should|tell me/.test(lower)) {
    const hint = topic.hints[hintUsed % topic.hints.length]
    return `Here's a nudge, not the answer:\n\n${hint}\n\nSee if that unlocks the next step.`
  }

  if (/why|explain|understand|what is|what does|how does|what'?s the/.test(lower)) {
    return `The core idea is this: ${topic.projectDesc
      .split('.')
      .slice(0, 2)
      .join('.')}.\n\nWhich part feels unclear right now?`
  }

  if (/done|finished|solved|complete|got it|working|works/.test(lower)) {
    return 'Nice. Run it and check the output. If something still feels off, paste the error or wrong result and we can debug it.'
  }

  if (/error|bug|broken|wrong|fail|not working|issue/.test(lower)) {
    return "Let's debug it. Paste the exact error message if you have one. If there's no error, tell me what output you expected versus what you got."
  }

  if (/what next|what should i|where do i start/.test(lower)) {
    return "Start with the first task on the left and solve only that piece. Don't write the whole thing at once."
  }

  const fallbacks = [
    'Make sure your logic matches the first requirement in the list. What does it ask for exactly?',
    'Run the code and compare the actual output to the expected one. That usually tells you the next fix.',
    'Walk me through what line 1 is supposed to do before we change anything.',
    'Think about the example input. What should happen step by step?',
  ]

  return fallbacks[Math.floor(Math.random() * fallbacks.length)]
}

function speakText(text: string) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text.replace(/[*_`#]/g, ''))
    utterance.rate = 1.05
    utterance.pitch = 1
    const voices = window.speechSynthesis.getVoices()
    const preferred =
      voices.find((voice) => voice.lang === 'en-US' && voice.name.toLowerCase().includes('google')) ||
      voices.find((voice) => voice.lang === 'en-US')
    if (preferred) utterance.voice = preferred
    window.speechSynthesis.speak(utterance)
  }
}

export function Workspace({ topic, aiMode, onBack }: Props) {
  const [language, setLanguage] = useState<Language>(topic.languages[0])
  const [code, setCode] = useState(topic.starterCode[topic.languages[0]] ?? '')
  const [messages, setMessages] = useState<ChatMessage[]>(() => [createChatMessage('ai', topic.aiOpener)])
  const [unread, setUnread] = useState(0)
  const [chatOpen, setChatOpen] = useState(false)
  const [completedTasks, setCompletedTasks] = useState<Set<number>>(new Set())
  const [showHints, setShowHints] = useState(false)
  const [hintIndex, setHintIndex] = useState(0)
  const [langDropOpen, setLangDropOpen] = useState(false)
  const errorDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastError = useRef<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const addAiMessage = useCallback(
    (text: string, isError = false) => {
      const message = createChatMessage('ai', text, isError)
      setMessages((current) => [...current, message])
      if (!chatOpen) setUnread((count) => count + 1)
      if (aiMode === 'voice') speakText(text)
    },
    [chatOpen, aiMode]
  )

  useEffect(() => {
    if (errorDebounce.current) clearTimeout(errorDebounce.current)

    errorDebounce.current = setTimeout(() => {
      const error = language === 'Python' ? detectPythonError(code) : detectJsError(code)

      if (error && error !== lastError.current) {
        lastError.current = error
        addAiMessage(getFriendlyError(error), true)
      } else if (!error) {
        lastError.current = null
      }
    }, 900)

    return () => {
      if (errorDebounce.current) clearTimeout(errorDebounce.current)
    }
  }, [code, language, addAiMessage])

  const handleSend = useCallback(
    (text: string) => {
      const userMessage = createChatMessage('user', text)
      setMessages((current) => [...current, userMessage])

      window.setTimeout(() => {
        const isHintRequest = /hint|help|stuck/i.test(text)
        const response = getAiResponse(text, topic, hintIndex)
        if (isHintRequest) setHintIndex((current) => current + 1)
        addAiMessage(response)
      }, 700 + Math.random() * 400)
    },
    [topic, hintIndex, addAiMessage]
  )

  const handleLangChange = (nextLanguage: Language) => {
    setLanguage(nextLanguage)
    setCode(topic.starterCode[nextLanguage] ?? `// Start coding in ${nextLanguage}\n`)
    setLangDropOpen(false)
    lastError.current = null
    addAiMessage(`Switched to ${nextLanguage}. Same challenge, updated starter code.`)
  }

  const lineCount = code.split('\n').length

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <div className="h-[56px] border-b-2 border-foreground bg-background flex items-center px-4 gap-4 flex-shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>

        <div className="h-5 w-px bg-foreground/20" />

        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">Building:</span>
          <span className="font-sans font-semibold text-sm">{topic.project}</span>
        </div>

        <div className="ml-auto relative">
          <button
            onClick={() => setLangDropOpen((current) => !current)}
            className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest border-2 border-foreground px-3 py-1.5 hover:bg-muted transition-colors"
          >
            {language}
            <ChevronDown className="w-3 h-3" />
          </button>
          {langDropOpen && (
            <div className="absolute top-full right-0 mt-1 bg-background border-2 border-foreground brutalist-shadow z-20">
              {topic.languages.map((option) => (
                <button
                  key={option}
                  onClick={() => handleLangChange(option)}
                  className={`block w-full text-left px-4 py-2.5 font-mono text-xs uppercase tracking-widest transition-colors ${
                    option === language ? 'bg-foreground text-background' : 'hover:bg-muted'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="w-[280px] flex-shrink-0 border-r-2 border-foreground overflow-y-auto flex flex-col">
          <div className="p-5 border-b-2 border-foreground">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
              Your Project
            </p>
            <h2 className="font-sans font-bold text-lg leading-tight mb-3">{topic.project}</h2>
            <p className="font-sans text-sm text-muted-foreground leading-relaxed">{topic.projectDesc}</p>
          </div>

          <div className="p-5 flex-1">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">Tasks</p>
            <div className="space-y-3">
              {topic.tasks.map((task, index) => (
                <button
                  key={task}
                  onClick={() =>
                    setCompletedTasks((current) => {
                      const next = new Set(current)
                      if (next.has(index)) next.delete(index)
                      else next.add(index)
                      return next
                    })
                  }
                  className="flex items-start gap-3 w-full text-left group"
                >
                  {completedTasks.has(index) ? (
                    <CheckSquare className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  ) : (
                    <Square className="w-4 h-4 text-foreground/30 flex-shrink-0 mt-0.5 group-hover:text-foreground/60 transition-colors" />
                  )}
                  <span
                    className={`font-sans text-sm leading-relaxed ${
                      completedTasks.has(index) ? 'line-through text-muted-foreground' : 'text-foreground'
                    }`}
                  >
                    {task}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="p-5 border-t-2 border-foreground">
            <button
              onClick={() => setShowHints((current) => !current)}
              className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
            >
              <Lightbulb className="w-3.5 h-3.5" />
              {showHints ? 'Hide hints' : 'Show hints'}
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showHints ? 'rotate-90' : ''}`} />
            </button>
            {showHints && (
              <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 space-y-2">
                {topic.hints.map((hint) => (
                  <div key={hint} className="border-l-2 border-primary pl-3 font-sans text-xs text-muted-foreground leading-relaxed">
                    {hint}
                  </div>
                ))}
              </motion.div>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b-2 border-foreground bg-muted flex-shrink-0">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 bg-red-400" />
              <div className="w-3 h-3 bg-yellow-400" />
              <div className="w-3 h-3 bg-green-400" />
            </div>
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {language === 'Python' ? 'main.py' : language === 'TypeScript' ? 'main.ts' : 'main.js'}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground/50 ml-2">· {lineCount} lines</span>
          </div>

          <div className="flex flex-1 min-h-0 overflow-hidden">
            <div className="w-10 bg-muted border-r border-foreground/10 flex flex-col pt-3 select-none flex-shrink-0 overflow-hidden">
              {Array.from({ length: Math.max(lineCount, 20) }, (_, index) => (
                <div key={index} className="font-mono text-[11px] text-muted-foreground/40 text-right pr-3 leading-[1.65rem]">
                  {index + 1}
                </div>
              ))}
            </div>

            <textarea
              ref={textareaRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Tab') {
                  e.preventDefault()
                  const target = e.currentTarget
                  const start = target.selectionStart
                  const end = target.selectionEnd
                  const nextCode = `${code.slice(0, start)}  ${code.slice(end)}`
                  setCode(nextCode)
                  requestAnimationFrame(() => {
                    target.selectionStart = start + 2
                    target.selectionEnd = start + 2
                  })
                }
              }}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              className="flex-1 bg-background p-3 font-mono text-sm leading-[1.65rem] resize-none focus:outline-none text-foreground min-h-0 overflow-auto"
              style={{ tabSize: 2, fontFamily: "'DM Mono', monospace" }}
            />
          </div>
        </div>
      </div>

      <FloatingChat
        messages={messages}
        onSend={handleSend}
        mode={aiMode}
        unread={unread}
        onOpen={() => {
          setUnread(0)
          setChatOpen(true)
        }}
      />
    </div>
  )
}

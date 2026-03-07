'use client'

import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface Message {
  role: 'assistant' | 'user'
  content: string
}

interface Concept {
  id: number
  title: string
  why: string
  subtopics: string[]
  estimatedMinutes: number
  prereq: string | null
  status: 'locked' | 'current' | 'done'
}

interface Gist {
  emphasis: string
  outcomes: string[]
  prereqs: string[]
}

interface LearnerProfile {
  topic: string
  level: string
  goal: string
  time: string
}

type Phase = 'discovery' | 'gist' | 'learning'

export default function TrekPage() {
  const [phase, setPhase] = useState<Phase>('discovery')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [gist, setGist] = useState<Gist | null>(null)
  const [currentConcept, setCurrentConcept] = useState(0)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [newConcept, setNewConcept] = useState('')
  const [addingNew, setAddingNew] = useState(false)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [discoveryAnswers, setDiscoveryAnswers] = useState<Partial<LearnerProfile>>({})
  const [learnerProfile, setLearnerProfile] = useState<LearnerProfile | null>(null)
  const [roadmapId, setRoadmapId] = useState<string>('')
  const [sourcesHit, setSourcesHit] = useState<string[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  const answerKeys: (keyof LearnerProfile)[] = ['topic', 'level', 'goal', 'time']

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    askNextQuestion(0)
  }, [])

  const askNextQuestion = async (idx: number) => {
    setLoading(true)
    const res = await fetch('/api/trek', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase: 'discovery', questionIndex: idx })
    })
    const data = await res.json()
    setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    setLoading(false)
  }

  const generateCourse = async (answers: LearnerProfile) => {
    setLoading(true)
    setMessages(prev => [...prev, { role: 'assistant', content: "okay building your course now — pulling from wikipedia, academic sources, stack overflow. give me a sec..." }])
    try {
      const res = await fetch('/api/trek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generateRoadmap: true, discoveryAnswers: answers })
      })
      const data = await res.json()
      if (data.course) {
        const { gist: gistData, concepts: conceptsData } = data.course
        setGist(gistData)
        setSourcesHit(data.sourcesHit || [])
        setConcepts(conceptsData.map((c: Omit<Concept, 'id' | 'status'>, i: number) => ({
          ...c, id: i, status: 'locked' as const
        })))
        setPhase('gist')
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `course built from ${data.sourcesHit?.length || 0} sources. check the overview on the left — see what you'll walk out knowing, edit anything, then hit approve.`
        }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "something went wrong building your course, try again" }])
    } finally {
      setLoading(false)
    }
  }

  const planConceptTeaching = async (concept: Concept, profile: LearnerProfile) => {
    const res = await fetch('/api/trek', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase: 'plan', conceptTitle: concept.title, learnerProfile: profile })
    })
    const data = await res.json()
    return data.plan || null
  }

  const send = async () => {
    if (!input.trim() || loading) return
    const userMessage: Message = { role: 'user', content: input }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')

    if (phase === 'discovery') {
      const key = answerKeys[questionIndex]
      const updatedAnswers = { ...discoveryAnswers, [key]: input }
      setDiscoveryAnswers(updatedAnswers)
      const nextIdx = questionIndex + 1

      if (nextIdx < answerKeys.length) {
        setQuestionIndex(nextIdx)
        setLoading(true)
        setTimeout(() => askNextQuestion(nextIdx), 300)
      } else {
        const fullProfile = updatedAnswers as LearnerProfile
        setLearnerProfile(fullProfile)
        await generateCourse(fullProfile)
      }
      return
    }

    if (phase === 'learning') {
      setLoading(true)
      const currentC = concepts[currentConcept]
      try {
        const res = await fetch('/api/trek', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phase: 'learning',
            messages: updatedMessages,
            conceptTitle: currentC.title,
            learnerProfile
          })
        })
        const data = await res.json()

        if (data.conceptMastered) {
          const next = currentConcept + 1
          const updatedConcepts = concepts.map((c, i) => {
            if (i === currentConcept) return { ...c, status: 'done' as const }
            if (i === next) return { ...c, status: 'current' as const }
            return c
          })
          setConcepts(updatedConcepts)
          setCurrentConcept(next)
          if (roadmapId) {
            await supabase.from('roadmaps').update({ concepts: updatedConcepts, last_studied: new Date().toISOString() }).eq('id', roadmapId)
          }
          if (next < concepts.length && learnerProfile) {
            planConceptTeaching(updatedConcepts[next], learnerProfile)
          }
        }

        if (data.reply) {
          setMessages([...updatedMessages, { role: 'assistant', content: data.reply }])
        }
      } catch {
        setMessages([...updatedMessages, { role: 'assistant', content: "something went wrong, try again" }])
      } finally {
        setLoading(false)
      }
    }
  }

  const approveRoadmap = async () => {
    const updated = concepts.map((c, i) => ({
      ...c, status: i === 0 ? 'current' as const : 'locked' as const
    }))
    setConcepts(updated)
    setPhase('learning')

    // plan first concept
    const plan = learnerProfile ? await planConceptTeaching(updated[0], learnerProfile) : null
    const openingPrompt = plan?.openingPrompt || `okay let's start. tell me — what do you already know about ${updated[0].title}?`

    // save to supabase
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user && learnerProfile) {
      const { data } = await supabase
        .from('roadmaps')
        .insert({ user_id: session.user.id, topic: learnerProfile.topic, concepts: updated })
        .select().single()
      if (data) setRoadmapId(data.id)
    }

    // clear chat, start fresh with just the opening question
    setMessages([{ role: 'assistant', content: openingPrompt }])
  }

  const deleteConceptItem = (id: number) => setConcepts(prev => prev.filter(c => c.id !== id))
  const startEdit = (concept: Concept) => { setEditingId(concept.id); setEditValue(concept.title) }
  const saveEdit = (id: number) => { setConcepts(prev => prev.map(c => c.id === id ? { ...c, title: editValue } : c)); setEditingId(null) }
  const addConcept = () => {
    if (!newConcept.trim()) return
    setConcepts(prev => [...prev, { id: Date.now(), title: newConcept.trim(), why: '', subtopics: [], estimatedMinutes: 15, prereq: null, status: 'locked' }])
    setNewConcept('')
    setAddingNew(false)
  }

  const totalMinutes = concepts.reduce((acc, c) => acc + (c.estimatedMinutes || 0), 0)
  const sourceColors: Record<string, string> = { wikipedia: '#FFE500', wikidata: '#00FF87', openAlex: '#A855F7', stackOverflow: '#FF6B00', github: '#fff' }

  return (
    <main style={{ minHeight: '100vh', background: '#080808', color: '#fff', fontFamily: "'Syne', sans-serif", display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .chat-input { background: #111; border: 1px solid #222; border-radius: 14px; color: #fff; font-size: 14px; padding: 14px 18px; outline: none; width: 100%; font-family: 'Syne', sans-serif; transition: border-color 0.2s; }
        .chat-input:focus { border-color: #00FF87; }
        .chat-input::placeholder { color: #333; }
        .chat-input:disabled { opacity: 0.4; cursor: not-allowed; }
        .send-btn { background: #00FF87; color: #000; font-weight: 700; font-size: 13px; padding: 14px 22px; border-radius: 14px; border: none; cursor: pointer; font-family: 'Syne', sans-serif; transition: opacity 0.15s; white-space: nowrap; }
        .send-btn:hover { opacity: 0.85; }
        .send-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .msg-bubble { max-width: 80%; padding: 14px 18px; border-radius: 18px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
        .msg-user { background: #00FF87; color: #000; font-weight: 500; border-bottom-right-radius: 4px; margin-left: auto; }
        .msg-assign { background: #111; color: #ccc; border: 1px solid #1a1a1a; border-bottom-left-radius: 4px; }
        .concept-item { display: flex; align-items: flex-start; gap: 10px; padding: 10px 14px; border-radius: 10px; background: #111; border: 1px solid #1a1a1a; margin-bottom: 8px; transition: all 0.2s; }
        .concept-item.current { border-color: #00FF87; background: #00FF870a; }
        .concept-item.done { opacity: 0.4; }
        .concept-num { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; font-family: 'DM Mono', monospace; margin-top: 1px; }
        .edit-input { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; color: #fff; font-size: 13px; padding: 6px 10px; outline: none; flex: 1; font-family: 'Syne', sans-serif; }
        .approve-btn { width: 100%; background: #00FF87; color: #000; font-weight: 800; font-size: 15px; padding: 16px; border-radius: 14px; border: none; cursor: pointer; font-family: 'Syne', sans-serif; letter-spacing: -0.3px; transition: opacity 0.15s; margin-top: 16px; }
        .approve-btn:hover { opacity: 0.85; }
        .thinking-dot { width: 6px; height: 6px; border-radius: 50%; background: #444; animation: bounce 1.2s infinite; display: inline-block; }
        .thinking-dot:nth-child(2) { animation-delay: 0.2s; }
        .thinking-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes bounce { 0%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-6px); } }
        .grain { position: fixed; inset: 0; pointer-events: none; z-index: 0; opacity: 0.025; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E"); }
        .back-link { color: #333; font-size: 12px; text-decoration: none; font-family: 'DM Mono', monospace; transition: color 0.15s; }
        .back-link:hover { color: #fff; }
        .outcome-item { font-size: 12px; color: #666; padding: 5px 0; display: flex; gap: 8px; align-items: flex-start; line-height: 1.5; }
        .subtopic-tag { font-size: 10px; font-family: 'DM Mono', monospace; color: #444; background: #1a1a1a; padding: 2px 7px; border-radius: 4px; margin: 2px; display: inline-block; }
        .source-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
      `}</style>

      <div className="grain" />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', height: '100vh' }}>

        {/* Sidebar — shown during gist + learning */}
        {(phase === 'gist' || phase === 'learning') && (
          <div style={{ width: '300px', flexShrink: 0, borderRight: '1px solid #111', display: 'flex', flexDirection: 'column', padding: '24px 20px', overflowY: 'auto' }}>

            {/* Gist card — only during gist phase */}
            {gist && phase === 'gist' && (
              <div style={{ background: '#0e0e0e', border: '1px solid #1a1a1a', borderRadius: '14px', padding: '16px', marginBottom: '16px' }}>
                <div style={{ fontSize: '10px', fontFamily: "'DM Mono', monospace", color: '#00FF87', letterSpacing: '0.08em', marginBottom: '10px' }}>COURSE OVERVIEW</div>
                <p style={{ fontSize: '12px', color: '#555', lineHeight: 1.6, marginBottom: '14px' }}>{gist.emphasis}</p>

                {gist.prereqs?.length > 0 && (
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '10px', fontFamily: "'DM Mono', monospace", color: '#FF2D78', marginBottom: '6px' }}>BEFORE YOU START</div>
                    {gist.prereqs.map((p, i) => (
                      <div key={i} className="outcome-item"><span style={{ color: '#FF2D78', flexShrink: 0 }}>!</span>{p}</div>
                    ))}
                  </div>
                )}

                <div style={{ fontSize: '10px', fontFamily: "'DM Mono', monospace", color: '#FFE500', marginBottom: '8px' }}>YOU'LL BE ABLE TO</div>
                {gist.outcomes?.map((o, i) => (
                  <div key={i} className="outcome-item"><span style={{ color: '#00FF87', flexShrink: 0 }}>→</span>{o}</div>
                ))}

                <div style={{ marginTop: '14px', padding: '8px 12px', background: '#111', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#333', fontFamily: "'DM Mono', monospace" }}>{concepts.length} concepts · ~{totalMinutes}min</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {sourcesHit.map(s => (
                      <span key={s} className="source-dot" style={{ background: sourceColors[s] || '#333' }} title={s} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Roadmap label */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', fontFamily: "'DM Mono', monospace", color: '#00FF87', letterSpacing: '0.05em', marginBottom: '4px' }}>🗺️ ROADMAP</div>
              <div style={{ fontSize: '12px', color: '#444' }}>
                {phase === 'gist' ? 'edit then approve' : `concept ${currentConcept + 1} of ${concepts.length}`}
              </div>
            </div>

            {/* Concept list */}
            <div style={{ flex: 1 }}>
              {concepts.map((concept, i) => (
                <div key={concept.id} className={`concept-item ${concept.status}`}>
                  <div className="concept-num" style={{
                    background: concept.status === 'done' ? '#00FF87' : concept.status === 'current' ? '#00FF8720' : '#1a1a1a',
                    color: concept.status === 'done' ? '#000' : concept.status === 'current' ? '#00FF87' : '#444',
                    border: concept.status === 'current' ? '1px solid #00FF87' : 'none',
                  }}>
                    {concept.status === 'done' ? '✓' : i + 1}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {editingId === concept.id ? (
                      <input className="edit-input" value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveEdit(concept.id)} onBlur={() => saveEdit(concept.id)} autoFocus />
                    ) : (
                      <>
                        <div style={{ fontSize: '13px', color: concept.status === 'current' ? '#fff' : '#777', fontWeight: concept.status === 'current' ? 600 : 400 }}>
                          {concept.title}
                        </div>
                        {concept.why && phase === 'gist' && (
                          <div style={{ fontSize: '11px', color: '#383838', marginTop: '3px', lineHeight: 1.4 }}>{concept.why}</div>
                        )}
                        {concept.estimatedMinutes > 0 && phase === 'gist' && (
                          <div style={{ fontSize: '10px', color: '#2a2a2a', fontFamily: "'DM Mono', monospace", marginTop: '3px' }}>~{concept.estimatedMinutes} min</div>
                        )}
                        {concept.subtopics?.length > 0 && phase === 'learning' && concept.status === 'current' && (
                          <div style={{ marginTop: '5px' }}>
                            {concept.subtopics.map((s, si) => <span key={si} className="subtopic-tag">{s}</span>)}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {phase === 'gist' && editingId !== concept.id && (
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                      <button onClick={() => startEdit(concept)} style={{ background: 'none', border: 'none', color: '#2a2a2a', cursor: 'pointer', fontSize: '11px' }}>✏️</button>
                      <button onClick={() => deleteConceptItem(concept.id)} style={{ background: 'none', border: 'none', color: '#2a2a2a', cursor: 'pointer', fontSize: '11px' }}>✕</button>
                    </div>
                  )}
                </div>
              ))}

              {phase === 'gist' && (
                addingNew ? (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <input className="edit-input" value={newConcept} onChange={e => setNewConcept(e.target.value)} onKeyDown={e => e.key === 'Enter' && addConcept()} placeholder="concept name..." autoFocus style={{ flex: 1 }} />
                    <button onClick={addConcept} style={{ background: '#00FF87', color: '#000', border: 'none', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>+</button>
                  </div>
                ) : (
                  <button onClick={() => setAddingNew(true)} style={{ width: '100%', background: 'none', border: '1px dashed #1a1a1a', borderRadius: '10px', color: '#2a2a2a', padding: '10px', cursor: 'pointer', fontSize: '12px', marginTop: '4px', fontFamily: "'Syne', sans-serif" }}>
                    + add concept
                  </button>
                )
              )}
            </div>

            {/* Approve button */}
            {phase === 'gist' && (
              <button className="approve-btn" onClick={approveRoadmap}>
                start learning →
              </button>
            )}

            {/* Progress during learning */}
            {phase === 'learning' && (
              <div style={{ marginTop: '16px' }}>
                <div style={{ padding: '12px', background: '#0e0e0e', borderRadius: '10px', border: '1px solid #111', marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', color: '#333', fontFamily: "'DM Mono', monospace", marginBottom: '8px' }}>PROGRESS</div>
                  <div style={{ background: '#111', borderRadius: '4px', height: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: '#00FF87', width: `${(concepts.filter(c => c.status === 'done').length / concepts.length) * 100}%`, transition: 'width 0.5s ease', borderRadius: '4px' }} />
                  </div>
                  <div style={{ fontSize: '11px', color: '#333', marginTop: '8px' }}>
                    {concepts.filter(c => c.status === 'done').length} of {concepts.length} mastered
                  </div>
                </div>
                <a href="/dashboard" className="back-link" style={{ display: 'block', textAlign: 'center', padding: '10px', background: '#0e0e0e', borderRadius: '10px', border: '1px solid #111' }}>
                  view dashboard →
                </a>
              </div>
            )}
          </div>
        )}

        {/* Main chat area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: phase === 'discovery' ? '680px' : 'none', margin: phase === 'discovery' ? '0 auto' : '0', width: '100%', padding: '0 24px' }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 0 20px', borderBottom: '1px solid #111' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.5px' }}>assign</span>
              <span style={{ fontSize: '11px', fontFamily: "'DM Mono', monospace", color: '#00FF87', background: '#00FF8715', padding: '3px 8px', borderRadius: '6px', letterSpacing: '0.05em' }}>🗺️ trek</span>
              {phase === 'learning' && concepts[currentConcept] && (
                <span style={{ fontSize: '11px', fontFamily: "'DM Mono', monospace", color: '#FFE500', background: '#FFE50010', padding: '3px 8px', borderRadius: '6px' }}>
                  {concepts[currentConcept].title}
                </span>
              )}
              {phase === 'gist' && (
                <span style={{ fontSize: '11px', fontFamily: "'DM Mono', monospace", color: '#A855F7', background: '#A855F715', padding: '3px 8px', borderRadius: '6px' }}>
                  review course
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <a href="/dashboard" className="back-link">dashboard</a>
              <a href="/" className="back-link">← back</a>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div className={`msg-bubble ${m.role === 'user' ? 'msg-user' : 'msg-assign'}`}>{m.content}</div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div className="msg-bubble msg-assign" style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '16px 18px' }}>
                  <span className="thinking-dot" /><span className="thinking-dot" /><span className="thinking-dot" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div style={{ padding: '16px 0 28px', display: 'flex', gap: '10px' }}>
            {phase === 'gist' ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '14px 18px', background: '#0e0e0e', borderRadius: '14px', border: '1px solid #1a1a1a' }}>
                <span style={{ fontSize: '13px', color: '#444', fontFamily: "'DM Mono', monospace" }}>review the course overview on the left, then approve to start</span>
              </div>
            ) : (
              <>
                <input
                  className="chat-input"
                  placeholder={phase === 'discovery' ? "type your answer..." : "explain it back..."}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                  disabled={loading}
                />
                <button className="send-btn" onClick={send} disabled={loading || !input.trim()}>send</button>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

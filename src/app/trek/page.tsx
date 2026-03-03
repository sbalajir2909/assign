'use client'

import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'assistant' | 'user'
  content: string
}

interface Concept {
  id: number
  title: string
  status: 'locked' | 'current' | 'done'
}

type Phase = 'discovery' | 'roadmap' | 'learning'

export default function TrekPage() {
  const [phase, setPhase] = useState<Phase>('discovery')
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "okay let's build your learning roadmap. what topic do you want to understand end to end?" }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [currentConcept, setCurrentConcept] = useState(0)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [newConcept, setNewConcept] = useState('')
  const [addingNew, setAddingNew] = useState(false)
  const [userMessageCount, setUserMessageCount] = useState(0)
  const [roadmapId, setRoadmapId] = useState<string>('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const saveProgressToStorage = (updatedConcepts: Concept[], id: string) => {
    const existing = JSON.parse(localStorage.getItem('assign_roadmaps') || '[]')
    const updated = existing.map((r: { id: string; concepts: Concept[]; lastStudied: string }) =>
      r.id === id ? { ...r, concepts: updatedConcepts, lastStudied: new Date().toISOString() } : r
    )
    localStorage.setItem('assign_roadmaps', JSON.stringify(updated))
  }

  const generateRoadmap = async (history: Message[]) => {
    setLoading(true)
    try {
      const res = await fetch('/api/trek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generateRoadmap: true, conversationHistory: history })
      })
      const data = await res.json()
      if (data.roadmap) {
        setConcepts(data.roadmap.map((title: string, i: number) => ({
          id: i, title, status: 'locked' as const
        })))
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: "okay i've built your roadmap. check it out on the left. edit anything that feels off, add or remove concepts, then hit approve and we start."
        }])
        setPhase('roadmap')
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "something went wrong generating the roadmap, try again" }])
    } finally {
      setLoading(false)
    }
  }

  const send = async () => {
    if (!input.trim()) return
    const userMessage: Message = { role: 'user', content: input }
    const updated = [...messages, userMessage]
    setMessages(updated)
    setInput('')
    const newCount = userMessageCount + 1
    setUserMessageCount(newCount)

    if (phase === 'discovery' && newCount >= 2) {
      await generateRoadmap(updated)
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/trek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updated, phase })
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
        if (roadmapId) saveProgressToStorage(updatedConcepts, roadmapId)
      }

      if (data.reply) {
        setMessages([...updated, { role: 'assistant', content: data.reply }])
      }
    } catch {
      setMessages([...updated, { role: 'assistant', content: "something went wrong, try again" }])
    } finally {
      setLoading(false)
    }
  }

  const approveRoadmap = () => {
    const updated = concepts.map((c, i) => ({
      ...c, status: i === 0 ? 'current' as const : 'locked' as const
    }))
    setConcepts(updated)
    setPhase('learning')

    const topicMessage = messages.find(m => m.role === 'user')
    const topic = topicMessage?.content || 'untitled'
    const newId = Date.now().toString()
    setRoadmapId(newId)

    const newRoadmap = {
      id: newId,
      topic,
      concepts: updated,
      createdAt: new Date().toISOString(),
      lastStudied: new Date().toISOString(),
    }
    const existing = JSON.parse(localStorage.getItem('assign_roadmaps') || '[]')
    localStorage.setItem('assign_roadmaps', JSON.stringify([newRoadmap, ...existing]))

    const roadmapText = concepts.map((c, i) => `${i + 1}. ${c.title}`).join(', ')
    const startMessage: Message = {
      role: 'user',
      content: `roadmap approved. concepts: ${roadmapText}. start teaching concept 1.`
    }
    const updatedMessages = [...messages, startMessage]
    setMessages(updatedMessages)
    setUserMessageCount(prev => prev + 1)

    setLoading(true)
    fetch('/api/trek', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: updatedMessages, phase: 'learning' })
    }).then(r => r.json()).then(data => {
      if (data.reply) setMessages([...updatedMessages, { role: 'assistant', content: data.reply }])
    }).finally(() => setLoading(false))
  }

  const deleteConceptItem = (id: number) => setConcepts(prev => prev.filter(c => c.id !== id))
  const startEdit = (concept: Concept) => { setEditingId(concept.id); setEditValue(concept.title) }
  const saveEdit = (id: number) => { setConcepts(prev => prev.map(c => c.id === id ? { ...c, title: editValue } : c)); setEditingId(null) }
  const addConcept = () => {
    if (!newConcept.trim()) return
    setConcepts(prev => [...prev, { id: Date.now(), title: newConcept.trim(), status: 'locked' }])
    setNewConcept('')
    setAddingNew(false)
  }

  return (
    <main style={{ minHeight: '100vh', background: '#080808', color: '#fff', fontFamily: "'Syne', sans-serif", display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .chat-input { background: #111; border: 1px solid #222; border-radius: 14px; color: #fff; font-size: 14px; padding: 14px 18px; outline: none; width: 100%; font-family: 'Syne', sans-serif; transition: border-color 0.2s; }
        .chat-input:focus { border-color: #00FF87; }
        .chat-input::placeholder { color: #333; }
        .send-btn { background: #00FF87; color: #000; font-weight: 700; font-size: 13px; padding: 14px 22px; border-radius: 14px; border: none; cursor: pointer; font-family: 'Syne', sans-serif; transition: opacity 0.15s; white-space: nowrap; }
        .send-btn:hover { opacity: 0.85; }
        .send-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .msg-bubble { max-width: 80%; padding: 14px 18px; border-radius: 18px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
        .msg-user { background: #00FF87; color: #000; font-weight: 500; border-bottom-right-radius: 4px; margin-left: auto; }
        .msg-assign { background: #111; color: #ccc; border: 1px solid #1a1a1a; border-bottom-left-radius: 4px; }
        .concept-item { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 10px; background: #111; border: 1px solid #1a1a1a; margin-bottom: 8px; transition: border-color 0.2s; }
        .concept-item.current { border-color: #00FF87; }
        .concept-item.done { opacity: 0.5; }
        .concept-num { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; font-family: 'DM Mono', monospace; }
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
      `}</style>

      <div className="grain" />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', height: '100vh' }}>

        {(phase === 'roadmap' || phase === 'learning') && (
          <div style={{ width: '280px', flexShrink: 0, borderRight: '1px solid #111', display: 'flex', flexDirection: 'column', padding: '24px 20px', overflowY: 'auto' }}>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', fontFamily: "'DM Mono', monospace", color: '#00FF87', letterSpacing: '0.05em', marginBottom: '4px' }}>🗺️ ROADMAP</div>
              <div style={{ fontSize: '13px', color: '#444' }}>
                {phase === 'roadmap' ? 'edit then approve' : `concept ${currentConcept + 1} of ${concepts.length}`}
              </div>
            </div>

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

                  {editingId === concept.id ? (
                    <input className="edit-input" value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveEdit(concept.id)} onBlur={() => saveEdit(concept.id)} autoFocus />
                  ) : (
                    <span style={{ fontSize: '13px', color: concept.status === 'current' ? '#fff' : '#888', flex: 1, fontWeight: concept.status === 'current' ? 600 : 400 }}>
                      {concept.title}
                    </span>
                  )}

                  {phase === 'roadmap' && editingId !== concept.id && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => startEdit(concept)} style={{ background: 'none', border: 'none', color: '#333', cursor: 'pointer', fontSize: '12px' }}>✏️</button>
                      <button onClick={() => deleteConceptItem(concept.id)} style={{ background: 'none', border: 'none', color: '#333', cursor: 'pointer', fontSize: '12px' }}>✕</button>
                    </div>
                  )}
                </div>
              ))}

              {phase === 'roadmap' && (
                addingNew ? (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <input className="edit-input" value={newConcept} onChange={e => setNewConcept(e.target.value)} onKeyDown={e => e.key === 'Enter' && addConcept()} placeholder="concept name..." autoFocus style={{ flex: 1 }} />
                    <button onClick={addConcept} style={{ background: '#00FF87', color: '#000', border: 'none', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>+</button>
                  </div>
                ) : (
                  <button onClick={() => setAddingNew(true)} style={{ width: '100%', background: 'none', border: '1px dashed #222', borderRadius: '10px', color: '#333', padding: '10px', cursor: 'pointer', fontSize: '12px', marginTop: '4px', fontFamily: "'Syne', sans-serif" }}>
                    + add concept
                  </button>
                )
              )}
            </div>

            {phase === 'roadmap' && (
              <button className="approve-btn" onClick={approveRoadmap}>approve roadmap →</button>
            )}

            {phase === 'learning' && (
              <div style={{ marginTop: '16px' }}>
                <div style={{ padding: '12px', background: '#0e0e0e', borderRadius: '10px', border: '1px solid #1a1a1a', marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', color: '#444', fontFamily: "'DM Mono', monospace", marginBottom: '6px' }}>PROGRESS</div>
                  <div style={{ background: '#1a1a1a', borderRadius: '4px', height: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: '#00FF87', width: `${(concepts.filter(c => c.status === 'done').length / concepts.length) * 100}%`, transition: 'width 0.5s ease', borderRadius: '4px' }} />
                  </div>
                  <div style={{ fontSize: '11px', color: '#444', marginTop: '6px' }}>
                    {concepts.filter(c => c.status === 'done').length} of {concepts.length} concepts mastered
                  </div>
                </div>
                <a href="/dashboard" className="back-link" style={{ display: 'block', textAlign: 'center', padding: '10px', background: '#0e0e0e', borderRadius: '10px', border: '1px solid #1a1a1a' }}>
                  view dashboard →
                </a>
              </div>
            )}
          </div>
        )}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: phase === 'discovery' ? '680px' : 'none', margin: phase === 'discovery' ? '0 auto' : '0', width: '100%', padding: '0 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 0 20px', borderBottom: '1px solid #111' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.5px' }}>assign</span>
              <span style={{ fontSize: '11px', fontFamily: "'DM Mono', monospace", color: '#00FF87', background: '#00FF8715', padding: '3px 8px', borderRadius: '6px', letterSpacing: '0.05em' }}>🗺️ trek</span>
            </div>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <a href="/dashboard" className="back-link">dashboard</a>
              <a href="/" className="back-link">← back</a>
            </div>
          </div>

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

          <div style={{ padding: '16px 0 28px', display: 'flex', gap: '10px' }}>
            <input
              className="chat-input"
              placeholder={phase === 'discovery' ? "tell assign what you want to learn..." : phase === 'roadmap' ? "suggest changes or hit approve..." : "explain it back..."}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              disabled={loading}
            />
            <button className="send-btn" onClick={send} disabled={loading}>send</button>
          </div>
        </div>
      </div>
    </main>
  )
}
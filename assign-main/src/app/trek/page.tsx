'use client'

export const dynamic = 'force-dynamic'

import { useState, useRef, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Message { role: 'assistant' | 'user'; content: string }
interface SprintConcept {
  id: string; title: string; description: string; why_needed: string
  complexity: number; estimated_hours: number; prerequisites: string[]
  requires_live_data: boolean; status: 'locked' | 'current' | 'done'
}
interface Sprint {
  sprint_number: number; total_hours: number; cognitive_load: number
  concepts: SprintConcept[]
}
interface SprintPlan {
  topic: string; exit_condition: string; total_sprints: number
  total_hours: number; available_hours: number
  sprints: Sprint[]; cut_nodes: SprintConcept[]; cut_count: number
}
interface Visual { type: string; subtype: string; code: string; confidence: string }
interface ConceptMaterial {
  concept_index: number; concept_title: string; summary: string
  key_mental_models: string[]; common_mistakes: string[]
  sources: { label: string; url: string }[]; user_notes: string
}
type Phase = 'discovery' | 'gist' | 'learning'
type SidebarTab = 'roadmap' | 'materials'

const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' }
const serif: React.CSSProperties = { fontFamily: 'var(--font-serif)' }
const label: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-foreground)' }
const card: React.CSSProperties = { background: 'var(--card)', border: '2px solid var(--border)', borderRadius: '4px' }
const shadow: React.CSSProperties = { boxShadow: '4px 4px 0px 0px hsl(0 0% 10%)' }
const shadowSm: React.CSSProperties = { boxShadow: '3px 3px 0px 0px hsl(0 0% 10%)' }

async function trekApi(action: string, body: object) {
  const res = await fetch('/api/trek', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  })
  if (!res.ok) throw new Error(`trek api error ${res.status}`)
  return res.json()
}

function TrekPageInner() {
  const searchParams = useSearchParams()

  // ── Session ────────────────────────────────────────────────────────────────
  const [sessionId, setSessionId] = useState<string>('')
  const [userId, setUserId] = useState<string>('')

  // ── UI state ───────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('discovery')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [resuming, setResuming] = useState(false)

  // ── Course state ───────────────────────────────────────────────────────────
  const [sprintPlan, setSprintPlan] = useState<SprintPlan | null>(null)
  const [gist, setGist] = useState<string>('')
  const [currentConceptIdx, setCurrentConceptIdx] = useState(0)
  const [currentSprintIdx, setCurrentSprintIdx] = useState(0)
  const [roadmapId, setRoadmapId] = useState<string>('')
  const [visual, setVisual] = useState<Visual | null>(null)

  // ── Materials ──────────────────────────────────────────────────────────────
  const [materials, setMaterials] = useState<ConceptMaterial[]>([])
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('roadmap')
  const [selectedMaterial, setSelectedMaterial] = useState<ConceptMaterial | null>(null)
  const [userNotes, setUserNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  // ── Chat pagination ────────────────────────────────────────────────────────
  const bottomRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const fullHistoryRef = useRef<Message[]>([])
  const [visibleCount, setVisibleCount] = useState(15)

  // ── Flatten all concepts from sprint plan ──────────────────────────────────
  const allConcepts: SprintConcept[] = sprintPlan
    ? sprintPlan.sprints.flatMap(s => s.concepts)
    : []

  const currentConcept = allConcepts[currentConceptIdx] || null
  const masteredCount = allConcepts.filter(c => c.status === 'done').length

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    const container = chatContainerRef.current
    if (!container) return
    const handleScroll = () => {
      if (container.scrollTop === 0) {
        const newCount = visibleCount + 15
        if (newCount <= fullHistoryRef.current.length) {
          setVisibleCount(newCount)
          setMessages(prev => [prev[0], ...fullHistoryRef.current.slice(-newCount)])
        }
      }
    }
    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [visibleCount])

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id || 'anonymous'
      setUserId(uid)

      const resumeId = searchParams.get('resume')
      if (resumeId) {
        setResuming(true)
        await loadRoadmap(resumeId)
        setResuming(false)
      } else {
        await startSession(uid)
      }
    }
    init()
  }, [])

  // ── Start trek-api session ─────────────────────────────────────────────────
  const startSession = async (uid: string) => {
    setLoading(true)
    try {
      const data = await trekApi('start', { user_id: uid })
      setSessionId(data.session_id)
      setMessages([{ role: 'assistant', content: data.reply }])
    } catch {
      setMessages([{ role: 'assistant', content: 'something went wrong starting trek. refresh and try again.' }])
    } finally {
      setLoading(false)
    }
  }

  // ── Load existing roadmap ──────────────────────────────────────────────────
  const loadRoadmap = async (id: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/roadmap?id=${id}`, {
      headers: { Authorization: `Bearer ${session?.access_token || ''}` }
    })
    const data = await res.json()
    if (!data.roadmap) return
    const { roadmap, materials: mats } = data
    const history = (roadmap.conversation_history || []) as Message[]
    setRoadmapId(id)
    setMaterials(mats || [])
    setCurrentConceptIdx(roadmap.current_concept_index || 0)
    fullHistoryRef.current = history
    setVisibleCount(15)
    const resumeMsg: Message = {
      role: 'assistant',
      content: `welcome back! picking up where you left off.`
    }
    setMessages([resumeMsg, ...history.slice(-15)])
    setPhase('learning')
  }

  // ── Send message ───────────────────────────────────────────────────────────
  const send = async () => {
    if (!input.trim() || loading) return
    const userMsg: Message = { role: 'user', content: input }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setVisual(null)

    try {
      const data = await trekApi('message', {
        session_id: sessionId,
        user_id: userId,
        message: input,
        roadmap_id: roadmapId || null,
      })

      // ── Handle phase transitions ─────────────────────────────────────────
      const newPhase = data.phase

      if (newPhase === 'generation') {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'building your course — searching sources and building your learning path. give me a moment...'
        }])
        const curriculumData = await trekApi('message', {
          session_id: sessionId,
          user_id: userId,
          message: '__generate__',
          roadmap_id: roadmapId || null,
        })
        if (curriculumData.phase === 'gist' && curriculumData.gist) {
          setGist(curriculumData.gist)
          setSprintPlan(curriculumData.sprint_plan)
          setPhase('gist')
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: curriculumData.gist
          }])
        }
      }

      if (newPhase === 'gist' && data.gist) {
        setGist(data.gist)
        setSprintPlan(data.sprint_plan)
        setPhase('gist')
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.gist
        }])
      }

      if (newPhase === 'planning' || newPhase === 'learning') {
        if (phase !== 'learning') setPhase('learning')
        if (data.reply) {
          setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
        }
        if (data.current_concept_idx !== undefined) setCurrentConceptIdx(data.current_concept_idx)
        if (data.current_sprint_idx !== undefined) setCurrentSprintIdx(data.current_sprint_idx)
        if (data.concept_mastered) setSidebarTab('materials')
        if (data.visual) setVisual(data.visual)
        if (data.sprint_plan) setSprintPlan(data.sprint_plan)
      }

      if (newPhase === 'discovery' && data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      }

    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'something went wrong, try again' }])
    } finally {
      setLoading(false)
    }
  }

  // ── Approve roadmap ────────────────────────────────────────────────────────
  const approveRoadmap = async () => {
    setLoading(true)
    try {
      const data = await trekApi('message', {
        session_id: sessionId,
        user_id: userId,
        message: 'approve',
        roadmap_id: roadmapId || null,
      })
      setPhase('learning')
      if (data.reply) {
        setMessages([{ role: 'assistant', content: data.reply }])
      }
      if (data.opening_prompt) {
        setMessages([{ role: 'assistant', content: data.opening_prompt }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'something went wrong, try again' }])
    } finally {
      setLoading(false)
    }
  }

  // ── Save notes ─────────────────────────────────────────────────────────────
  const saveUserNotes = async () => {
    if (!selectedMaterial || !roadmapId) return
    setSavingNotes(true)
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/roadmap', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
      body: JSON.stringify({ roadmapId, userNotes: { conceptIndex: selectedMaterial.concept_index, notes: userNotes } })
    })
    setMaterials(prev => prev.map(m =>
      m.concept_index === selectedMaterial.concept_index ? { ...m, user_notes: userNotes } : m
    ))
    setSavingNotes(false)
  }

  // ── Export notes ───────────────────────────────────────────────────────────
  const exportNotes = () => {
    if (!materials.length) return
    const content = materials.map(m =>
      `# ${m.concept_title}\n${m.summary}\n## Key Mental Models\n${m.key_mental_models.map(mm => `- ${mm}`).join('\n')}\n## Common Mistakes\n${m.common_mistakes.map(mm => `- ${mm}`).join('\n')}${m.user_notes ? `\n## My Notes\n${m.user_notes}` : ''}\n---`
    ).join('\n\n')
    const blob = new Blob([`# ${sprintPlan?.topic || 'Course'} Notes\n\n${content}`], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${sprintPlan?.topic || 'course'}-notes.md`; a.click()
    URL.revokeObjectURL(url)
  }

  if (resuming) return (
    <main style={{ minHeight: '100vh', background: 'var(--background)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ ...mono, fontSize: '13px', color: 'var(--muted-foreground)' }}>loading your course...</span>
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--background)', color: 'var(--foreground)' }}>
      <style>{`
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--muted);border-radius:2px}
        .ti{background:var(--card);border:2px solid var(--border);border-radius:4px;color:var(--foreground);font-size:14px;padding:13px 16px;outline:none;width:100%;font-family:var(--font-sans);transition:box-shadow 0.15s}.ti:focus{box-shadow:4px 4px 0 0 hsl(0 0% 10%)}.ti::placeholder{color:var(--muted-foreground)}
        .ts{background:var(--foreground);color:var(--background);font-weight:600;font-size:13px;padding:13px 20px;border-radius:4px;border:2px solid var(--border);cursor:pointer;font-family:var(--font-mono);white-space:nowrap;box-shadow:4px 4px 0 0 hsl(0 0% 10%);transition:box-shadow 0.15s,transform 0.15s}.ts:hover{box-shadow:6px 6px 0 0 hsl(0 0% 10%);transform:translate(-2px,-2px)}.ts:disabled{opacity:.3;cursor:not-allowed;transform:none;box-shadow:4px 4px 0 0 hsl(0 0% 10%)}
        .td{width:5px;height:5px;border-radius:50%;background:var(--muted-foreground);animation:bounce 1.2s infinite;display:inline-block}.td:nth-child(2){animation-delay:.2s}.td:nth-child(3){animation-delay:.4s}
        @keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}
        .cr{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1.5px solid var(--muted);border-radius:4px;margin-bottom:6px;background:var(--background);transition:border-color 0.15s,box-shadow 0.15s}.cr.current{border-color:var(--border);background:var(--card);box-shadow:3px 3px 0 0 hsl(0 0% 10%)}.cr.done{cursor:pointer}.cr.done:hover{border-color:var(--border)}
        .tp{font-family:var(--font-mono);font-size:11px;padding:5px 12px;border-radius:4px;border:1.5px solid var(--border);background:none;cursor:pointer;transition:background 0.15s,color 0.15s;color:var(--muted-foreground)}.tp.active{background:var(--foreground);color:var(--background)}
        .mc{padding:12px 14px;border:1.5px solid var(--muted);border-radius:4px;margin-bottom:6px;cursor:pointer;transition:border-color 0.15s,box-shadow 0.15s;background:var(--background)}.mc:hover{border-color:var(--border);box-shadow:3px 3px 0 0 hsl(0 0% 10%)}
        .na{width:100%;background:var(--background);border:1.5px solid var(--border);border-radius:4px;color:var(--foreground);font-size:12px;padding:10px 12px;outline:none;font-family:var(--font-mono);resize:vertical;min-height:80px;line-height:1.6;transition:box-shadow 0.15s}.na:focus{box-shadow:3px 3px 0 0 hsl(0 0% 10%)}
      `}</style>

      <div style={{ display: 'flex', height: '100vh' }}>

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        {(phase === 'gist' || phase === 'learning') && (
          <aside style={{ width: '288px', flexShrink: 0, borderRight: '2px solid var(--border)', display: 'flex', flexDirection: 'column', padding: '24px 18px', overflowY: 'auto', background: 'var(--card)' }}>
            <div style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1.5px solid var(--muted)' }}>
              <a href="/" style={{ textDecoration: 'none' }}><span style={{ ...serif, fontSize: '22px', color: 'var(--foreground)', letterSpacing: '-0.5px' }}>assign</span></a>
            </div>

            {/* Gist overview */}
            {gist && phase === 'gist' && (
              <div style={{ ...card, ...shadow, padding: '16px', marginBottom: '16px' }}>
                <p style={{ ...label, marginBottom: '10px' }}>course overview</p>
                <p style={{ ...mono, fontSize: '12px', color: 'var(--muted-foreground)', lineHeight: 1.7, marginBottom: '14px' }}>{gist}</p>
                {sprintPlan && (
                  <p style={{ ...mono, fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '12px' }}>
                    {sprintPlan.total_sprints} sprints · ~{sprintPlan.total_hours}h
                    {sprintPlan.cut_count > 0 && ` · ${sprintPlan.cut_count} concepts cut for time`}
                  </p>
                )}
              </div>
            )}

            {/* Tab switcher */}
            {phase === 'learning' && (
              <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
                <button className={`tp ${sidebarTab === 'roadmap' ? 'active' : ''}`} onClick={() => setSidebarTab('roadmap')}>roadmap</button>
                <button className={`tp ${sidebarTab === 'materials' ? 'active' : ''}`} onClick={() => setSidebarTab('materials')}>
                  materials{materials.length > 0 ? ` (${materials.length})` : ''}
                </button>
              </div>
            )}

            {/* Sprint roadmap */}
            {(phase === 'gist' || sidebarTab === 'roadmap') && sprintPlan && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <p style={{ ...label, marginBottom: '10px' }}>
                  {phase === 'gist' ? 'your learning path' : `concept ${currentConceptIdx + 1} of ${allConcepts.length}`}
                </p>
                <div style={{ flex: 1 }}>
                  {sprintPlan.sprints.map((sprint, si) => (
                    <div key={si} style={{ marginBottom: '12px' }}>
                      <p style={{ ...label, marginBottom: '6px', opacity: 0.6 }}>
                        sprint {sprint.sprint_number} · {sprint.total_hours}h
                      </p>
                      {sprint.concepts.map((concept, ci) => {
                        const globalIdx = sprintPlan.sprints
                          .slice(0, si)
                          .reduce((acc, s) => acc + s.concepts.length, 0) + ci
                        const status = globalIdx < currentConceptIdx
                          ? 'done'
                          : globalIdx === currentConceptIdx && phase === 'learning'
                          ? 'current'
                          : 'locked'
                        return (
                          <div key={ci} className={`cr ${status}`}>
                            <div style={{ width: '22px', height: '22px', borderRadius: '2px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', ...mono, fontSize: '10px', fontWeight: 500, marginTop: '1px', background: status === 'done' ? 'var(--foreground)' : status === 'current' ? 'var(--muted)' : 'transparent', color: status === 'done' ? 'var(--background)' : 'var(--muted-foreground)', border: status !== 'done' ? '1.5px solid var(--muted)' : 'none' }}>
                              {status === 'done' ? '✓' : globalIdx + 1}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13px', color: status === 'current' ? 'var(--foreground)' : 'var(--muted-foreground)', fontWeight: status === 'current' ? 500 : 400, lineHeight: 1.3 }}>
                                {concept.title}
                              </div>
                              {phase === 'gist' && (
                                <div style={{ ...mono, fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px', opacity: .5 }}>
                                  ~{concept.estimated_hours}h
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>

                {phase === 'gist' && (
                  <button
                    onClick={approveRoadmap}
                    disabled={loading}
                    style={{ width: '100%', background: 'var(--foreground)', color: 'var(--background)', fontWeight: 600, fontSize: '14px', padding: '14px', border: '2px solid var(--border)', borderRadius: '4px', cursor: 'pointer', ...mono, marginTop: '16px', ...shadow, transition: 'box-shadow 0.15s, transform 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '6px 6px 0 0 hsl(0 0% 10%)'; e.currentTarget.style.transform = 'translate(-2px,-2px)' }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = '4px 4px 0 0 hsl(0 0% 10%)'; e.currentTarget.style.transform = 'none' }}
                  >
                    {loading ? 'starting...' : 'start learning →'}
                  </button>
                )}

                {phase === 'learning' && sidebarTab === 'roadmap' && (
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ ...card, padding: '14px', marginBottom: '10px' }}>
                      <p style={{ ...label, marginBottom: '10px' }}>progress</p>
                      <div style={{ height: '4px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: 'var(--foreground)', width: `${allConcepts.length ? (masteredCount / allConcepts.length) * 100 : 0}%`, transition: 'width 0.5s ease', borderRadius: '2px' }} />
                      </div>
                      <p style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '8px' }}>
                        {masteredCount} of {allConcepts.length} mastered
                      </p>
                    </div>
                    <a href="/dashboard" style={{ display: 'block', textAlign: 'center' as const, padding: '10px', ...card, ...mono, fontSize: '12px', color: 'var(--foreground)', textDecoration: 'none' }}>dashboard →</a>
                  </div>
                )}
              </div>
            )}

            {/* Materials tab */}
            {phase === 'learning' && sidebarTab === 'materials' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {materials.length === 0 ? (
                  <p style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)', textAlign: 'center' as const, padding: '40px 0' }}>
                    materials appear after mastering each concept
                  </p>
                ) : !selectedMaterial ? (
                  <>
                    {materials.sort((a, b) => a.concept_index - b.concept_index).map((m, i) => (
                      <div key={i} className="mc" onClick={() => { setSelectedMaterial(m); setUserNotes(m.user_notes || '') }}>
                        <p style={{ ...mono, fontSize: '10px', color: 'var(--muted-foreground)', marginBottom: '3px' }}>concept {m.concept_index + 1}</p>
                        <p style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>{m.concept_title}</p>
                        <p style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)', lineHeight: 1.5 }}>{m.summary.slice(0, 80)}...</p>
                      </div>
                    ))}
                    <button onClick={exportNotes} style={{ width: '100%', marginTop: '8px', background: 'none', border: '1.5px solid var(--border)', borderRadius: '4px', color: 'var(--muted-foreground)', padding: '9px', cursor: 'pointer', ...mono, fontSize: '11px' }}>↓ export notes</button>
                  </>
                ) : (
                  <div style={{ flex: 1 }}>
                    <button onClick={() => setSelectedMaterial(null)} style={{ background: 'none', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer', ...mono, fontSize: '11px', marginBottom: '14px', padding: 0 }}>← back</button>
                    <p style={{ fontSize: '15px', fontWeight: 500, marginBottom: '12px' }}>{selectedMaterial.concept_title}</p>
                    <p style={{ ...mono, fontSize: '12px', color: 'var(--muted-foreground)', lineHeight: 1.7, marginBottom: '16px' }}>{selectedMaterial.summary}</p>
                    {selectedMaterial.key_mental_models.length > 0 && (
                      <div style={{ marginBottom: '14px' }}>
                        <p style={{ ...label, marginBottom: '8px' }}>mental models</p>
                        {selectedMaterial.key_mental_models.map((mm, i) => (
                          <div key={i} style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)', padding: '2px 0', display: 'flex', gap: '6px' }}><span>→</span>{mm}</div>
                        ))}
                      </div>
                    )}
                    {selectedMaterial.common_mistakes.length > 0 && (
                      <div style={{ marginBottom: '14px' }}>
                        <p style={{ ...label, marginBottom: '8px' }}>common mistakes</p>
                        {selectedMaterial.common_mistakes.map((mm, i) => (
                          <div key={i} style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)', padding: '2px 0', display: 'flex', gap: '6px' }}><span>!</span>{mm}</div>
                        ))}
                      </div>
                    )}
                    {selectedMaterial.sources?.length > 0 && (
                      <div style={{ marginBottom: '14px' }}>
                        <p style={{ ...label, marginBottom: '8px' }}>sources</p>
                        {selectedMaterial.sources.map((s, i) => (
                          <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" style={{ ...mono, fontSize: '11px', background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)', padding: '3px 8px', borderRadius: '2px', textDecoration: 'none', display: 'inline-block', margin: '2px' }}>{s.label} ↗</a>
                        ))}
                      </div>
                    )}
                    <div>
                      <p style={{ ...label, marginBottom: '6px' }}>your notes</p>
                      <textarea className="na" value={userNotes} onChange={e => setUserNotes(e.target.value)} placeholder="add your own notes..." />
                      <button onClick={saveUserNotes} disabled={savingNotes} style={{ marginTop: '6px', background: 'none', border: '1.5px solid var(--border)', borderRadius: '4px', color: 'var(--foreground)', padding: '6px 14px', cursor: 'pointer', ...mono, fontSize: '11px' }}>
                        {savingNotes ? 'saving...' : 'save notes'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </aside>
        )}

        {/* ── Main chat ────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: phase === 'discovery' ? '660px' : 'none', margin: phase === 'discovery' ? '0 auto' : '0', width: '100%', padding: '0 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 0 18px', borderBottom: '2px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {phase === 'discovery' && <span style={{ ...serif, fontSize: '22px', letterSpacing: '-0.5px' }}>assign</span>}
              <span style={{ ...mono, fontSize: '11px', border: '1.5px solid var(--border)', borderRadius: '4px', padding: '3px 8px' }}>trek</span>
              {phase === 'learning' && currentConcept && (
                <span style={{ ...mono, fontSize: '11px', border: '1.5px solid var(--muted)', borderRadius: '4px', padding: '3px 8px', color: 'var(--muted-foreground)' }}>
                  {currentConcept.title}
                </span>
              )}
              {phase === 'gist' && <span style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)' }}>review course</span>}
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <a href="/dashboard" style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)', textDecoration: 'none' }}>dashboard</a>
              <a href="/" style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)', textDecoration: 'none' }}>← home</a>
            </div>
          </div>

          <div ref={chatContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '24px 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '78%', padding: '12px 16px', fontSize: '14px', lineHeight: 1.65, whiteSpace: 'pre-wrap', borderRadius: '4px', border: '2px solid var(--border)', ...shadowSm, ...(m.role === 'user' ? { background: 'var(--foreground)', color: 'var(--background)' } : { background: 'var(--card)', color: 'var(--foreground)' }) }}>
                  {m.content}
                </div>
              </div>
            ))}

            {/* Visualizer */}
            {visual && visual.code && (
              <div style={{ ...card, padding: '16px', marginTop: '8px' }}>
                <p style={{ ...label, marginBottom: '10px' }}>
                  {visual.subtype} · {visual.confidence} confidence
                </p>
                {visual.type === 'mermaid' ? (
                  <pre style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)', overflow: 'auto', padding: '12px', background: 'var(--background)', borderRadius: '4px' }}>
                    {visual.code}
                  </pre>
                ) : (
                  <div dangerouslySetInnerHTML={{ __html: visual.code }} />
                )}
              </div>
            )}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ padding: '14px 18px', background: 'var(--card)', border: '2px solid var(--border)', borderRadius: '4px', display: 'flex', gap: '5px', alignItems: 'center', ...shadowSm }}>
                  <span className="td" /><span className="td" /><span className="td" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div style={{ padding: '14px 0 28px', display: 'flex', gap: '10px' }}>
            {phase === 'gist' ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '13px 18px', ...card }}>
                <span style={{ ...mono, fontSize: '12px', color: 'var(--muted-foreground)' }}>review the course on the left, then approve to start</span>
              </div>
            ) : (
              <>
                <input
                  className="ti"
                  placeholder={phase === 'discovery' ? "type your answer..." : "explain it back..."}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                  disabled={loading}
                />
                <button className="ts" onClick={send} disabled={loading || !input.trim()}>send</button>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

export default function TrekPage() {
  return (
    <Suspense fallback={
      <main style={{ minHeight: '100vh', background: 'var(--background)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--muted-foreground)' }}>loading...</span>
      </main>
    }>
      <TrekPageInner />
    </Suspense>
  )
}

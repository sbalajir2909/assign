'use client'

import { useState, useRef, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Message { role: 'assistant' | 'user'; content: string }
interface Concept {
  id: number; title: string; why: string; subtopics: string[]
  estimatedMinutes: number; prereq: string | null
  status: 'locked' | 'current' | 'done'
}
interface Gist { emphasis: string; outcomes: string[]; prereqs: string[] }
interface LearnerProfile { topic: string; level: string; goal: string; time: string }
interface ConceptMaterial {
  concept_index: number; concept_title: string; summary: string
  key_mental_models: string[]; common_mistakes: string[]
  sources: { label: string; url: string }[]
  user_notes: string
}
type Phase = 'discovery' | 'gist' | 'learning'
type SidebarTab = 'roadmap' | 'materials'

const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' }
const serif: React.CSSProperties = { fontFamily: 'var(--font-serif)' }
const label: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-foreground)' }
const card: React.CSSProperties = { background: 'var(--card)', border: '2px solid var(--border)', borderRadius: '4px' }
const shadow: React.CSSProperties = { boxShadow: '4px 4px 0px 0px hsl(0 0% 10%)' }
const shadowSm: React.CSSProperties = { boxShadow: '3px 3px 0px 0px hsl(0 0% 10%)' }

function TrekPageInner() {
  const searchParams = useSearchParams()
  const [phase, setPhase] = useState<Phase>('discovery')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [gist, setGist] = useState<Gist | null>(null)
  const [currentConcept, setCurrentConcept] = useState(0)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [discoveryAnswers, setDiscoveryAnswers] = useState<Partial<LearnerProfile>>({})
  const [learnerProfile, setLearnerProfile] = useState<LearnerProfile | null>(null)
  const [roadmapId, setRoadmapId] = useState<string>('')
  const [sourcesHit, setSourcesHit] = useState<string[]>([])
  const [materials, setMaterials] = useState<ConceptMaterial[]>([])
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('roadmap')
  const [selectedMaterial, setSelectedMaterial] = useState<ConceptMaterial | null>(null)
  const [userNotes, setUserNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [newConcept, setNewConcept] = useState('')
  const [addingNew, setAddingNew] = useState(false)
  const [resuming, setResuming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const fullHistoryRef = useRef<Message[]>([])
  const [visibleCount, setVisibleCount] = useState(15)
  const answerKeys: (keyof LearnerProfile)[] = ['topic', 'level', 'goal', 'time']

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

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

  useEffect(() => {
    const resumeId = searchParams.get('resume')
    if (resumeId) { setResuming(true); loadRoadmap(resumeId).finally(() => setResuming(false)) }
    else askNextQuestion(0)
  }, [])

  const loadRoadmap = async (id: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/roadmap?id=${id}`, { headers: { Authorization: `Bearer ${session?.access_token || ''}` } })
    const data = await res.json()
    if (!data.roadmap) return
    const { roadmap, materials: mats } = data
    const loadedConcepts = roadmap.concepts as Concept[]
    const derivedIdx = loadedConcepts.findIndex(c => c.status === 'current')
    const currentIdx = derivedIdx >= 0 ? derivedIdx : (roadmap.current_concept_index || 0)
    const history = (roadmap.conversation_history || []) as Message[]
    setConcepts(loadedConcepts); setCurrentConcept(currentIdx)
    setLearnerProfile(roadmap.learner_profile); setRoadmapId(id); setMaterials(mats || [])
    const mastered = loadedConcepts.filter(c => c.status === 'done').map(c => c.title).join(', ')
    const resumeMsg: Message = { role: 'assistant', content: `welcome back! ${mastered ? `you've mastered: ${mastered}. ` : ''}picking up on ${loadedConcepts[currentIdx]?.title}.` }
    const cleanHistory = history.filter(m => !m.content.startsWith('welcome back!'))
    fullHistoryRef.current = cleanHistory
    setVisibleCount(15)
    setMessages([resumeMsg, ...cleanHistory.slice(-15)])
    setPhase('learning')
  }

  const persistConversation = useCallback(async (id: string, msgs: Message[], conceptIdx: number, updatedConcepts: Concept[]) => {
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/roadmap', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` }, body: JSON.stringify({ roadmapId: id, conversationHistory: msgs.slice(-30), currentConceptIndex: conceptIdx, concepts: updatedConcepts }) })
  }, [])

  const askNextQuestion = async (idx: number) => {
    setLoading(true)
    const res = await fetch('/api/trek', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phase: 'discovery', questionIndex: idx }) })
    const data = await res.json()
    setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    setLoading(false)
  }

  const generateCourse = async (answers: LearnerProfile) => {
    setLoading(true)
    setMessages(prev => [...prev, { role: 'assistant', content: "building your course — pulling from sources. give me a sec..." }])
    try {
      const res = await fetch('/api/trek', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ generateRoadmap: true, discoveryAnswers: answers }) })
      const data = await res.json()
      if (data.course) {
        const { gist: gistData, concepts: conceptsData } = data.course
        setGist(gistData); setSourcesHit(data.sourcesHit || [])
        setConcepts(conceptsData.map((c: Omit<Concept, 'id' | 'status'>, i: number) => ({ ...c, id: i, status: 'locked' as const })))
        setPhase('gist')
        setMessages(prev => [...prev, { role: 'assistant', content: `course built. review the overview on the left — edit anything, then approve to start.` }])
      }
    } catch { setMessages(prev => [...prev, { role: 'assistant', content: "something went wrong, try again" }]) }
    finally { setLoading(false) }
  }

  const planConceptTeaching = async (concept: Concept, profile: LearnerProfile) => {
    const res = await fetch('/api/trek', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phase: 'plan', conceptTitle: concept.title, learnerProfile: profile }) })
    const data = await res.json(); return data.plan || null
  }

  const generateConceptSummary = async (conceptTitle: string, conceptIdx: number, msgs: Message[], rmId: string) => {
    try {
      const res = await fetch('/api/trek', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phase: 'generateSummary', conceptTitle, conceptIndex: conceptIdx, roadmapId: rmId, messages: msgs, learnerProfile }) })
      const data = await res.json()
      if (data.summary) {
        const newMaterial: ConceptMaterial = { concept_index: conceptIdx, concept_title: conceptTitle, summary: data.summary.summary, key_mental_models: data.summary.keyMentalModels || [], common_mistakes: data.summary.commonMistakes || [], sources: data.summary.sources || [], user_notes: '' }
        setMaterials(prev => [...prev.filter(m => m.concept_index !== conceptIdx), newMaterial])
        return newMaterial
      }
    } catch (e) { console.error('[summary]', e) }
    return null
  }

  const send = async () => {
    if (!input.trim() || loading) return
    const userMsg: Message = { role: 'user', content: input }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages); setInput('')
    if (phase === 'discovery') {
      const key = answerKeys[questionIndex]
      const updatedAnswers = { ...discoveryAnswers, [key]: input }
      setDiscoveryAnswers(updatedAnswers)
      const nextIdx = questionIndex + 1
      if (nextIdx < answerKeys.length) { setQuestionIndex(nextIdx); setLoading(true); setTimeout(() => askNextQuestion(nextIdx), 300) }
      else { const fullProfile = updatedAnswers as LearnerProfile; setLearnerProfile(fullProfile); await generateCourse(fullProfile) }
      return
    }
    if (phase === 'learning') {
      setLoading(true)
      const currentC = concepts[currentConcept]
      const masteredSummaries = materials.filter(m => m.concept_index < currentConcept).map(m => `${m.concept_title}: ${m.summary.slice(0, 100)}`).join(' | ')
      try {
        const res = await fetch('/api/trek', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phase: 'learning', messages: updatedMessages.slice(-20), conceptTitle: currentC.title, learnerProfile, conversationContext: masteredSummaries || undefined }) })
        const data = await res.json()
        if (data.conceptMastered) {
          const next = currentConcept + 1
          const updatedConcepts = concepts.map((c, i) => { if (i === currentConcept) return { ...c, status: 'done' as const }; if (i === next) return { ...c, status: 'current' as const }; return c })
          setConcepts(updatedConcepts); setCurrentConcept(next)
          if (roadmapId) {
            generateConceptSummary(currentC.title, currentConcept, updatedMessages, roadmapId)
            await persistConversation(roadmapId, updatedMessages, next, updatedConcepts)
            if (next >= concepts.length) {
              const { data: { session } } = await supabase.auth.getSession()
              await fetch('/api/roadmap', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` }, body: JSON.stringify({ roadmapId, status: 'completed' }) })
            }
          }
          if (next < concepts.length && learnerProfile) planConceptTeaching(updatedConcepts[next], learnerProfile)
          setSidebarTab('materials')
        }
        if (data.reply) {
          const newMessages = [...updatedMessages, { role: 'assistant' as const, content: data.reply }]
          setMessages(newMessages)
          if (roadmapId) persistConversation(roadmapId, newMessages, currentConcept, concepts)
        }
      } catch { setMessages([...updatedMessages, { role: 'assistant', content: "something went wrong, try again" }]) }
      finally { setLoading(false) }
    }
  }

  const approveRoadmap = async () => {
    const updated = concepts.map((c, i) => ({ ...c, status: i === 0 ? 'current' as const : 'locked' as const }))
    setConcepts(updated); setPhase('learning')
    const plan = learnerProfile ? await planConceptTeaching(updated[0], learnerProfile) : null
    const openingPrompt = plan?.openingPrompt || `okay let's start. tell me what you already know about ${updated[0].title}`
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user && learnerProfile) {
      const { data: existing } = await supabase.from('roadmaps').select('id').eq('user_id', session.user.id).ilike('topic', learnerProfile.topic.trim()).eq('status', 'active').maybeSingle()
      if (existing) { setRoadmapId(existing.id) }
      else {
        const totalMinutes = concepts.reduce((a, c) => a + (c.estimatedMinutes || 0), 0)
        const res = await fetch('/api/roadmap', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ userId: session.user.id, topic: learnerProfile.topic, concepts: updated, learnerProfile, sourcesHit, totalMinutes }) })
        const d = await res.json(); if (d.roadmap) setRoadmapId(d.roadmap.id)
      }
    }
    setMessages([{ role: 'assistant', content: openingPrompt }])
  }

  const saveUserNotes = async () => {
    if (!selectedMaterial || !roadmapId) return
    setSavingNotes(true)
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/roadmap', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` }, body: JSON.stringify({ roadmapId, userNotes: { conceptIndex: selectedMaterial.concept_index, notes: userNotes } }) })
    setMaterials(prev => prev.map(m => m.concept_index === selectedMaterial.concept_index ? { ...m, user_notes: userNotes } : m))
    setSavingNotes(false)
  }

  const exportNotes = () => {
    if (!materials.length) return
    const content = materials.map(m => `# ${m.concept_title}\n${m.summary}\n## Key Mental Models\n${m.key_mental_models.map(mm => `- ${mm}`).join('\n')}\n## Common Mistakes\n${m.common_mistakes.map(mm => `- ${mm}`).join('\n')}${m.user_notes ? `\n## My Notes\n${m.user_notes}` : ''}\n---`).join('\n\n')
    const blob = new Blob([`# ${learnerProfile?.topic || 'Course'} Notes\n\n${content}`], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${learnerProfile?.topic || 'course'}-notes.md`; a.click(); URL.revokeObjectURL(url)
  }

  const deleteConceptItem = (id: number) => setConcepts(prev => prev.filter(c => c.id !== id))
  const startEdit = (concept: Concept) => { setEditingId(concept.id); setEditValue(concept.title) }
  const saveEdit = (id: number) => { setConcepts(prev => prev.map(c => c.id === id ? { ...c, title: editValue } : c)); setEditingId(null) }
  const addConcept = () => {
    if (!newConcept.trim()) return
    setConcepts(prev => [...prev, { id: Date.now(), title: newConcept.trim(), why: '', subtopics: [], estimatedMinutes: 15, prereq: null, status: 'locked' }])
    setNewConcept(''); setAddingNew(false)
  }

  const totalMinutes = concepts.reduce((acc, c) => acc + (c.estimatedMinutes || 0), 0)
  const masteredCount = concepts.filter(c => c.status === 'done').length

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
        .ef{background:var(--background);border:1.5px solid var(--border);border-radius:4px;color:var(--foreground);font-size:13px;padding:5px 9px;outline:none;flex:1;font-family:var(--font-sans)}
        .ib{background:none;border:none;cursor:pointer;color:var(--muted-foreground);font-size:11px;padding:2px 4px;transition:color 0.15s;font-family:var(--font-mono)}.ib:hover{color:var(--foreground)}
        .mc{padding:12px 14px;border:1.5px solid var(--muted);border-radius:4px;margin-bottom:6px;cursor:pointer;transition:border-color 0.15s,box-shadow 0.15s;background:var(--background)}.mc:hover{border-color:var(--border);box-shadow:3px 3px 0 0 hsl(0 0% 10%)}
        .na{width:100%;background:var(--background);border:1.5px solid var(--border);border-radius:4px;color:var(--foreground);font-size:12px;padding:10px 12px;outline:none;font-family:var(--font-mono);resize:vertical;min-height:80px;line-height:1.6;transition:box-shadow 0.15s}.na:focus{box-shadow:3px 3px 0 0 hsl(0 0% 10%)}
      `}</style>

      <div style={{ display: 'flex', height: '100vh' }}>

        {(phase === 'gist' || phase === 'learning') && (
          <aside style={{ width: '288px', flexShrink: 0, borderRight: '2px solid var(--border)', display: 'flex', flexDirection: 'column', padding: '24px 18px', overflowY: 'auto', background: 'var(--card)' }}>
            <div style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1.5px solid var(--muted)' }}>
              <a href="/" style={{ textDecoration: 'none' }}><span style={{ ...serif, fontSize: '22px', color: 'var(--foreground)', letterSpacing: '-0.5px' }}>assign</span></a>
            </div>

            {gist && phase === 'gist' && (
              <div style={{ ...card, ...shadow, padding: '16px', marginBottom: '16px' }}>
                <p style={{ ...label, marginBottom: '10px' }}>course overview</p>
                <p style={{ ...mono, fontSize: '12px', color: 'var(--muted-foreground)', lineHeight: 1.7, marginBottom: '14px' }}>{gist.emphasis}</p>
                {gist.prereqs?.length > 0 && (<div style={{ marginBottom: '12px' }}><p style={{ ...label, marginBottom: '6px' }}>before you start</p>{gist.prereqs.map((p, i) => <div key={i} style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)', padding: '2px 0', display: 'flex', gap: '6px' }}><span>!</span>{p}</div>)}</div>)}
                <p style={{ ...label, marginBottom: '8px' }}>you'll be able to</p>
                {gist.outcomes?.map((o, i) => <div key={i} style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)', padding: '2px 0', display: 'flex', gap: '6px' }}><span>→</span>{o}</div>)}
                <p style={{ ...mono, fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '12px' }}>{concepts.length} concepts · ~{totalMinutes}min</p>
              </div>
            )}

            {phase === 'learning' && (
              <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
                <button className={`tp ${sidebarTab === 'roadmap' ? 'active' : ''}`} onClick={() => setSidebarTab('roadmap')}>roadmap</button>
                <button className={`tp ${sidebarTab === 'materials' ? 'active' : ''}`} onClick={() => setSidebarTab('materials')}>materials{materials.length > 0 ? ` (${materials.length})` : ''}</button>
              </div>
            )}

            {(phase === 'gist' || sidebarTab === 'roadmap') && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <p style={{ ...label, marginBottom: '10px' }}>{phase === 'gist' ? 'edit then approve' : `concept ${currentConcept + 1} of ${concepts.length}`}</p>
                <div style={{ flex: 1 }}>
                  {concepts.map((concept, i) => (
                    <div key={concept.id} className={`cr ${concept.status}`} onClick={() => { if (concept.status === 'done') { const mat = materials.find(m => m.concept_index === i); if (mat) { setSelectedMaterial(mat); setUserNotes(mat.user_notes || ''); setSidebarTab('materials') } } }}>
                      <div style={{ width: '22px', height: '22px', borderRadius: '2px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', ...mono, fontSize: '10px', fontWeight: 500, marginTop: '1px', background: concept.status === 'done' ? 'var(--foreground)' : concept.status === 'current' ? 'var(--muted)' : 'transparent', color: concept.status === 'done' ? 'var(--background)' : 'var(--muted-foreground)', border: concept.status !== 'done' ? '1.5px solid var(--muted)' : 'none' }}>
                        {concept.status === 'done' ? '✓' : i + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {editingId === concept.id ? (
                          <input className="ef" value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveEdit(concept.id)} onBlur={() => saveEdit(concept.id)} autoFocus />
                        ) : (
                          <>
                            <div style={{ fontSize: '13px', color: concept.status === 'current' ? 'var(--foreground)' : 'var(--muted-foreground)', fontWeight: concept.status === 'current' ? 500 : 400, lineHeight: 1.3 }}>{concept.title}</div>
                            {concept.why && phase === 'gist' && <div style={{ ...mono, fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '3px', lineHeight: 1.4, opacity: .7 }}>{concept.why}</div>}
                            {concept.estimatedMinutes > 0 && phase === 'gist' && <div style={{ ...mono, fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '2px', opacity: .5 }}>~{concept.estimatedMinutes} min</div>}
                            {concept.subtopics?.length > 0 && phase === 'learning' && concept.status === 'current' && <div style={{ marginTop: '5px', display: 'flex', flexWrap: 'wrap' as const, gap: '3px' }}>{concept.subtopics.map((s, si) => <span key={si} style={{ ...mono, fontSize: '9px', color: 'var(--muted-foreground)', background: 'var(--muted)', padding: '2px 5px', borderRadius: '2px' }}>{s}</span>)}</div>}
                          </>
                        )}
                      </div>
                      {phase === 'gist' && editingId !== concept.id && (
                        <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                          <button className="ib" onClick={e => { e.stopPropagation(); startEdit(concept) }}>edit</button>
                          <button className="ib" onClick={e => { e.stopPropagation(); deleteConceptItem(concept.id) }} onMouseEnter={e => e.currentTarget.style.color = 'hsl(0 70% 45%)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--muted-foreground)'}>✕</button>
                        </div>
                      )}
                    </div>
                  ))}
                  {phase === 'gist' && (addingNew ? (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                      <input className="ef" value={newConcept} onChange={e => setNewConcept(e.target.value)} onKeyDown={e => e.key === 'Enter' && addConcept()} placeholder="concept name..." autoFocus style={{ flex: 1 }} />
                      <button onClick={addConcept} style={{ background: 'var(--foreground)', color: 'var(--background)', border: '2px solid var(--border)', borderRadius: '4px', padding: '5px 10px', cursor: 'pointer', ...mono, fontSize: '12px' }}>+</button>
                    </div>
                  ) : (
                    <button onClick={() => setAddingNew(true)} style={{ width: '100%', background: 'none', border: '1.5px dashed var(--muted)', borderRadius: '4px', color: 'var(--muted-foreground)', padding: '8px', cursor: 'pointer', ...mono, fontSize: '11px', marginTop: '4px' }}>+ add concept</button>
                  ))}
                </div>
                {phase === 'gist' && (
                  <button onClick={approveRoadmap} style={{ width: '100%', background: 'var(--foreground)', color: 'var(--background)', fontWeight: 600, fontSize: '14px', padding: '14px', border: '2px solid var(--border)', borderRadius: '4px', cursor: 'pointer', ...mono, marginTop: '16px', ...shadow, transition: 'box-shadow 0.15s, transform 0.15s' }} onMouseEnter={e => { e.currentTarget.style.boxShadow = '6px 6px 0 0 hsl(0 0% 10%)'; e.currentTarget.style.transform = 'translate(-2px,-2px)' }} onMouseLeave={e => { e.currentTarget.style.boxShadow = '4px 4px 0 0 hsl(0 0% 10%)'; e.currentTarget.style.transform = 'none' }}>start learning →</button>
                )}
                {phase === 'learning' && sidebarTab === 'roadmap' && (
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ ...card, padding: '14px', marginBottom: '10px' }}>
                      <p style={{ ...label, marginBottom: '10px' }}>progress</p>
                      <div style={{ height: '4px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '2px', overflow: 'hidden' }}><div style={{ height: '100%', background: 'var(--foreground)', width: `${(masteredCount / concepts.length) * 100}%`, transition: 'width 0.5s ease', borderRadius: '2px' }} /></div>
                      <p style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '8px' }}>{masteredCount} of {concepts.length} mastered</p>
                    </div>
                    <a href="/dashboard" style={{ display: 'block', textAlign: 'center' as const, padding: '10px', ...card, ...mono, fontSize: '12px', color: 'var(--foreground)', textDecoration: 'none' }}>dashboard →</a>
                  </div>
                )}
              </div>
            )}

            {phase === 'learning' && sidebarTab === 'materials' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {materials.length === 0 ? (
                  <p style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)', textAlign: 'center' as const, padding: '40px 0' }}>materials appear after mastering each concept</p>
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
                    {selectedMaterial.key_mental_models.length > 0 && (<div style={{ marginBottom: '14px' }}><p style={{ ...label, marginBottom: '8px' }}>mental models</p>{selectedMaterial.key_mental_models.map((mm, i) => <div key={i} style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)', padding: '2px 0', display: 'flex', gap: '6px' }}><span>→</span>{mm}</div>)}</div>)}
                    {selectedMaterial.common_mistakes.length > 0 && (<div style={{ marginBottom: '14px' }}><p style={{ ...label, marginBottom: '8px' }}>common mistakes</p>{selectedMaterial.common_mistakes.map((mm, i) => <div key={i} style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)', padding: '2px 0', display: 'flex', gap: '6px' }}><span>!</span>{mm}</div>)}</div>)}
                    {selectedMaterial.sources.length > 0 && (<div style={{ marginBottom: '14px' }}><p style={{ ...label, marginBottom: '8px' }}>sources</p>{selectedMaterial.sources.map((s, i) => <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" style={{ ...mono, fontSize: '11px', background: 'var(--muted)', color: 'var(--foreground)', border: '1px solid var(--border)', padding: '3px 8px', borderRadius: '2px', textDecoration: 'none', display: 'inline-block', margin: '2px' }}>{s.label} ↗</a>)}</div>)}
                    <div>
                      <p style={{ ...label, marginBottom: '6px' }}>your notes</p>
                      <textarea className="na" value={userNotes} onChange={e => setUserNotes(e.target.value)} placeholder="add your own notes..." />
                      <button onClick={saveUserNotes} disabled={savingNotes} style={{ marginTop: '6px', background: 'none', border: '1.5px solid var(--border)', borderRadius: '4px', color: 'var(--foreground)', padding: '6px 14px', cursor: 'pointer', ...mono, fontSize: '11px' }}>{savingNotes ? 'saving...' : 'save notes'}</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </aside>
        )}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: phase === 'discovery' ? '660px' : 'none', margin: phase === 'discovery' ? '0 auto' : '0', width: '100%', padding: '0 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 0 18px', borderBottom: '2px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {phase === 'discovery' && <span style={{ ...serif, fontSize: '22px', letterSpacing: '-0.5px' }}>assign</span>}
              <span style={{ ...mono, fontSize: '11px', border: '1.5px solid var(--border)', borderRadius: '4px', padding: '3px 8px' }}>trek</span>
              {phase === 'learning' && concepts[currentConcept] && <span style={{ ...mono, fontSize: '11px', border: '1.5px solid var(--muted)', borderRadius: '4px', padding: '3px 8px', color: 'var(--muted-foreground)' }}>{concepts[currentConcept].title}</span>}
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
                <div style={{ maxWidth: '78%', padding: '12px 16px', fontSize: '14px', lineHeight: 1.65, whiteSpace: 'pre-wrap', borderRadius: '4px', border: '2px solid var(--border)', ...shadowSm, ...(m.role === 'user' ? { background: 'var(--foreground)', color: 'var(--background)' } : { background: 'var(--card)', color: 'var(--foreground)' }) }}>{m.content}</div>
              </div>
            ))}
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
                <input className="ti" placeholder={phase === 'discovery' ? "type your answer..." : "explain it back..."} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()} disabled={loading} />
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
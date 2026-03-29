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
  key_mental_models: string[]; common_mistakes: string[]; sources: { label: string; url: string }[]
  user_notes: string
}

type Phase = 'discovery' | 'gist' | 'learning'
type SidebarTab = 'roadmap' | 'materials'

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
        const history = fullHistoryRef.current
        const newCount = visibleCount + 15
        if (newCount <= history.length) {
          setVisibleCount(newCount)
          setMessages(prev => {
            const resumeMsg = prev[0]
            return [resumeMsg, ...history.slice(-newCount)]
          })
        }
      }
    }
    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [visibleCount])

  useEffect(() => {
    const resumeId = searchParams.get('resume')
    if (resumeId) {
      setResuming(true)
      loadRoadmap(resumeId).finally(() => setResuming(false))
    } else {
      askNextQuestion(0)
    }
  }, [])

  const loadRoadmap = async (id: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/roadmap?id=${id}`, {
      headers: {
        'Authorization': `Bearer ${session?.access_token || ''}`
      }
    })
    const data = await res.json()
    if (!data.roadmap) return

    const { roadmap, materials: mats } = data
    const loadedConcepts = roadmap.concepts as Concept[]
    const derivedIdx = (roadmap.concepts as Concept[]).findIndex(c => c.status === 'current')
    const currentIdx = derivedIdx >= 0 ? derivedIdx : (roadmap.current_concept_index || 0)
    const history = (roadmap.conversation_history || []) as Message[]
    const profile = roadmap.learner_profile as LearnerProfile

    setConcepts(loadedConcepts)
    setCurrentConcept(currentIdx)
    setLearnerProfile(profile)
    setRoadmapId(id)
    setMaterials(mats || [])

    const masteredTitles = loadedConcepts
      .filter(c => c.status === 'done')
      .map(c => c.title)
      .join(', ')

    const resumeMsg: Message = {
      role: 'assistant',
      content: `welcome back! ${masteredTitles.length > 0 ? `you've mastered: ${masteredTitles}. ` : ''}${history.length > 0
        ? `picking up where we left off on ${loadedConcepts[currentIdx]?.title}.`
        : `ready to continue with ${loadedConcepts[currentIdx]?.title}. what do you remember about it so far?`}`
    }

    const cleanHistory = history.filter(m => !m.content.startsWith('welcome back!'))
    fullHistoryRef.current = cleanHistory
    setVisibleCount(15)
    setMessages([resumeMsg, ...cleanHistory.slice(-15)])
    setPhase('learning')
  }

  const persistConversation = useCallback(async (
    id: string, msgs: Message[], conceptIdx: number, updatedConcepts: Concept[]
  ) => {
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/roadmap', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`
      },
      body: JSON.stringify({
        roadmapId: id,
        conversationHistory: msgs.slice(-30),
        currentConceptIndex: conceptIdx,
        concepts: updatedConcepts
      })
    })
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
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: "okay building your course now — pulling from wikipedia, academic sources, stack overflow. give me a sec..."
    }])
    try {
      const res = await fetch('/api/trek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generateRoadmap: true, discoveryAnswers: answers })
      })
      const data = await res.json()
      if (data.course) {
        const { gist: gistData, concepts: conceptsData } = data.course
        const hits = data.sourcesHit || []
        setGist(gistData)
        setSourcesHit(hits)
        setConcepts(conceptsData.map((c: Omit<Concept, 'id' | 'status'>, i: number) => ({
          ...c, id: i, status: 'locked' as const
        })))
        setPhase('gist')
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `course built${hits.length > 0 ? ` from ${hits.length} sources` : ''}. check the overview on the left — see what you'll walk out knowing, edit anything, then hit approve.`
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

  const generateConceptSummary = async (
    conceptTitle: string, conceptIdx: number, msgs: Message[], rmId: string
  ) => {
    try {
      const res = await fetch('/api/trek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase: 'generateSummary',
          conceptTitle,
          conceptIndex: conceptIdx,
          roadmapId: rmId,
          messages: msgs,
          learnerProfile
        })
      })
      const data = await res.json()
      if (data.summary) {
        const newMaterial: ConceptMaterial = {
          concept_index: conceptIdx,
          concept_title: conceptTitle,
          summary: data.summary.summary,
          key_mental_models: data.summary.keyMentalModels || [],
          common_mistakes: data.summary.commonMistakes || [],
          sources: data.summary.sources || [],
          user_notes: ''
        }
        setMaterials(prev => [...prev.filter(m => m.concept_index !== conceptIdx), newMaterial])
        return newMaterial
      }
    } catch (e) {
      console.error('[summary]', e)
    }
    return null
  }

  const send = async () => {
    if (!input.trim() || loading) return
    const userMsg: Message = { role: 'user', content: input }
    const updatedMessages = [...messages, userMsg]
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
      const masteredSummaries = materials
        .filter(m => m.concept_index < currentConcept)
        .map(m => `${m.concept_title}: ${m.summary.slice(0, 100)}`)
        .join(' | ')

      try {
        const res = await fetch('/api/trek', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phase: 'learning',
            messages: updatedMessages.slice(-20),
            conceptTitle: currentC.title,
            learnerProfile,
            conversationContext: masteredSummaries || undefined
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
            generateConceptSummary(currentC.title, currentConcept, updatedMessages, roadmapId)
            await persistConversation(roadmapId, updatedMessages, next, updatedConcepts)
            if (next >= concepts.length) {
              const { data: { session } } = await supabase.auth.getSession()
              await fetch('/api/roadmap', {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session?.access_token || ''}`
                },
                body: JSON.stringify({ roadmapId, status: 'completed' })
              })
            }
          }

          if (next < concepts.length && learnerProfile) {
            planConceptTeaching(updatedConcepts[next], learnerProfile)
          }

          setSidebarTab('materials')
        }

        if (data.reply) {
          const newMessages = [...updatedMessages, { role: 'assistant' as const, content: data.reply }]
          setMessages(newMessages)
          if (roadmapId) {
            persistConversation(roadmapId, newMessages, currentConcept, concepts)
          }
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

    const plan = learnerProfile ? await planConceptTeaching(updated[0], learnerProfile) : null
    const openingPrompt = plan?.openingPrompt || `okay let's start. tell me what you already know about ${updated[0].title}`

    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user && learnerProfile) {
      // Check if an active course for this topic already exists
      const { data: existing } = await supabase
        .from('roadmaps')
        .select('id')
        .eq('user_id', session.user.id)
        .ilike('topic', learnerProfile.topic.trim())
        .eq('status', 'active')
        .maybeSingle()

      if (existing) {
        setRoadmapId(existing.id)
      } else {
        const totalMinutes = concepts.reduce((a, c) => a + (c.estimatedMinutes || 0), 0)
        const res = await fetch('/api/roadmap', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            userId: session.user.id,
            topic: learnerProfile.topic,
            concepts: updated,
            learnerProfile,
            sourcesHit,
            totalMinutes
          })
        })
        const data = await res.json()
        if (data.roadmap) setRoadmapId(data.roadmap.id)
      }
    }

    setMessages([{ role: 'assistant', content: openingPrompt }])
  }

  const saveUserNotes = async () => {
    if (!selectedMaterial || !roadmapId) return
    setSavingNotes(true)
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/roadmap', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`
      },
      body: JSON.stringify({
        roadmapId,
        userNotes: { conceptIndex: selectedMaterial.concept_index, notes: userNotes }
      })
    })
    setMaterials(prev => prev.map(m =>
      m.concept_index === selectedMaterial.concept_index ? { ...m, user_notes: userNotes } : m
    ))
    setSavingNotes(false)
  }

  const exportNotes = () => {
    if (materials.length === 0) return
    const content = materials.map(m => `# ${m.concept_title}

${m.summary}

## Key Mental Models
${m.key_mental_models.map(mm => `- ${mm}`).join('\n')}

## Common Mistakes
${m.common_mistakes.map(mm => `- ${mm}`).join('\n')}
${m.user_notes ? `\n## My Notes\n${m.user_notes}` : ''}

---`).join('\n\n')

    const blob = new Blob([`# ${learnerProfile?.topic || 'Course'} Notes\n\n${content}`], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${learnerProfile?.topic || 'course'}-notes.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const deleteConceptItem = (id: number) => setConcepts(prev => prev.filter(c => c.id !== id))
  const startEdit = (concept: Concept) => { setEditingId(concept.id); setEditValue(concept.title) }
  const saveEdit = (id: number) => {
    setConcepts(prev => prev.map(c => c.id === id ? { ...c, title: editValue } : c))
    setEditingId(null)
  }
  const addConcept = () => {
    if (!newConcept.trim()) return
    setConcepts(prev => [...prev, {
      id: Date.now(), title: newConcept.trim(), why: '', subtopics: [],
      estimatedMinutes: 15, prereq: null, status: 'locked'
    }])
    setNewConcept('')
    setAddingNew(false)
  }

  const totalMinutes = concepts.reduce((acc, c) => acc + (c.estimatedMinutes || 0), 0)
  const sourceColors: Record<string, string> = {
    wikipedia: '#FFE500', wikidata: '#00FF87', openAlex: '#A855F7',
    stackOverflow: '#FF6B00', github: '#fff', npm: '#CB3837', devdocs: '#3D9BE9'
  }

  if (resuming) {
    return (
      <main style={{ minHeight: '100vh', background: '#080808', color: '#fff', fontFamily: "'Syne', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '14px', color: '#444', fontFamily: "'DM Mono', monospace" }}>loading your course...</div>
      </main>
    )
  }

  return (
    <main style={{ minHeight: '100vh', background: '#080808', color: '#fff', fontFamily: "'Syne', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #080808; }
        ::-webkit-scrollbar-thumb { background: #222; border-radius: 2px; }
        .chat-input { background: #111; border: 1px solid #222; border-radius: 14px; color: #fff; font-size: 14px; padding: 14px 18px; outline: none; width: 100%; font-family: 'Syne', sans-serif; transition: border-color 0.2s; }
        .chat-input:focus { border-color: #00FF87; }
        .chat-input::placeholder { color: #333; }
        .send-btn { background: #00FF87; color: #000; font-weight: 700; font-size: 13px; padding: 14px 22px; border-radius: 14px; border: none; cursor: pointer; font-family: 'Syne', sans-serif; transition: opacity 0.15s; white-space: nowrap; }
        .send-btn:hover { opacity: 0.85; }
        .send-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .msg-bubble { max-width: 80%; padding: 14px 18px; border-radius: 18px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
        .msg-user { background: #00FF87; color: #000; font-weight: 500; border-bottom-right-radius: 4px; margin-left: auto; }
        .msg-assign { background: #111; color: #ccc; border: 1px solid #1a1a1a; border-bottom-left-radius: 4px; }
        .concept-item { display: flex; align-items: flex-start; gap: 10px; padding: 10px 14px; border-radius: 10px; background: #111; border: 1px solid #1a1a1a; margin-bottom: 8px; transition: all 0.2s; }
        .concept-item.current { border-color: #00FF87; background: #00FF870a; }
        .concept-item.done { opacity: 0.5; cursor: pointer; }
        .concept-item.done:hover { opacity: 0.8; }
        .concept-num { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; font-family: 'DM Mono', monospace; margin-top: 1px; }
        .edit-input { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; color: #fff; font-size: 13px; padding: 6px 10px; outline: none; flex: 1; font-family: 'Syne', sans-serif; }
        .approve-btn { width: 100%; background: #00FF87; color: #000; font-weight: 800; font-size: 15px; padding: 16px; border-radius: 14px; border: none; cursor: pointer; font-family: 'Syne', sans-serif; letter-spacing: -0.3px; transition: opacity 0.15s; margin-top: 16px; }
        .approve-btn:hover { opacity: 0.85; }
        .thinking-dot { width: 6px; height: 6px; border-radius: 50%; background: #444; animation: bounce 1.2s infinite; display: inline-block; }
        .thinking-dot:nth-child(2) { animation-delay: 0.2s; }
        .thinking-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes bounce { 0%,80%,100% { transform: translateY(0); } 40% { transform: translateY(-6px); } }
        .grain { position: fixed; inset: 0; pointer-events: none; z-index: 0; opacity: 0.025; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E"); }
        .back-link { color: #333; font-size: 12px; text-decoration: none; font-family: 'DM Mono', monospace; transition: color 0.15s; }
        .back-link:hover { color: #fff; }
        .tab-btn { font-size: 11px; font-family: 'DM Mono', monospace; padding: 5px 10px; border-radius: 6px; border: 1px solid #1a1a1a; background: none; cursor: pointer; transition: all 0.15s; }
        .tab-btn.active { background: #fff; color: #000; border-color: #fff; }
        .tab-btn:not(.active) { color: #444; }
        .tab-btn:not(.active):hover { color: #888; }
        .material-card { background: #0e0e0e; border: 1px solid #1a1a1a; border-radius: 12px; padding: 14px; margin-bottom: 10px; cursor: pointer; transition: border-color 0.2s; }
        .material-card:hover { border-color: #333; }
        .notes-textarea { width: 100%; background: #111; border: 1px solid #222; border-radius: 8px; color: #ccc; font-size: 12px; padding: 10px; outline: none; font-family: 'DM Mono', monospace; resize: vertical; min-height: 80px; line-height: 1.5; }
        .notes-textarea:focus { border-color: #00FF87; }
        .subtopic-tag { font-size: 10px; font-family: 'DM Mono', monospace; color: #444; background: #1a1a1a; padding: 2px 7px; border-radius: 4px; margin: 2px; display: inline-block; }
      `}</style>

      <div className="grain" />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', height: '100vh' }}>

        {/* ── Sidebar ── */}
        {(phase === 'gist' || phase === 'learning') && (
          <div style={{ width: '300px', flexShrink: 0, borderRight: '1px solid #111', display: 'flex', flexDirection: 'column', padding: '24px 20px', overflowY: 'auto' }}>

            {gist && phase === 'gist' && (
              <div style={{ background: '#0e0e0e', border: '1px solid #1a1a1a', borderRadius: '14px', padding: '16px', marginBottom: '16px' }}>
                <div style={{ fontSize: '10px', fontFamily: "'DM Mono', monospace", color: '#00FF87', letterSpacing: '0.08em', marginBottom: '10px' }}>COURSE OVERVIEW</div>
                <p style={{ fontSize: '12px', color: '#555', lineHeight: 1.6, marginBottom: '14px' }}>{gist.emphasis}</p>
                {gist.prereqs?.length > 0 && (
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '10px', fontFamily: "'DM Mono', monospace", color: '#FF2D78', marginBottom: '6px' }}>BEFORE YOU START</div>
                    {gist.prereqs.map((p, i) => (
                      <div key={i} style={{ fontSize: '12px', color: '#666', padding: '4px 0', display: 'flex', gap: '8px' }}>
                        <span style={{ color: '#FF2D78', flexShrink: 0 }}>!</span>{p}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: '10px', fontFamily: "'DM Mono', monospace", color: '#FFE500', marginBottom: '8px' }}>YOU'LL BE ABLE TO</div>
                {gist.outcomes?.map((o, i) => (
                  <div key={i} style={{ fontSize: '12px', color: '#666', padding: '4px 0', display: 'flex', gap: '8px' }}>
                    <span style={{ color: '#00FF87', flexShrink: 0 }}>→</span>{o}
                  </div>
                ))}
                <div style={{ marginTop: '14px', padding: '8px 12px', background: '#111', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#333', fontFamily: "'DM Mono', monospace" }}>{concepts.length} concepts · ~{totalMinutes}min</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {sourcesHit.map(s => (
                      <span key={s} style={{ width: '6px', height: '6px', borderRadius: '50%', background: sourceColors[s] || '#333', display: 'inline-block' }} title={s} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {phase === 'learning' && (
              <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
                <button className={`tab-btn ${sidebarTab === 'roadmap' ? 'active' : ''}`} onClick={() => setSidebarTab('roadmap')}>roadmap</button>
                <button className={`tab-btn ${sidebarTab === 'materials' ? 'active' : ''}`} onClick={() => setSidebarTab('materials')}>
                  materials{materials.length > 0 ? ` (${materials.length})` : ''}
                </button>
              </div>
            )}

            {(phase === 'gist' || sidebarTab === 'roadmap') && (
              <>
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', fontFamily: "'DM Mono', monospace", color: '#00FF87', letterSpacing: '0.05em', marginBottom: '4px' }}>🗺️ ROADMAP</div>
                  <div style={{ fontSize: '12px', color: '#444' }}>
                    {phase === 'gist' ? 'edit then approve' : `concept ${currentConcept + 1} of ${concepts.length}`}
                  </div>
                </div>

                <div style={{ flex: 1 }}>
                  {concepts.map((concept, i) => (
                    <div
                      key={concept.id}
                      className={`concept-item ${concept.status}`}
                      onClick={() => {
                        if (concept.status === 'done') {
                          const mat = materials.find(m => m.concept_index === i)
                          if (mat) { setSelectedMaterial(mat); setUserNotes(mat.user_notes || ''); setSidebarTab('materials') }
                        }
                      }}
                    >
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
                          <button onClick={e => { e.stopPropagation(); startEdit(concept) }} style={{ background: 'none', border: 'none', color: '#2a2a2a', cursor: 'pointer', fontSize: '11px' }}>✏️</button>
                          <button onClick={e => { e.stopPropagation(); deleteConceptItem(concept.id) }} style={{ background: 'none', border: 'none', color: '#2a2a2a', cursor: 'pointer', fontSize: '11px' }}>✕</button>
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

                {phase === 'gist' && (
                  <button className="approve-btn" onClick={approveRoadmap}>start learning →</button>
                )}

                {phase === 'learning' && sidebarTab === 'roadmap' && (
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ padding: '12px', background: '#0e0e0e', borderRadius: '10px', border: '1px solid #111', marginBottom: '12px' }}>
                      <div style={{ fontSize: '11px', color: '#333', fontFamily: "'DM Mono', monospace", marginBottom: '8px' }}>PROGRESS</div>
                      <div style={{ background: '#1a1a1a', borderRadius: '4px', height: '4px', overflow: 'hidden' }}>
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
              </>
            )}

            {phase === 'learning' && sidebarTab === 'materials' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {materials.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    <div style={{ fontSize: '12px', color: '#333', fontFamily: "'DM Mono', monospace" }}>materials appear after you master each concept</div>
                  </div>
                ) : !selectedMaterial ? (
                  <>
                    {materials
                      .sort((a, b) => a.concept_index - b.concept_index)
                      .map((m, i) => (
                        <div key={i} className="material-card" onClick={() => { setSelectedMaterial(m); setUserNotes(m.user_notes || '') }}>
                          <div style={{ fontSize: '11px', color: '#00FF87', fontFamily: "'DM Mono', monospace", marginBottom: '4px' }}>concept {m.concept_index + 1}</div>
                          <div style={{ fontSize: '13px', color: '#ccc', fontWeight: 600, marginBottom: '4px' }}>{m.concept_title}</div>
                          <div style={{ fontSize: '11px', color: '#444', lineHeight: 1.5 }}>{m.summary.slice(0, 80)}...</div>
                        </div>
                      ))}
                    <button onClick={exportNotes} style={{ width: '100%', marginTop: '8px', background: 'none', border: '1px solid #222', borderRadius: '10px', color: '#444', padding: '10px', cursor: 'pointer', fontSize: '12px', fontFamily: "'DM Mono', monospace" }}>
                      ↓ export all notes
                    </button>
                  </>
                ) : (
                  <div style={{ flex: 1 }}>
                    <button onClick={() => setSelectedMaterial(null)} style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: '12px', fontFamily: "'DM Mono', monospace", marginBottom: '12px', padding: 0 }}>← back</button>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', marginBottom: '12px' }}>{selectedMaterial.concept_title}</div>
                    <div style={{ fontSize: '12px', color: '#666', lineHeight: 1.7, marginBottom: '16px' }}>{selectedMaterial.summary}</div>

                    {selectedMaterial.key_mental_models.length > 0 && (
                      <div style={{ marginBottom: '14px' }}>
                        <div style={{ fontSize: '10px', fontFamily: "'DM Mono', monospace", color: '#FFE500', marginBottom: '8px' }}>MENTAL MODELS</div>
                        {selectedMaterial.key_mental_models.map((mm, i) => (
                          <div key={i} style={{ fontSize: '12px', color: '#666', padding: '4px 0', display: 'flex', gap: '8px' }}>
                            <span style={{ color: '#FFE500', flexShrink: 0 }}>→</span>{mm}
                          </div>
                        ))}
                      </div>
                    )}

                    {selectedMaterial.common_mistakes.length > 0 && (
                      <div style={{ marginBottom: '14px' }}>
                        <div style={{ fontSize: '10px', fontFamily: "'DM Mono', monospace", color: '#FF2D78', marginBottom: '8px' }}>COMMON MISTAKES</div>
                        {selectedMaterial.common_mistakes.map((mm, i) => (
                          <div key={i} style={{ fontSize: '12px', color: '#666', padding: '4px 0', display: 'flex', gap: '8px' }}>
                            <span style={{ color: '#FF2D78', flexShrink: 0 }}>!</span>{mm}
                          </div>
                        ))}
                      </div>
                    )}

                    {selectedMaterial.sources.length > 0 && (
                      <div style={{ marginBottom: '14px' }}>
                        <div style={{ fontSize: '10px', fontFamily: "'DM Mono', monospace", color: '#A855F7', marginBottom: '8px' }}>SOURCES</div>
                        {selectedMaterial.sources.map((s, i) => (
                          <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', fontFamily: "'DM Mono', monospace", background: '#1a1a1a', color: '#888', border: '1px solid #222', padding: '3px 8px', borderRadius: '4px', textDecoration: 'none', display: 'inline-block', margin: '2px' }}>
                            {s.label} ↗
                          </a>
                        ))}
                      </div>
                    )}

                    <div>
                      <div style={{ fontSize: '10px', fontFamily: "'DM Mono', monospace", color: '#444', marginBottom: '6px' }}>YOUR NOTES</div>
                      <textarea
                        className="notes-textarea"
                        value={userNotes}
                        onChange={e => setUserNotes(e.target.value)}
                        placeholder="add your own notes..."
                      />
                      <button onClick={saveUserNotes} disabled={savingNotes} style={{ marginTop: '6px', background: 'none', border: '1px solid #222', borderRadius: '8px', color: '#444', padding: '6px 12px', cursor: 'pointer', fontSize: '11px', fontFamily: "'DM Mono', monospace" }}>
                        {savingNotes ? 'saving...' : 'save notes'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Main chat ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: phase === 'discovery' ? '680px' : 'none', margin: phase === 'discovery' ? '0 auto' : '0', width: '100%', padding: '0 24px' }}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 0 20px', borderBottom: '1px solid #111' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.5px' }}>assign</span>
              <span style={{ fontSize: '11px', fontFamily: "'DM Mono', monospace", color: '#00FF87', background: '#00FF8715', padding: '3px 8px', borderRadius: '6px' }}>🗺️ trek</span>
              {phase === 'learning' && concepts[currentConcept] && (
                <span style={{ fontSize: '11px', fontFamily: "'DM Mono', monospace", color: '#FFE500', background: '#FFE50010', padding: '3px 8px', borderRadius: '6px' }}>
                  {concepts[currentConcept].title}
                </span>
              )}
              {phase === 'gist' && (
                <span style={{ fontSize: '11px', fontFamily: "'DM Mono', monospace", color: '#A855F7', background: '#A855F715', padding: '3px 8px', borderRadius: '6px' }}>review course</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <a href="/dashboard" className="back-link">dashboard</a>
              <a href="/" className="back-link">← back</a>
            </div>
          </div>

          <div ref={chatContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '24px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
            {phase === 'gist' ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '14px 18px', background: '#0e0e0e', borderRadius: '14px', border: '1px solid #1a1a1a' }}>
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

export default function TrekPage() {
  return (
    <Suspense fallback={
      <main style={{ minHeight: '100vh', background: '#080808', color: '#fff', fontFamily: "'Syne', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '14px', color: '#444', fontFamily: "'DM Mono', monospace" }}>loading...</div>
      </main>
    }>
      <TrekPageInner />
    </Suspense>
  )
}
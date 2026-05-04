'use client'

export const dynamic = 'force-dynamic'

import { useState, useRef, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Message { role: 'assistant' | 'user'; content: string; is_consolidation?: boolean }
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
interface NoteKeyPoint { point: string; example: string }
interface ConceptMaterial {
  concept_index: number; concept_title: string; summary: string
  quick_reference: string; the_analogy: string; key_points: NoteKeyPoint[]
  student_analogy: string; watch_out: string; full_text: string; user_notes: string
}
interface ReportKC {
  title: string; status: string; p_learned: number; attempt_count: number
  flag_type: string | null; avg_score: number; passed_on_attempt: number | null
}
interface SessionReport {
  topic_title: string
  overall_mastery_pct: number
  kcs: ReportKC[]
  strengths: string[]
  needs_work: string[]
  misconceptions: string[]
  avg_attempts_to_master: number
  learning_velocity: 'improving' | 'steady' | 'slowing'
  suggestions: string[]
}
type Phase = 'discovery' | 'gist' | 'learning'
type SidebarTab = 'roadmap' | 'materials'

const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' }
const serif: React.CSSProperties = { fontFamily: 'var(--font-serif)' }
const label: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-foreground)' }
const card: React.CSSProperties = { background: 'var(--card)', border: '2px solid var(--border)', borderRadius: '4px' }
const shadow: React.CSSProperties = { boxShadow: '4px 4px 0px 0px hsl(0 0% 10%)' }
const shadowSm: React.CSSProperties = { boxShadow: '3px 3px 0px 0px hsl(0 0% 10%)' }

const scoreColor = (pct: number) => {
  if (pct >= 75) return '#1f6f3f'
  if (pct >= 50) return '#8a5a00'
  return '#8f1d1d'
}

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
  // backendPhase mirrors the trek-api checkpoint phase — sent back on every
  // message so route_intent can classify explanations vs other input.
  const [backendPhase, setBackendPhase] = useState<string>('discovery')
  // topicId is set once curriculum builds; required by /api/b2c/message.
  const [topicId, setTopicId] = useState<string>('')

  // ── UI state ───────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('discovery')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [resuming, setResuming] = useState(false)
  const [authError, setAuthError] = useState('')

  // ── Course state ───────────────────────────────────────────────────────────
  const [sprintPlan, setSprintPlan] = useState<SprintPlan | null>(null)
  const [gist] = useState<string>('')
  const [currentConceptIdx, setCurrentConceptIdx] = useState(0)
  const [roadmapId, setRoadmapId] = useState<string>('')
  const [visual, setVisual] = useState<Visual | null>(null)

  // ── Materials ──────────────────────────────────────────────────────────────
  const [materials, setMaterials] = useState<ConceptMaterial[]>([])
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('roadmap')
  const [selectedMaterial, setSelectedMaterial] = useState<ConceptMaterial | null>(null)
  const [userNotes, setUserNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [report, setReport] = useState<SessionReport | null>(null)
  const [selectionMenu, setSelectionMenu] = useState<{ text: string; x: number; y: number } | null>(null)

  // ── Syllabus upload ────────────────────────────────────────────────────────
  const [showUploadZone, setShowUploadZone] = useState(false)
  const [syllabusBase64, setSyllabusBase64] = useState('')
  const [syllabusMimeType, setSyllabusMimeType] = useState('')
  const [syllabusFilename, setSyllabusFilename] = useState('')

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

  const syncSelectedMaterial = useCallback((nextMaterials: ConceptMaterial[]) => {
    if (!selectedMaterial) return
    const match = nextMaterials.find(m => m.concept_index === selectedMaterial.concept_index)
    if (match) {
      setSelectedMaterial(match)
      setUserNotes(match.user_notes || '')
    }
  }, [selectedMaterial])

  const refreshMaterials = useCallback(async (nextRoadmapId?: string) => {
    const targetRoadmapId = nextRoadmapId || roadmapId
    if (!targetRoadmapId) return
    const res = await fetch(`/api/roadmap?id=${targetRoadmapId}`)
    const data = await res.json()
    const nextMaterials = (data.materials || []) as ConceptMaterial[]
    setMaterials(nextMaterials)
    syncSelectedMaterial(nextMaterials)
  }, [roadmapId, syncSelectedMaterial])

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

  useEffect(() => {
    const handleMouseUp = () => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || !chatContainerRef.current) {
        setSelectionMenu(null)
        return
      }
      const text = selection.toString().trim()
      if (!text) {
        setSelectionMenu(null)
        return
      }
      const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null
      if (!range) return
      const ancestor = range.commonAncestorContainer
      if (!chatContainerRef.current.contains(ancestor.nodeType === Node.TEXT_NODE ? ancestor.parentElement : ancestor)) {
        setSelectionMenu(null)
        return
      }
      const rect = range.getBoundingClientRect()
      setSelectionMenu({
        text,
        x: rect.left + rect.width / 2,
        y: Math.max(16, rect.top - 44),
      })
    }

    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [])

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      let uid = session?.user?.id || ''

      if (!uid) {
        const { data, error } = await supabase.auth.signInAnonymously()
        if (error) {
          console.error('[trek] anonymous sign-in failed', error)
        }
        uid = data.user?.id || ''
      }

      if (!uid) {
        setAuthError('sign in to start trek — anonymous session setup failed.')
        setMessages([{ role: 'assistant', content: 'sign in to start trek — anonymous session setup failed.' }])
        setShowUploadZone(false)
        return
      }

      setAuthError('')
      setUserId(uid)

      const resumeId = searchParams.get('resume')
      if (resumeId) {
        setResuming(true)
        await loadRoadmap(resumeId)
        setResuming(false)
      } else {
        setShowUploadZone(true)
      }
    }
    init()
  }, [searchParams])

  // ── Start trek-api session ─────────────────────────────────────────────────
  const startSession = async (uid: string, syllabusB64?: string, mimeType?: string) => {
    if (!uid) {
      setAuthError('sign in to start trek — there is no active user session.')
      setMessages([{ role: 'assistant', content: 'sign in to start trek — there is no active user session.' }])
      return
    }
    setShowUploadZone(false)
    setLoading(true)
    try {
      const startBody: Record<string, string> = { user_id: uid }
      if (syllabusB64) {
        startBody.syllabus_base64 = syllabusB64
        startBody.syllabus_mime_type = mimeType || 'image/png'
      }
      const data = await trekApi('start', startBody)
      setSessionId(data.session_id)
      if (data.phase) setBackendPhase(data.phase)
      setMessages([{ role: 'assistant', content: data.reply }])
    } catch {
      setMessages([{ role: 'assistant', content: 'something went wrong starting trek. refresh and try again.' }])
    } finally {
      setLoading(false)
    }
  }

  // ── Syllabus file handler ──────────────────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      alert('file too large — max 5MB')
      e.target.value = ''
      return
    }
    setSyllabusFilename(file.name)
    setSyllabusMimeType(file.type)
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setSyllabusBase64(result.split(',')[1] ?? '')
    }
    reader.readAsDataURL(file)
  }

  const removeSyllabus = () => {
    setSyllabusFilename('')
    setSyllabusBase64('')
    setSyllabusMimeType('')
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

  const fetchReport = useCallback(async () => {
    if (!sessionId) return
    setReportLoading(true)
    try {
      const res = await fetch(`/api/trek?action=report&sessionId=${sessionId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'report error')
      setReport(data as SessionReport)
    } catch {
      setReport(null)
    } finally {
      setReportLoading(false)
    }
  }, [sessionId])

  // ── Send message — reads SSE stream from /api/trek ────────────────────────
  const send = async () => {
    if (!input.trim() || loading) return
    const userMsg: Message = { role: 'user', content: input }
    const sentInput = input
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setVisual(null)

    try {
      const res = await fetch('/api/trek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'message',
          session_id: sessionId,
          user_id: userId,
          message: sentInput,
          phase: backendPhase,
          topic_id: topicId,
          roadmap_id: roadmapId || null,
        }),
      })

      if (!res.ok || !res.body) throw new Error(`trek api error ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue
          try {
            const evt = JSON.parse(raw)

            if (evt.type === 'message') {
              setMessages(prev => [...prev, { role: 'assistant', content: evt.content }])
              if (evt.phase) setBackendPhase(evt.phase)

            } else if (evt.type === 'curriculum_ready') {
              if (evt.topic_id) setTopicId(evt.topic_id)
              if (evt.roadmap_id) setRoadmapId(evt.roadmap_id)
              if (evt.kc_graph?.length) {
                // Wrap the flat KC list in a single sprint so the existing
                // sidebar roadmap renders without structural changes.
                const kcs: { id: string; title: string; status: string; order_index: number }[] = evt.kc_graph
                setSprintPlan({
                  topic: evt.topic_title || '',
                  exit_condition: '',
                  total_sprints: 1,
                  total_hours: kcs.length,
                  available_hours: kcs.length,
                  sprints: [{
                    sprint_number: 1,
                    total_hours: kcs.length,
                    cognitive_load: 0,
                    concepts: kcs.map((kc, i) => ({
                      id: kc.id,
                      title: kc.title,
                      description: '',
                      why_needed: '',
                      complexity: 0,
                      estimated_hours: 1,
                      prerequisites: [],
                      requires_live_data: false,
                      status: kc.status === 'mastered'
                        ? 'done'
                        : i === 0 ? 'current' : 'locked' as const,
                    })),
                  }],
                  cut_nodes: [],
                  cut_count: 0,
                })
                if (evt.roadmap_id) {
                  void refreshMaterials(evt.roadmap_id)
                }
                setPhase('gist')
              }

            } else if (evt.type === 'kc_graph') {
              // Update per-KC status after validation or note generation.
              if (evt.kc_graph?.length) {
                const statusMap = new Map(
                  evt.kc_graph.map((kc: { id: string; status: string }) => [kc.id, kc.status])
                )
                setSprintPlan(prev => {
                  if (!prev) return prev
                  return {
                    ...prev,
                    sprints: prev.sprints.map(s => ({
                      ...s,
                      concepts: s.concepts.map(c => ({
                        ...c,
                        status: statusMap.get(c.id) === 'mastered' ? 'done' : c.status,
                      })),
                    })),
                  }
                })
              }
              if (roadmapId) {
                void refreshMaterials()
              }
              if (reportOpen) {
                void fetchReport()
              }

            } else if (evt.type === 'consolidation') {
              setMessages(prev => [...prev, { role: 'assistant', content: evt.content, is_consolidation: true }])
              if (roadmapId) {
                void refreshMaterials()
              }

            } else if (evt.type === 'validation_result') {
              if (evt.next_phase) setBackendPhase(evt.next_phase)
              if (phase !== 'learning') setPhase('learning')
              if (evt.passed && roadmapId) {
                void refreshMaterials()
              }
              if (reportOpen) {
                void fetchReport()
              }

            } else if (evt.type === 'error') {
              setMessages(prev => [
                ...prev,
                { role: 'assistant', content: evt.message || 'something went wrong, try again' },
              ])
            }
            // 'done' type: no action needed — the reader loop ends naturally
          } catch {
            // skip malformed SSE events
          }
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'something went wrong, try again' }])
    } finally {
      setLoading(false)
    }
  }

  // ── Approve roadmap ────────────────────────────────────────────────────────
  // In the B2C pipeline, curriculum builds and teaching starts automatically
  // when discovery completes — the first teaching question is already in chat
  // by the time the user sees the gist view.  Approving just transitions the
  // UI; no additional API call is required.
  const approveRoadmap = () => {
    setPhase('learning')
  }

  // ── Save notes ─────────────────────────────────────────────────────────────
  const saveUserNotes = async () => {
    if (!selectedMaterial || !roadmapId) return
    setSavingNotes(true)
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/roadmap', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
      body: JSON.stringify({ roadmapId, userNotes: { conceptIndex: selectedMaterial.concept_index, conceptTitle: selectedMaterial.concept_title, notes: userNotes } })
    })
    setMaterials(prev => prev.map(m =>
      m.concept_index === selectedMaterial.concept_index ? { ...m, user_notes: userNotes } : m
    ))
    setSavingNotes(false)
  }

  const saveSelectionToNotes = async () => {
    if (!selectionMenu?.text || !roadmapId) return
    const targetMaterial = selectedMaterial || materials.find(m => m.concept_index === currentConceptIdx) || (currentConcept ? {
      concept_index: currentConceptIdx,
      concept_title: currentConcept.title,
      summary: '',
      quick_reference: '',
      the_analogy: '',
      key_points: [],
      student_analogy: '',
      watch_out: '',
      full_text: '',
      user_notes: '',
    } : null)
    if (!targetMaterial) return

    const nextNotes = [targetMaterial.user_notes?.trim(), selectionMenu.text]
      .filter(Boolean)
      .join('\n\n')

    if (selectedMaterial && selectedMaterial.concept_index === targetMaterial.concept_index) {
      setUserNotes(nextNotes)
      setSelectedMaterial({ ...selectedMaterial, user_notes: nextNotes })
    }

    setMaterials(prev => {
      const existing = prev.find(m => m.concept_index === targetMaterial.concept_index)
      if (existing) {
        return prev.map(m => m.concept_index === targetMaterial.concept_index ? { ...m, user_notes: nextNotes } : m)
      }
      return [...prev, { ...targetMaterial, user_notes: nextNotes }]
    })

    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/roadmap', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
      body: JSON.stringify({
        roadmapId,
        userNotes: {
          conceptIndex: targetMaterial.concept_index,
          conceptTitle: targetMaterial.concept_title,
          notes: nextNotes,
        },
      }),
    })

    setSelectionMenu(null)
    window.getSelection()?.removeAllRanges()
  }

  // ── Export notes ───────────────────────────────────────────────────────────
  const exportNotes = () => {
    if (!materials.length) return
    const content = materials.map(m =>
      `# ${m.concept_title}\n${m.quick_reference ? `> ${m.quick_reference}\n\n` : ''}${m.summary}\n${m.the_analogy ? `\n## How We Explained It\n${m.the_analogy}\n` : ''}\n## Key Points\n${m.key_points.map(kp => `- ${kp.point}${kp.example ? `\n  Example: ${kp.example}` : ''}`).join('\n')}${m.student_analogy ? `\n## In Your Own Words\n${m.student_analogy}\n` : ''}${m.watch_out ? `\n## Watch Out\n${m.watch_out}\n` : ''}${m.user_notes ? `\n## My Notes\n${m.user_notes}` : ''}\n---`
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

      {selectionMenu && (
        <button
          onClick={saveSelectionToNotes}
          style={{
            position: 'fixed',
            left: selectionMenu.x,
            top: selectionMenu.y,
            transform: 'translateX(-50%)',
            zIndex: 40,
            background: 'var(--foreground)',
            color: 'var(--background)',
            border: '2px solid var(--border)',
            padding: '8px 12px',
            borderRadius: '4px',
            ...mono,
            fontSize: '11px',
            ...shadowSm,
          }}
        >
          save to notes
        </button>
      )}

      <div style={{ display: 'flex', height: '100vh' }}>

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        {(phase === 'gist' || phase === 'learning') && (
          <aside style={{ width: '288px', flexShrink: 0, borderRight: '2px solid var(--border)', display: 'flex', flexDirection: 'column', padding: '24px 18px', overflowY: 'auto', background: 'var(--card)' }}>
            <div style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1.5px solid var(--muted)' }}>
              <Link href="/" style={{ textDecoration: 'none' }}><span style={{ ...serif, fontSize: '22px', color: 'var(--foreground)', letterSpacing: '-0.5px' }}>assign</span></Link>
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
                    <Link href="/dashboard" style={{ display: 'block', textAlign: 'center' as const, padding: '10px', ...card, ...mono, fontSize: '12px', color: 'var(--foreground)', textDecoration: 'none' }}>dashboard →</Link>
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
                    {selectedMaterial.quick_reference && (
                      <div style={{ ...card, ...shadowSm, background: 'var(--background)', padding: '12px', marginBottom: '14px' }}>
                        <p style={{ ...label, marginBottom: '6px' }}>quick reference</p>
                        <p style={{ ...mono, fontSize: '12px', lineHeight: 1.6 }}>{selectedMaterial.quick_reference}</p>
                      </div>
                    )}
                    <p style={{ ...mono, fontSize: '12px', color: 'var(--muted-foreground)', lineHeight: 1.7, marginBottom: '16px' }}>{selectedMaterial.summary}</p>
                    {selectedMaterial.the_analogy && (
                      <div style={{ marginBottom: '14px' }}>
                        <p style={{ ...label, marginBottom: '8px' }}>how we explained it</p>
                        <p style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)', lineHeight: 1.7 }}>{selectedMaterial.the_analogy}</p>
                      </div>
                    )}
                    {selectedMaterial.key_points.length > 0 && (
                      <div style={{ marginBottom: '14px' }}>
                        <p style={{ ...label, marginBottom: '8px' }}>key points</p>
                        {selectedMaterial.key_points.map((item, i) => (
                          <div key={i} style={{ marginBottom: '10px', borderTop: i === 0 ? 'none' : '1px solid var(--muted)', paddingTop: i === 0 ? 0 : '10px' }}>
                            <p style={{ ...mono, fontSize: '11px', marginBottom: '4px' }}>{item.point}</p>
                            {item.example && (
                              <pre style={{ ...mono, fontSize: '10px', whiteSpace: 'pre-wrap', color: 'var(--muted-foreground)', background: 'var(--background)', border: '1px solid var(--border)', padding: '8px', borderRadius: '4px' }}>{item.example}</pre>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {selectedMaterial.student_analogy && (
                      <div style={{ marginBottom: '14px' }}>
                        <p style={{ ...label, marginBottom: '8px' }}>in your own words</p>
                        <p style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)', lineHeight: 1.7 }}>{selectedMaterial.student_analogy}</p>
                      </div>
                    )}
                    {selectedMaterial.watch_out && (
                      <div style={{ ...card, padding: '12px', marginBottom: '14px', background: 'var(--background)' }}>
                        <p style={{ ...label, marginBottom: '6px' }}>watch out</p>
                        <p style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)', lineHeight: 1.7 }}>{selectedMaterial.watch_out}</p>
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
              {phase === 'learning' && (
                <button
                  onClick={() => {
                    if (!sessionId) return
                    setReportOpen(true)
                    void fetchReport()
                  }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', ...mono, fontSize: '11px', color: 'var(--muted-foreground)', padding: 0 }}
                >
                  progress
                </button>
              )}
              <Link href="/dashboard" style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)', textDecoration: 'none' }}>dashboard</Link>
              <Link href="/" style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)', textDecoration: 'none' }}>← home</Link>
            </div>
          </div>

          <div ref={chatContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '24px 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>

            {/* ── Syllabus upload zone — shown before session starts ── */}
            {showUploadZone && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '40px 0' }}>
                <div style={{ width: '100%', maxWidth: '480px' }}>
                  {!syllabusFilename ? (
                    <label
                      htmlFor="syllabus-upload"
                      style={{ display: 'block', border: '2px solid var(--border)', padding: '36px 28px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--muted-foreground)', textAlign: 'center' as const, lineHeight: 1.6, transition: 'box-shadow 0.15s', userSelect: 'none' as const }}
                      onMouseEnter={e => (e.currentTarget.style.boxShadow = '4px 4px 0 0 hsl(0 0% 10%)')}
                      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
                    >
                      got a syllabus? upload it for a course mapped to your topics
                      <div style={{ marginTop: '10px', fontSize: '11px', opacity: 0.45 }}>PDF · PNG · JPG — max 5MB</div>
                      <input id="syllabus-upload" type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: 'none' }} onChange={handleFileSelect} />
                    </label>
                  ) : (
                    <div style={{ border: '2px solid var(--border)', padding: '16px 20px', fontFamily: 'var(--font-mono)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '4px 4px 0 0 hsl(0 0% 10%)' }}>
                      <span style={{ fontSize: '13px', color: 'var(--foreground)' }}>{syllabusFilename}</span>
                      <button onClick={removeSyllabus} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted-foreground)', padding: '0 0 0 16px' }}>remove</button>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                    {syllabusFilename ? (
                      <button
                        className="ts"
                        style={{ flex: 1 }}
                        onClick={() => startSession(userId, syllabusBase64, syllabusMimeType)}
                      >
                        continue →
                      </button>
                    ) : <div />}
                    <button
                      onClick={() => startSession(userId)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--muted-foreground)', textDecoration: 'underline', padding: 0, marginLeft: syllabusFilename ? '20px' : 0 }}
                    >
                      skip
                    </button>
                  </div>
                </div>
              </div>
            )}

            {!showUploadZone && authError && (
              <div style={{ ...card, ...shadowSm, maxWidth: '520px', padding: '16px', marginBottom: '10px' }}>
                <p style={{ ...label, marginBottom: '8px' }}>authentication required</p>
                <p style={{ ...mono, fontSize: '12px', lineHeight: 1.7, color: 'var(--muted-foreground)', marginBottom: '12px' }}>{authError}</p>
                <Link href="/login" style={{ ...mono, fontSize: '12px', color: 'var(--foreground)', textDecoration: 'underline' }}>
                  go to login →
                </Link>
              </div>
            )}

            {!showUploadZone && messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: m.is_consolidation ? 'column' : 'row', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', alignItems: m.is_consolidation ? 'flex-start' : undefined }}>
                {m.is_consolidation && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--muted-foreground)', marginBottom: '4px' }}>concept locked in</span>
                )}
                <div style={{ maxWidth: '78%', padding: '12px 16px', fontSize: '14px', lineHeight: 1.65, whiteSpace: 'pre-wrap', border: '2px solid var(--border)', borderLeft: m.is_consolidation ? '3px solid var(--border)' : '2px solid var(--border)', ...shadowSm, ...(m.role === 'user' ? { background: 'var(--foreground)', color: 'var(--background)' } : { background: 'var(--card)', color: 'var(--foreground)' }) }}>
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
            {showUploadZone ? null : phase === 'gist' ? (
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

      {reportOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 35 }}>
          <div style={{ position: 'absolute', top: 0, right: 0, width: '380px', maxWidth: '100%', height: '100%', background: 'var(--card)', borderLeft: '2px solid var(--border)', padding: '22px 18px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <p style={{ ...label, marginBottom: '6px' }}>performance report</p>
                <p style={{ ...mono, fontSize: '12px', color: 'var(--muted-foreground)' }}>{report?.topic_title || currentConcept?.title || 'current session'}</p>
              </div>
              <button onClick={() => setReportOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', ...mono, fontSize: '11px', color: 'var(--muted-foreground)', padding: 0 }}>close</button>
            </div>

            {reportLoading && (
              <div style={{ ...card, padding: '14px', ...mono, fontSize: '12px' }}>loading report...</div>
            )}

            {!reportLoading && report && (
              <>
                <div style={{ ...card, ...shadowSm, padding: '16px', marginBottom: '16px' }}>
                  <p style={{ ...label, marginBottom: '8px' }}>overall mastery</p>
                  <div style={{ ...mono, fontSize: '34px', lineHeight: 1, marginBottom: '8px' }}>{Math.round(report.overall_mastery_pct)}%</div>
                  <p style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)' }}>
                    avg attempts to master: {report.avg_attempts_to_master || 0} · velocity: {report.learning_velocity}
                  </p>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <p style={{ ...label, marginBottom: '8px' }}>knowledge components</p>
                  {report.kcs.map((kc, index) => {
                    const pct = Math.round(kc.p_learned * 100)
                    const color = scoreColor(pct)
                    return (
                      <div key={`${kc.title}-${index}`} style={{ ...card, padding: '10px 12px', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '6px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 500 }}>{kc.title}</span>
                          <span style={{ ...mono, fontSize: '10px', color: 'var(--muted-foreground)' }}>{pct}%</span>
                        </div>
                        <div style={{ height: '6px', border: '1px solid var(--border)', background: 'var(--background)', marginBottom: '6px' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: color }} />
                        </div>
                        <p style={{ ...mono, fontSize: '10px', color: 'var(--muted-foreground)' }}>
                          {kc.status} · attempts {kc.attempt_count} · avg score {Math.round(kc.avg_score * 100)}%
                          {kc.passed_on_attempt ? ` · passed on attempt ${kc.passed_on_attempt}` : ''}
                        </p>
                      </div>
                    )
                  })}
                </div>

                {[
                  { label: 'strengths', values: report.strengths },
                  { label: 'needs work', values: report.needs_work },
                  { label: 'misconceptions', values: report.misconceptions },
                ].map(section => (
                  <div key={section.label} style={{ marginBottom: '14px' }}>
                    <p style={{ ...label, marginBottom: '8px' }}>{section.label}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {section.values.length === 0 ? (
                        <span style={{ ...mono, fontSize: '10px', color: 'var(--muted-foreground)' }}>none</span>
                      ) : section.values.map(value => (
                        <span key={value} style={{ ...mono, fontSize: '10px', border: '1.5px solid var(--border)', padding: '4px 8px', background: 'var(--background)' }}>{value}</span>
                      ))}
                    </div>
                  </div>
                ))}

                <div>
                  <p style={{ ...label, marginBottom: '8px' }}>suggestions</p>
                  {report.suggestions.map((suggestion, index) => (
                    <div key={`${suggestion}-${index}`} style={{ ...card, padding: '10px 12px', marginBottom: '8px' }}>
                      <p style={{ ...mono, fontSize: '11px', lineHeight: 1.7 }}>{index + 1}. {suggestion}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
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

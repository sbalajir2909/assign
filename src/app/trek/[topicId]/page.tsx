'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import TrekChat from '@/components/TrekChat'
import type { Phase, KCNode, B2CStartResponse } from '@/lib/types'

const B2C_API = process.env.NEXT_PUBLIC_TREK_API_URL || 'http://localhost:8000'

export default function TrekTopicPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const topicId = params.topicId as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [userId, setUserId] = useState('')
  const [initialPhase, setInitialPhase] = useState<Phase>('discovery')
  const [initialMessage, setInitialMessage] = useState('')
  const [kcGraph, setKcGraph] = useState<KCNode[]>([])
  const [currentKcIndex, setCurrentKcIndex] = useState(0)
  const [topicTitle, setTopicTitle] = useState('')
  const [resumedSessionId, setResumedSessionId] = useState('')

  const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' }
  const serif: React.CSSProperties = { fontFamily: 'var(--font-serif)' }

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { router.push('/login'); return }

        const uid = session.user.id
        setUserId(uid)

        // Check for resume param
        const existingSession = searchParams.get('session')

        if (existingSession) {
          // Resume existing session
          const stateRes = await fetch(`${B2C_API}/api/b2c/state/${existingSession}`)
          if (stateRes.ok) {
            const state = await stateRes.json()
            setSessionId(existingSession)
            setResumedSessionId(existingSession)
            setInitialPhase(state.phase)
            setTopicTitle(state.topic_title || '')
            setKcGraph(state.kc_graph || [])
            setCurrentKcIndex(state.current_kc_index || 0)
            setInitialMessage(
              state.phase === 'awaiting_explanation'
                ? 'welcome back — explain the current concept when you\'re ready.'
                : 'welcome back — let\'s continue where we left off.'
            )
            setLoading(false)
            return
          }
        }

        // Start new session
        const res = await fetch(`${B2C_API}/api/b2c/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: uid }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.detail || 'Failed to start session')
        }

        const data: B2CStartResponse = await res.json()
        setSessionId(data.session_id)
        setInitialPhase(data.phase)
        setInitialMessage(data.reply)
        setLoading(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong')
        setLoading(false)
      }
    }

    init()
  }, [topicId])

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--background)', flexDirection: 'column', gap: '12px' }}>
        <span style={{ ...serif, fontSize: '22px', letterSpacing: '-0.5px', color: 'var(--foreground)' }}>assign</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--muted-foreground)', animation: `bounce 1.2s ${i * 0.2}s infinite` }} />
          ))}
        </div>
        <style>{`@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}`}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--background)', flexDirection: 'column', gap: '16px' }}>
        <p style={{ ...mono, fontSize: '13px', color: '#ff6b6b' }}>{error}</p>
        <button
          onClick={() => router.back()}
          style={{ ...mono, fontSize: '12px', background: 'none', border: '2px solid var(--border)', borderRadius: '4px', padding: '8px 16px', cursor: 'pointer', color: 'var(--foreground)' }}
        >
          go back
        </button>
      </div>
    )
  }

  return (
    <TrekChat
      sessionId={sessionId}
      userId={userId}
      initialPhase={initialPhase}
      initialMessage={initialMessage}
      topicId={topicId !== 'new' ? topicId : ''}
      topicTitle={topicTitle}
      kcGraph={kcGraph}
      currentKcIndex={currentKcIndex}
    />
  )
}

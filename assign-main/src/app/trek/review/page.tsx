'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import TrekChat from '@/components/TrekChat'
import type {
  B2CStartResponse,
  KCNode,
  Phase,
  ReviewDueKC,
  ReviewDueResponse,
  SessionState,
} from '@/lib/types'

export default function TrekReviewPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [startingKcId, setStartingKcId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [userId, setUserId] = useState('')
  const [dueReviews, setDueReviews] = useState<ReviewDueResponse>({ due_count: 0, kcs: [] })

  const [sessionId, setSessionId] = useState('')
  const [initialPhase, setInitialPhase] = useState<Phase>('teaching')
  const [initialMessage, setInitialMessage] = useState('')
  const [topicId, setTopicId] = useState('')
  const [topicTitle, setTopicTitle] = useState('')
  const [kcGraph, setKcGraph] = useState<KCNode[]>([])
  const [currentKcIndex, setCurrentKcIndex] = useState(0)

  const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' }
  const serif: React.CSSProperties = { fontFamily: 'var(--font-serif)' }

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          router.replace('/login')
          return
        }

        const uid = session.user.id
        setUserId(uid)

        const res = await fetch(`/api/b2c/review/${uid}`)
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.detail || err.error || 'Failed to load due reviews')
        }

        const data: ReviewDueResponse = await res.json()
        setDueReviews(data)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong')
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [router])

  const startReview = async (kc: ReviewDueKC) => {
    if (!userId || startingKcId) return

    setStartingKcId(kc.kc_id)
    setError('')

    try {
      const startRes = await fetch('/api/trek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          user_id: userId,
          review_kc_id: kc.kc_id,
        }),
      })

      if (!startRes.ok) {
        const err = await startRes.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to start review session')
      }

      const startData: B2CStartResponse = await startRes.json()

      const stateRes = await fetch(`/api/b2c/state/${startData.session_id}`)
      if (!stateRes.ok) {
        throw new Error('Failed to load review session state')
      }

      const state: SessionState = await stateRes.json()

      setSessionId(startData.session_id)
      setInitialPhase(startData.phase)
      setInitialMessage(startData.reply)
      setTopicId(state.topic_id || kc.topic_id)
      setTopicTitle(state.topic_title || kc.topic_title)
      setKcGraph(state.kc_graph || [])
      setCurrentKcIndex(state.current_kc_index || 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start review')
      setStartingKcId(null)
    }
  }

  if (sessionId) {
    return (
      <TrekChat
        sessionId={sessionId}
        userId={userId}
        initialPhase={initialPhase}
        initialMessage={initialMessage}
        topicId={topicId}
        topicTitle={topicTitle}
        kcGraph={kcGraph}
        currentKcIndex={currentKcIndex}
      />
    )
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--background)' }}>
        <span style={{ ...mono, fontSize: '13px', color: 'var(--muted-foreground)' }}>
          loading review queue...
        </span>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <nav className="flex justify-between items-center px-10 py-5 border-b-2 border-foreground">
        <Link href="/" className="flex items-center gap-2 no-underline">
          <span className="w-2 h-2 rounded-full bg-primary inline-block" />
          <span className="font-mono text-lg font-medium text-foreground tracking-tight">assign</span>
        </Link>
        <Link href="/dashboard" className="font-mono text-xs text-muted-foreground no-underline hover:text-primary transition-colors">
          ← back
        </Link>
      </nav>

      <div className="max-w-4xl mx-auto px-10 py-14">
        <div className="mb-12">
          <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.16em] mb-3">
            spaced repetition
          </p>
          <h1 className="text-5xl leading-tight tracking-tight text-foreground" style={{ ...serif, fontStyle: 'italic' }}>
            review what’s<br />
            <span className="text-primary">ready now</span>
          </h1>
        </div>

        {error && (
          <div className="brutalist-shadow bg-card border-2 border-foreground p-5 mb-6">
            <p className="font-mono text-xs text-red-500">{error}</p>
          </div>
        )}

        {dueReviews.due_count === 0 ? (
          <div className="brutalist-shadow bg-card border-2 border-foreground p-8 text-center">
            <p className="font-mono text-sm text-muted-foreground mb-5">
              nothing is due right now. come back when more concepts are ready for review.
            </p>
            <Link
              href="/dashboard"
              className="brutalist-shadow-hover inline-block bg-foreground text-background font-mono text-sm font-bold px-6 py-3 border-2 border-foreground no-underline"
            >
              back to dashboard
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {dueReviews.kcs.map(kc => (
              <div key={kc.kc_id} className="brutalist-shadow bg-card border-2 border-foreground p-5">
                <div className="flex justify-between items-start gap-4">
                  <div className="min-w-0">
                    <div className="font-mono text-lg font-bold text-foreground tracking-tight mb-1">
                      {kc.kc_title}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {kc.topic_title} · every {kc.sm2_interval} day{kc.sm2_interval === 1 ? '' : 's'}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em] mt-3">
                      {kc.days_overdue > 0 ? `${kc.days_overdue}d overdue` : 'due today'}
                    </div>
                  </div>

                  <button
                    onClick={() => startReview(kc)}
                    disabled={startingKcId !== null}
                    className="brutalist-shadow-hover font-mono text-xs font-bold border-2 border-foreground px-4 py-3 bg-primary text-foreground cursor-pointer whitespace-nowrap disabled:opacity-60"
                  >
                    {startingKcId === kc.kc_id ? 'starting...' : 'review now →'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

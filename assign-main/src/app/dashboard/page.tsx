'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import type { Topic, ReviewDueResponse } from '@/lib/types'

interface Roadmap {
  id: string
  topic: string
  status: 'active' | 'completed'
  current_concept_index: number
  concepts: { title: string; status: string }[]
  learner_profile?: { _topic_id?: string }
  created_at: string
  last_studied: string
  total_minutes_estimated: number
  sources_hit: string[]
}

const MODES = [
  { label: 'trek',   emoji: '🗺️', tagline: 'learn it end to end.',      desc: 'Adaptive trek now runs through the B2C teaching loop with notes and progress tracking.',                         href: '/trek' },
  { label: 'spark',  emoji: '⚡',  tagline: 'stuck on one thing?',       desc: 'Drop in one topic. AI finds exactly what you don\'t know and fixes only that — fast.',                          href: '/spark'  },
  { label: 'recall', emoji: '🧠',  tagline: 'prove you know it.',        desc: 'Explain a topic from scratch. AI listens, then tells you exactly what broke down.',                              href: '/recall' },
  { label: 'build',  emoji: '🔨',  tagline: 'figure it out yourself.',   desc: 'Pair programmer that never writes code for you. It asks until you get there.',                                   href: '/build'  },
]

export default function Dashboard() {
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [reviewDue, setReviewDue] = useState<ReviewDueResponse>({ due_count: 0, kcs: [] })
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<{ email: string; id: string } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setLoading(false)
        router.replace('/login')
        return
      }
      setUser({ email: session.user.email || '', id: session.user.id })
      const res = await fetch(`/api/roadmap?userId=${session.user.id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      })
      const data = await res.json()
      setRoadmaps(data.roadmaps || [])

      try {
        const topicsRes = await fetch(`/api/b2c/topics/${session.user.id}`)
        if (topicsRes.ok) {
          const topicsData = await topicsRes.json()
          setTopics(topicsData || [])
        }
      } catch (e) {
        console.error('[dashboard topics]', e)
      }

      try {
        const reviewRes = await fetch(`/api/b2c/review/${session.user.id}`)
        if (reviewRes.ok) {
          const reviewData = await reviewRes.json()
          setReviewDue(reviewData || { due_count: 0, kcs: [] })
        }
      } catch (e) {
        console.error('[dashboard review due]', e)
      }

      setLoading(false)
    }
    load()
  }, [router])

  const signOut = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const deleteCourse = async (id: string) => {
    if (!confirm('delete this course?')) return
    setDeleting(id)
    await supabase.from('roadmaps').delete().eq('id', id)
    setRoadmaps(prev => prev.filter(r => r.id !== id))
    setDeleting(null)
  }

  const timeAgo = (date: string) => {
    const diff = new Date().getTime() - new Date(date).getTime()
    const hours = Math.floor(diff / 3600000)
    if (hours < 1) return 'just now'
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  return (
    <main className="min-h-screen bg-background text-foreground">

      {/* Nav */}
      <nav className="flex justify-between items-center px-10 py-5 border-b-2 border-foreground">
        <Link href="/" className="flex items-center gap-2 no-underline">
          <span className="w-2 h-2 rounded-full bg-primary inline-block" />
          <span className="font-mono text-lg font-medium text-foreground tracking-tight">assign</span>
        </Link>
        <div className="flex items-center gap-5">
          <a href="/progress" className="font-mono text-xs text-muted-foreground no-underline hover:text-primary transition-colors">
            progress
          </a>
          <a href="/notes" className="font-mono text-xs text-muted-foreground no-underline hover:text-primary transition-colors">
            notes
          </a>
          <span className="font-mono text-xs text-muted-foreground">{user?.email}</span>
          <button onClick={signOut} className="brutalist-shadow-hover font-mono text-xs border-2 border-foreground px-4 py-2 bg-background text-foreground cursor-pointer">
            sign out
          </button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-10 py-14">

        {/* Header */}
        <div className="mb-14">
          <h1 className="text-6xl leading-tight tracking-tight text-foreground" style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic' }}>
            what do you want<br />
            <span className="text-primary">to learn today?</span>
          </h1>
        </div>

        {reviewDue.due_count > 0 && (
          <section className="mb-14">
            <div className="brutalist-shadow bg-card border-2 border-foreground p-6">
              <div className="flex justify-between items-start gap-6 mb-5">
                <div>
                  <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.16em] mb-2">
                    review queue
                  </p>
                  <h2 className="font-mono text-2xl font-bold text-foreground tracking-tight">
                    {reviewDue.due_count} concepts ready for review
                  </h2>
                </div>
                <Link
                  href="/trek/review"
                  className="brutalist-shadow-hover font-mono text-xs font-bold border-2 border-foreground px-4 py-3 bg-primary text-foreground no-underline whitespace-nowrap"
                >
                  start review →
                </Link>
              </div>

              <div className="grid gap-2">
                {reviewDue.kcs.slice(0, 3).map(kc => (
                  <div
                    key={kc.kc_id}
                    className="border-2 border-foreground bg-background px-4 py-3 flex justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-bold text-foreground tracking-tight truncate">
                        {kc.kc_title}
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground mt-1">
                        {kc.topic_title}
                      </div>
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em] text-right whitespace-nowrap">
                      {kc.days_overdue > 0 ? `${kc.days_overdue}d overdue` : 'due today'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Mode cards */}
        <section className="mb-16">
          <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest mb-5">choose a mode</p>
          <div className="grid grid-cols-4 gap-4">
            {MODES.map(mode => (
              <Link key={mode.label} href={mode.href}
                className="brutalist-shadow brutalist-shadow-hover block border-2 border-foreground bg-card p-6 no-underline">
                <div className="text-3xl mb-4">{mode.emoji}</div>
                <div className="font-mono font-bold text-xl text-foreground mb-1 uppercase tracking-tight">{mode.label}</div>
                <div className="font-mono text-xs text-primary mb-3">{mode.tagline}</div>
                <div className="font-sans text-xs text-muted-foreground leading-relaxed">{mode.desc}</div>
              </Link>
            ))}
          </div>
        </section>

        {topics.length > 0 && (
          <section className="mb-16">
            <div className="flex justify-between items-center mb-5">
              <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest">adaptive topics</p>
              <Link href="/trek" className="font-mono text-xs text-foreground border-b border-foreground pb-px no-underline hover:text-primary transition-colors">
                + start adaptive trek
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {topics.map(topic => {
                const matchingRoadmap = roadmaps.find(
                  (roadmap) =>
                    roadmap.learner_profile?._topic_id === topic.id ||
                    roadmap.topic.toLowerCase() === topic.title.toLowerCase()
                )
                return (
                <div key={topic.id} className="brutalist-shadow bg-card border-2 border-foreground p-5">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="min-w-0">
                      <div className="font-mono font-bold text-base text-foreground tracking-tight mb-1">
                        {topic.title}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {topic.status} · {new Date(topic.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-wider border border-foreground px-2 py-1">
                      b2c
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <Link
                      href={matchingRoadmap ? `/trek?resume=${matchingRoadmap.id}` : '/trek'}
                      className="font-mono text-xs text-foreground border-2 border-foreground px-3 py-2 bg-background no-underline hover:bg-muted transition-colors"
                    >
                      open →
                    </Link>
                    <Link
                      href={`/progress?topic=${topic.id}`}
                      className="font-mono text-xs text-muted-foreground border-2 border-muted px-3 py-2 bg-background no-underline hover:text-foreground transition-colors"
                    >
                      progress
                    </Link>
                  </div>
                </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Courses */}
        <section>
          <div className="flex justify-between items-center mb-5">
            <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest">your trek courses</p>
            <Link href="/trek" className="font-mono text-xs text-foreground border-b border-foreground pb-px no-underline hover:text-primary transition-colors">
              + new course
            </Link>
          </div>

          {loading ? (
            <div className="py-20 text-center font-mono text-xs text-muted-foreground">loading...</div>

          ) : roadmaps.length === 0 ? (
            <div className="py-16 px-6 text-center border-2 border-dashed border-muted">
              <p className="font-mono text-sm text-muted-foreground mb-6">no courses yet — start your first trek</p>
              <Link href="/trek" className="brutalist-shadow brutalist-shadow-hover inline-block bg-foreground text-background font-mono text-sm font-bold px-7 py-3 border-2 border-foreground no-underline">
                start trek →
              </Link>
            </div>

          ) : (
            <div className="flex flex-col gap-3">
              {roadmaps.map(rm => {
                const done = rm.concepts?.filter(c => c.status === 'done').length || 0
                const total = rm.concepts?.length || 0
                const pct = total > 0 ? (done / total) * 100 : 0
                const currentConcept = rm.concepts?.[rm.current_concept_index]

                return (
                  <div key={rm.id} className="brutalist-shadow bg-card border-2 border-foreground p-6">
                    <div className="flex justify-between items-start mb-5">
                      <div className="flex-1 min-w-0 mr-4">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="font-mono font-bold text-lg text-foreground tracking-tight">{rm.topic}</span>
                          {rm.status === 'completed' && (
                            <span className="font-mono text-xs text-primary border border-primary px-2 py-0.5 uppercase tracking-wider">done</span>
                          )}
                        </div>
                        <span className="font-mono text-xs text-muted-foreground">
                          {currentConcept && rm.status !== 'completed'
                            ? `up next: ${currentConcept.title}`
                            : `${done} of ${total} concepts mastered`}
                          {' · '}last studied {timeAgo(rm.last_studied)}
                        </span>
                      </div>

                      <div className="flex gap-2 items-center flex-shrink-0">
                        <Link href={`/trek/materials?id=${rm.id}`}
                          className="font-mono text-xs text-foreground border-2 border-foreground px-3 py-2 bg-background no-underline hover:bg-muted transition-colors">
                          notes
                        </Link>
                        <button onClick={() => deleteCourse(rm.id)} disabled={deleting === rm.id}
                          className="font-mono text-xs text-muted-foreground border-2 border-muted px-3 py-2 bg-background cursor-pointer hover:text-red-500 transition-colors">
                          {deleting === rm.id ? '...' : 'delete'}
                        </button>
                        {rm.status !== 'completed' && (
                          <button onClick={() => router.push(`/trek?resume=${rm.id}`)}
                            className="brutalist-shadow brutalist-shadow-hover font-mono text-xs font-bold bg-primary text-foreground px-5 py-2 border-2 border-foreground cursor-pointer">
                            continue →
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="h-1.5 bg-muted border border-foreground overflow-hidden mb-2">
                      <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between font-mono text-xs text-muted-foreground">
                      <span>{done}/{total} mastered</span>
                      {rm.total_minutes_estimated > 0 && <span>~{rm.total_minutes_estimated} min total</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

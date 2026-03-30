'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface Roadmap {
  id: string
  topic: string
  status: 'active' | 'completed'
  current_concept_index: number
  concepts: { title: string; status: string }[]
  created_at: string
  last_studied: string
  total_minutes_estimated: number
  sources_hit: string[]
}

const MODES = [
  { label: 'trek',   emoji: '🗺️', tagline: 'learn it end to end.',      desc: 'AI builds you a full course, teaches concept by concept using Socratic dialogue, and tracks your progress.', href: '/trek'   },
  { label: 'spark',  emoji: '⚡',  tagline: 'stuck on one thing?',       desc: 'Drop in one topic. AI finds exactly what you don\'t know and fixes only that — fast.',                          href: '/spark'  },
  { label: 'recall', emoji: '🧠',  tagline: 'prove you know it.',        desc: 'Explain a topic from scratch. AI listens, then tells you exactly what broke down.',                              href: '/recall' },
  { label: 'build',  emoji: '🔨',  tagline: 'figure it out yourself.',   desc: 'Pair programmer that never writes code for you. It asks until you get there.',                                   href: '/build'  },
]

export default function Dashboard() {
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([])
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
        <a href="/" className="flex items-center gap-2 no-underline">
          <span className="w-2 h-2 rounded-full bg-primary inline-block" />
          <span className="font-mono text-lg font-medium text-foreground tracking-tight">assign</span>
        </a>
        <div className="flex items-center gap-5">
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

        {/* Mode cards */}
        <section className="mb-16">
          <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest mb-5">choose a mode</p>
          <div className="grid grid-cols-4 gap-4">
            {MODES.map(mode => (
              <a key={mode.label} href={mode.href}
                className="brutalist-shadow brutalist-shadow-hover block border-2 border-foreground bg-card p-6 no-underline">
                <div className="text-3xl mb-4">{mode.emoji}</div>
                <div className="font-mono font-bold text-xl text-foreground mb-1 uppercase tracking-tight">{mode.label}</div>
                <div className="font-mono text-xs text-primary mb-3">{mode.tagline}</div>
                <div className="font-sans text-xs text-muted-foreground leading-relaxed">{mode.desc}</div>
              </a>
            ))}
          </div>
        </section>

        {/* Courses */}
        <section>
          <div className="flex justify-between items-center mb-5">
            <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest">your trek courses</p>
            <a href="/trek" className="font-mono text-xs text-foreground border-b border-foreground pb-px no-underline hover:text-primary transition-colors">
              + new course
            </a>
          </div>

          {loading ? (
            <div className="py-20 text-center font-mono text-xs text-muted-foreground">loading...</div>

          ) : roadmaps.length === 0 ? (
            <div className="py-16 px-6 text-center border-2 border-dashed border-muted">
              <p className="font-mono text-sm text-muted-foreground mb-6">no courses yet — start your first trek</p>
              <a href="/trek" className="brutalist-shadow brutalist-shadow-hover inline-block bg-foreground text-background font-mono text-sm font-bold px-7 py-3 border-2 border-foreground no-underline">
                start trek →
              </a>
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
                        <a href={`/trek/materials?id=${rm.id}`}
                          className="font-mono text-xs text-foreground border-2 border-foreground px-3 py-2 bg-background no-underline hover:bg-muted transition-colors">
                          notes
                        </a>
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

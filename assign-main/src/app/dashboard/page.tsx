'use client'

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
  {
    label: 'trek',
    emoji: '🗺️',
    tagline: 'learn it end to end.',
    desc: 'AI builds you a full course, teaches concept by concept using Socratic dialogue, and tracks your progress.',
    href: '/trek',
    accent: '#FFE000',
  },
  {
    label: 'spark',
    emoji: '⚡',
    tagline: 'stuck on one thing?',
    desc: 'Drop in one topic. AI finds exactly what you don\'t know and fixes only that — fast.',
    href: '/spark',
    accent: '#FFE000',
  },
  {
    label: 'recall',
    emoji: '🧠',
    tagline: 'prove you know it.',
    desc: 'Explain a topic from scratch. AI listens, then tells you exactly what broke down.',
    href: '/recall',
    accent: '#FFE000',
  },
  {
    label: 'build',
    emoji: '🔨',
    tagline: 'figure it out yourself.',
    desc: 'Pair programmer that never writes code for you. It asks until you get there.',
    href: '/build',
    accent: '#FFE000',
  },
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
      if (!session) { router.push('/'); return }
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
    router.push('/')
  }

  const deleteCourse = async (id: string) => {
    if (!confirm('delete this course?')) return
    setDeleting(id)
    await supabase.from('roadmaps').delete().eq('id', id)
    setRoadmaps(prev => prev.filter(r => r.id !== id))
    setDeleting(null)
  }

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const hours = Math.floor(diff / 3600000)
    if (hours < 1) return 'just now'
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a0a', color: '#f5f5f5' }}>
      <style>{`
        .mode-card { transition: transform 0.15s ease, box-shadow 0.15s ease; cursor: pointer; }
        .mode-card:hover { transform: translate(-3px, -3px); box-shadow: 6px 6px 0px #FFE000 !important; }
        .course-card { transition: transform 0.15s ease, box-shadow 0.15s ease; }
        .course-card:hover { transform: translate(-2px, -2px); box-shadow: 5px 5px 0px #FFE000 !important; }
        .btn-primary { transition: transform 0.15s, box-shadow 0.15s; }
        .btn-primary:hover { transform: translate(-2px, -2px); box-shadow: 5px 5px 0px #FFE000 !important; }
        .btn-ghost:hover { color: #FFE000 !important; }
      `}</style>

      {/* Nav */}
      <nav style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '20px 40px', borderBottom: '1px solid #222',
      }}>
        <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FFE000', display: 'inline-block' }} />
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '18px', fontWeight: 500, color: '#f5f5f5', letterSpacing: '-0.3px' }}>assign</span>
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '11px', color: '#666' }}>{user?.email}</span>
          <button onClick={signOut} className="btn-ghost" style={{
            background: 'none', border: '1px solid #333', borderRadius: '4px',
            padding: '7px 16px', fontFamily: 'DM Mono, monospace', fontSize: '11px',
            color: '#999', cursor: 'pointer',
          }}>sign out</button>
        </div>
      </nav>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '56px 40px' }}>

        {/* Header */}
        <div style={{ marginBottom: '56px' }}>
          <h1 style={{
            fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: '42px',
            letterSpacing: '-1.5px', lineHeight: 1.1, margin: 0,
            color: '#f5f5f5',
          }}>
            what do you want<br />
            <span style={{ color: '#FFE000' }}>to learn today?</span>
          </h1>
        </div>

        {/* Mode cards */}
        <section style={{ marginBottom: '72px' }}>
          <p style={{
            fontFamily: 'DM Mono, monospace', fontSize: '11px', color: '#555',
            marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '0.1em',
          }}>choose a mode</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
            {MODES.map(mode => (
              <a key={mode.label} href={mode.href} className="mode-card" style={{
                display: 'block', background: '#111', border: '1.5px solid #222',
                borderRadius: '8px', padding: '24px 20px', textDecoration: 'none',
                boxShadow: '4px 4px 0px #333',
              }}>
                <div style={{ fontSize: '28px', marginBottom: '12px' }}>{mode.emoji}</div>
                <div style={{
                  fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: '20px',
                  color: '#f5f5f5', marginBottom: '4px', letterSpacing: '-0.5px',
                }}>{mode.label}</div>
                <div style={{
                  fontFamily: 'DM Mono, monospace', fontSize: '11px',
                  color: '#FFE000', marginBottom: '12px',
                }}>{mode.tagline}</div>
                <div style={{
                  fontFamily: 'Inter, sans-serif', fontSize: '12px',
                  color: '#777', lineHeight: 1.6,
                }}>{mode.desc}</div>
              </a>
            ))}
          </div>
        </section>

        {/* Courses */}
        <section>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: '20px',
          }}>
            <p style={{
              fontFamily: 'DM Mono, monospace', fontSize: '11px', color: '#555',
              textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0,
            }}>your trek courses</p>
            <a href="/trek" style={{
              fontFamily: 'DM Mono, monospace', fontSize: '11px', color: '#FFE000',
              textDecoration: 'none', border: '1px solid #333', borderRadius: '4px',
              padding: '6px 14px',
            }}>+ new course</a>
          </div>

          {loading ? (
            <div style={{
              padding: '80px 0', textAlign: 'center',
              fontFamily: 'DM Mono, monospace', fontSize: '12px', color: '#444',
            }}>loading...</div>

          ) : roadmaps.length === 0 ? (
            <div style={{
              padding: '60px 24px', textAlign: 'center',
              border: '1.5px dashed #222', borderRadius: '8px',
            }}>
              <p style={{
                fontFamily: 'DM Mono, monospace', fontSize: '13px',
                color: '#555', marginBottom: '24px',
              }}>no courses yet — start your first trek</p>
              <a href="/trek" className="btn-primary" style={{
                display: 'inline-block', background: '#FFE000', color: '#0a0a0a',
                fontFamily: 'DM Mono, monospace', fontSize: '13px', fontWeight: 600,
                padding: '12px 28px', border: 'none', borderRadius: '6px',
                textDecoration: 'none', boxShadow: '4px 4px 0px #333',
              }}>start trek →</a>
            </div>

          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {roadmaps.map(rm => {
                const done = rm.concepts?.filter(c => c.status === 'done').length || 0
                const total = rm.concepts?.length || 0
                const pct = total > 0 ? (done / total) * 100 : 0
                const currentConcept = rm.concepts?.[rm.current_concept_index]

                return (
                  <div key={rm.id} className="course-card" style={{
                    background: '#111', border: '1.5px solid #222',
                    borderRadius: '8px', padding: '24px',
                    boxShadow: '4px 4px 0px #1a1a1a',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                      <div style={{ flex: 1, minWidth: 0, marginRight: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                          <span style={{
                            fontFamily: 'Inter, sans-serif', fontWeight: 700,
                            fontSize: '18px', color: '#f5f5f5', letterSpacing: '-0.4px',
                          }}>{rm.topic}</span>
                          {rm.status === 'completed' && (
                            <span style={{
                              fontFamily: 'DM Mono, monospace', fontSize: '9px',
                              color: '#FFE000', border: '1px solid #FFE000',
                              borderRadius: '3px', padding: '2px 8px',
                              textTransform: 'uppercase', letterSpacing: '0.08em',
                            }}>done</span>
                          )}
                        </div>
                        <span style={{
                          fontFamily: 'DM Mono, monospace', fontSize: '11px', color: '#555',
                        }}>
                          {currentConcept && rm.status !== 'completed'
                            ? `up next: ${currentConcept.title}`
                            : `${done} of ${total} concepts mastered`}
                          {' · '}last studied {timeAgo(rm.last_studied)}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                        <a href={`/trek/materials?id=${rm.id}`} style={{
                          fontFamily: 'DM Mono, monospace', fontSize: '11px', color: '#666',
                          textDecoration: 'none', border: '1px solid #2a2a2a',
                          borderRadius: '4px', padding: '7px 14px', background: '#0a0a0a',
                        }}>notes</a>
                        <button onClick={() => deleteCourse(rm.id)} disabled={deleting === rm.id}
                          className="btn-ghost" style={{
                            background: 'none', border: '1px solid #2a2a2a',
                            borderRadius: '4px', padding: '7px 14px',
                            fontFamily: 'DM Mono, monospace', fontSize: '11px',
                            color: '#555', cursor: 'pointer',
                          }}>
                          {deleting === rm.id ? '...' : 'delete'}
                        </button>
                        {rm.status !== 'completed' && (
                          <button onClick={() => router.push(`/trek?resume=${rm.id}`)}
                            className="btn-primary" style={{
                              background: '#FFE000', color: '#0a0a0a',
                              fontFamily: 'DM Mono, monospace', fontSize: '11px',
                              fontWeight: 700, padding: '8px 18px',
                              border: 'none', borderRadius: '4px', cursor: 'pointer',
                              boxShadow: '3px 3px 0px #333',
                            }}>continue →</button>
                        )}
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div style={{
                      height: '4px', background: '#1e1e1e',
                      borderRadius: '2px', overflow: 'hidden', marginBottom: '8px',
                    }}>
                      <div style={{
                        width: `${pct}%`, height: '100%',
                        background: '#FFE000', borderRadius: '2px',
                        transition: 'width 0.6s ease',
                      }} />
                    </div>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      fontFamily: 'DM Mono, monospace', fontSize: '10px', color: '#444',
                    }}>
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

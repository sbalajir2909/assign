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

      const res = await fetch(`/api/roadmap?userId=${session.user.id}`)
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

  const sourceColors: Record<string, string> = {
    wikipedia: '#FFE500', wikidata: '#00FF87', openAlex: '#A855F7',
    stackOverflow: '#FF6B00', github: '#fff', npm: '#CB3837', devdocs: '#3D9BE9'
  }

  return (
    <main style={{ minHeight: '100vh', background: '#080808', color: '#fff', fontFamily: "'Syne', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .grain { position: fixed; inset: 0; pointer-events: none; z-index: 0; opacity: 0.025; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E"); }
        .roadmap-card { background: #0e0e0e; border: 1px solid #1a1a1a; border-radius: 16px; padding: 20px; transition: border-color 0.2s; }
        .roadmap-card:hover { border-color: #333; }
        .progress-bar { background: #1a1a1a; border-radius: 4px; height: 4px; }
        .resume-btn { background: #00FF87; color: #000; font-weight: 700; font-size: 13px; padding: 10px 18px; border-radius: 10px; border: none; cursor: pointer; font-family: 'Syne', sans-serif; transition: opacity 0.15s; }
        .resume-btn:hover { opacity: 0.85; }
        .completed-badge { font-size: 10px; font-family: 'DM Mono', monospace; color: #00FF87; background: #00FF8715; padding: 3px 8px; border-radius: 6px; }
        .mode-card { background: #0e0e0e; border: 1px solid #1a1a1a; border-radius: 14px; padding: 20px; cursor: pointer; transition: all 0.2s; text-decoration: none; display: block; }
        .mode-card:hover { border-color: #333; transform: translateY(-1px); }
        .sign-out-btn { background: none; border: 1px solid #222; border-radius: 10px; color: #444; padding: 8px 16px; cursor: pointer; font-size: 12px; font-family: 'DM Mono', monospace; transition: color 0.15s; }
        .sign-out-btn:hover { color: #888; }
        .notes-link { background: none; border: 1px solid #222; border-radius: 10px; color: #444; padding: 8px 14px; font-size: 12px; font-family: 'DM Mono', monospace; text-decoration: none; transition: color 0.15s; }
        .notes-link:hover { color: #888; }
      `}</style>

      <div className="grain" />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '900px', margin: '0 auto', padding: '40px 24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '48px' }}>
          <div>
            <div style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '4px' }}>assign</div>
            <div style={{ fontSize: '13px', color: '#444', fontFamily: "'DM Mono', monospace" }}>{user?.email}</div>
          </div>
          <button onClick={signOut} className="sign-out-btn">sign out</button>
        </div>

        {/* Mode cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '48px' }}>
          {[
            { label: 'spark', emoji: '⚡', color: '#FFE500', href: '/spark', desc: 'ask anything' },
            { label: 'trek', emoji: '🗺️', color: '#00FF87', href: '/trek', desc: 'full courses' },
            { label: 'recall', emoji: '🔁', color: '#FF2D78', href: '/recall', desc: 'spaced review' },
            { label: 'build', emoji: '🔨', color: '#FF6B00', href: '/build', desc: 'make something' },
          ].map(mode => (
            <a key={mode.label} href={mode.href} className="mode-card">
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>{mode.emoji}</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: mode.color, marginBottom: '2px' }}>{mode.label}</div>
              <div style={{ fontSize: '11px', color: '#444', fontFamily: "'DM Mono', monospace" }}>{mode.desc}</div>
            </a>
          ))}
        </div>

        {/* Courses header */}
        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '16px', fontWeight: 700 }}>your courses</div>
          <a href="/trek" style={{ fontSize: '12px', color: '#444', fontFamily: "'DM Mono', monospace", textDecoration: 'none' }}>+ new course</a>
        </div>

        {/* Course list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#333', fontFamily: "'DM Mono', monospace", fontSize: '13px' }}>
            loading...
          </div>
        ) : roadmaps.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', border: '1px dashed #1a1a1a', borderRadius: '16px' }}>
            <div style={{ fontSize: '13px', color: '#333', fontFamily: "'DM Mono', monospace", marginBottom: '16px' }}>no courses yet</div>
            <a href="/trek" style={{ background: '#00FF87', color: '#000', fontWeight: 700, padding: '12px 24px', borderRadius: '12px', textDecoration: 'none', fontSize: '13px' }}>
              start your first trek →
            </a>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {roadmaps.map(rm => {
              const done = rm.concepts?.filter(c => c.status === 'done').length || 0
              const total = rm.concepts?.length || 0
              const pct = total > 0 ? (done / total) * 100 : 0
              const currentConcept = rm.concepts?.[rm.current_concept_index]

              return (
                <div key={rm.id} className="roadmap-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                    <div style={{ flex: 1, minWidth: 0, marginRight: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <div style={{ fontSize: '16px', fontWeight: 700 }}>{rm.topic}</div>
                        {rm.status === 'completed' && <span className="completed-badge">completed</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: '#444', fontFamily: "'DM Mono', monospace" }}>
                        {currentConcept && rm.status !== 'completed'
                          ? `up next: ${currentConcept.title}`
                          : `${done} of ${total} concepts`}
                        {' · '}last studied {timeAgo(rm.last_studied)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                      <a href={`/trek/materials?id=${rm.id}`} className="notes-link">notes</a>
                      <button
                        onClick={() => deleteCourse(rm.id)}
                        disabled={deleting === rm.id}
                        style={{ background: 'none', border: '1px solid #222', borderRadius: '10px', color: '#444', padding: '8px 12px', cursor: 'pointer', fontSize: '12px', fontFamily: "'DM Mono', monospace", transition: 'color 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#ff4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#444')}
                      >
                        {deleting === rm.id ? '...' : 'delete'}
                      </button>
                      {rm.status !== 'completed' && (
                        <button className="resume-btn" onClick={() => router.push(`/trek?resume=${rm.id}`)}>
                          continue →
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="progress-bar">
                    <div style={{
                      width: `${pct}%`,
                      height: '4px',
                      background: pct === 100 ? '#00FF87' : '#00FF8766',
                      borderRadius: '4px',
                      transition: 'width 0.5s ease'
                    }} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                    <div style={{ fontSize: '11px', color: '#333', fontFamily: "'DM Mono', monospace" }}>
                      {done}/{total} mastered
                      {rm.total_minutes_estimated > 0 && ` · ~${rm.total_minutes_estimated} min total`}
                    </div>
                    <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                      {(rm.sources_hit || []).map((s: string) => (
                        <span
                          key={s}
                          title={s}
                          style={{
                            width: '5px', height: '5px', borderRadius: '50%',
                            background: sourceColors[s] || '#333',
                            display: 'inline-block'
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
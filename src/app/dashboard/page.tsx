'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Concept {
  id: number
  title: string
  status: 'locked' | 'current' | 'done'
}

interface Roadmap {
  id: string
  topic: string
  concepts: Concept[]
  created_at: string
  last_studied: string
}

export default function Dashboard() {
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const loadRoadmaps = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      const { data } = await supabase
        .from('roadmaps')
        .select('*')
        .order('last_studied', { ascending: false })

      if (data) setRoadmaps(data)
      setLoading(false)
    }
    loadRoadmaps()
  }, [router])

  const deleteRoadmap = async (id: string) => {
    await supabase.from('roadmaps').delete().eq('id', id)
    setRoadmaps(prev => prev.filter(r => r.id !== id))
  }

  const getMastered = (concepts: Concept[]) => concepts.filter(c => c.status === 'done').length
  const getProgress = (concepts: Concept[]) => concepts.length === 0 ? 0 : Math.round((getMastered(concepts) / concepts.length) * 100)

  const getStatusColor = (progress: number) => {
    if (progress === 100) return '#00FF87'
    if (progress > 0) return '#FFE500'
    return '#333'
  }

  const getStatusLabel = (progress: number) => {
    if (progress === 100) return 'MASTERED'
    if (progress > 0) return 'IN PROGRESS'
    return 'NOT STARTED'
  }

  return (
    <main style={{ minHeight: '100vh', background: '#080808', color: '#fff', fontFamily: "'Syne', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .grain { position: fixed; inset: 0; pointer-events: none; z-index: 0; opacity: 0.025; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E"); }
        .roadmap-card { background: #111; border: 1px solid #1a1a1a; border-radius: 20px; padding: 24px; transition: border-color 0.2s, transform 0.2s; }
        .roadmap-card:hover { border-color: #2a2a2a; transform: translateY(-2px); }
        .concept-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-family: 'DM Mono', monospace; margin: 3px; }
        .delete-btn { background: none; border: 1px solid #222; color: #444; font-size: 11px; padding: 6px 12px; border-radius: 8px; cursor: pointer; font-family: 'Syne', sans-serif; transition: all 0.15s; }
        .delete-btn:hover { border-color: #FF2D78; color: #FF2D78; }
        .continue-btn { background: #00FF87; border: none; color: #000; font-size: 12px; font-weight: 700; padding: 8px 16px; border-radius: 10px; cursor: pointer; font-family: 'Syne', sans-serif; transition: opacity 0.15s; }
        .continue-btn:hover { opacity: 0.85; }
        .progress-bar { height: 4px; background: #1a1a1a; border-radius: 4px; overflow: hidden; margin: 12px 0; }
        .empty-state { text-align: center; padding: 80px 24px; }
        .start-btn { background: #FFE500; border: none; color: #000; font-size: 14px; font-weight: 800; padding: 14px 28px; border-radius: 14px; cursor: pointer; font-family: 'Syne', sans-serif; letter-spacing: -0.3px; transition: opacity 0.15s; margin-top: 24px; display: inline-block; }
        .start-btn:hover { opacity: 0.85; }
      `}</style>

      <div className="grain" />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '860px', margin: '0 auto', padding: '40px 24px' }}>
        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '48px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <a href="/" style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.5px', color: '#fff', textDecoration: 'none' }}>assign</a>
            <span style={{ fontSize: '11px', fontFamily: "'DM Mono', monospace", color: '#444', letterSpacing: '0.05em' }}>/ dashboard</span>
          </div>
          <a href="/trek" style={{ background: '#00FF87', color: '#000', fontSize: '12px', fontWeight: 700, padding: '8px 16px', borderRadius: '10px', textDecoration: 'none', fontFamily: "'Syne', sans-serif" }}>
            + new trek
          </a>
        </nav>

        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 800, letterSpacing: '-1px', marginBottom: '6px' }}>your learning</h1>
          <p style={{ fontSize: '14px', color: '#444' }}>
            {loading ? 'loading...' : roadmaps.length === 0 ? 'no roadmaps yet' : `${roadmaps.length} roadmap${roadmaps.length > 1 ? 's' : ''} · ${roadmaps.reduce((acc, r) => acc + getMastered(r.concepts), 0)} concepts mastered`}
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px', color: '#333', fontFamily: "'DM Mono', monospace", fontSize: '13px' }}>loading your roadmaps...</div>
        ) : roadmaps.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🗺️</div>
            <p style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>no roadmaps yet</p>
            <p style={{ fontSize: '14px', color: '#444', maxWidth: '300px', margin: '0 auto' }}>
              start a trek and approve a roadmap to see your progress here
            </p>
            <button className="start-btn" onClick={() => router.push('/trek')}>
              start your first trek →
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '16px' }}>
            {roadmaps.map(roadmap => {
              const progress = getProgress(roadmap.concepts)
              const mastered = getMastered(roadmap.concepts)
              const statusColor = getStatusColor(progress)

              return (
                <div key={roadmap.id} className="roadmap-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                        <h2 style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.5px' }}>{roadmap.topic}</h2>
                        <span style={{ fontSize: '10px', fontFamily: "'DM Mono', monospace", color: statusColor, background: statusColor + '15', padding: '2px 8px', borderRadius: '20px', letterSpacing: '0.05em' }}>
                          {getStatusLabel(progress)}
                        </span>
                      </div>
                      <p style={{ fontSize: '12px', color: '#444', fontFamily: "'DM Mono', monospace" }}>
                        {mastered} of {roadmap.concepts.length} concepts mastered · started {new Date(roadmap.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      {progress < 100 && (
                        <button className="continue-btn" onClick={() => router.push('/trek')}>continue →</button>
                      )}
                      <button className="delete-btn" onClick={() => deleteRoadmap(roadmap.id)}>remove</button>
                    </div>
                  </div>

                  <div className="progress-bar">
                    <div style={{ height: '100%', background: statusColor, width: `${progress}%`, borderRadius: '4px', transition: 'width 0.5s ease' }} />
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: '8px' }}>
                    {roadmap.concepts.map(concept => (
                      <span key={concept.id} className="concept-pill" style={{
                        background: concept.status === 'done' ? '#00FF8715' : '#1a1a1a',
                        color: concept.status === 'done' ? '#00FF87' : concept.status === 'current' ? '#FFE500' : '#444',
                        border: `1px solid ${concept.status === 'done' ? '#00FF8730' : concept.status === 'current' ? '#FFE50030' : '#222'}`,
                      }}>
                        {concept.status === 'done' ? '✓' : concept.status === 'current' ? '→' : '○'} {concept.title}
                      </span>
                    ))}
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

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
  { label: 'trek',   desc: 'full courses',   href: '/trek'   },
  { label: 'spark',  desc: 'quick prep',     href: '/spark'  },
  { label: 'recall', desc: 'spaced review',  href: '/recall' },
  { label: 'build',  desc: 'pair program',   href: '/build'  },
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
    const diff = Date.now() - new Date(date).getTime()
    const hours = Math.floor(diff / 3600000)
    if (hours < 1) return 'just now'
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--background)' }}>
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Nav */}
        <nav style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '48px',
          paddingBottom: '24px',
          borderBottom: '2px solid var(--border)',
        }}>
          <span style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '28px',
            letterSpacing: '-0.5px',
            color: 'var(--foreground)',
          }}>
            assign
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--muted-foreground)',
            }}>
              {user?.email}
            </span>
            <button
              onClick={signOut}
              style={{
                background: 'none',
                border: '1.5px solid var(--border)',
                borderRadius: '4px',
                padding: '6px 14px',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--foreground)',
                cursor: 'pointer',
                transition: 'box-shadow 0.15s, transform 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = '2px 2px 0px 0px hsl(0 0% 10%)'
                e.currentTarget.style.transform = 'translate(-1px, -1px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = 'none'
                e.currentTarget.style.transform = 'none'
              }}
            >
              sign out
            </button>
          </div>
        </nav>

        {/* Mode cards */}
        <section style={{ marginBottom: '52px' }}>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--muted-foreground)',
            marginBottom: '12px',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}>
            modes
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '10px',
          }}>
            {MODES.map(mode => (
              <a
                key={mode.label}
                href={mode.href}
                className="brutalist-shadow-hover"
                style={{
                  display: 'block',
                  background: 'var(--card)',
                  border: '2px solid var(--border)',
                  borderRadius: '4px',
                  padding: '18px 16px',
                  textDecoration: 'none',
                  boxShadow: '4px 4px 0px 0px hsl(0 0% 10%)',
                }}
              >
                <div style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: '20px',
                  color: 'var(--foreground)',
                  marginBottom: '4px',
                  letterSpacing: '-0.3px',
                }}>
                  {mode.label}
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'var(--muted-foreground)',
                }}>
                  {mode.desc}
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* Courses */}
        <section>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}>
            <p style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--muted-foreground)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              your courses
            </p>
            <a
              href="/trek"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--foreground)',
                textDecoration: 'none',
                borderBottom: '1px solid var(--border)',
                paddingBottom: '1px',
              }}
            >
              + new course
            </a>
          </div>

          {loading ? (
            <div style={{
              padding: '60px 0',
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: 'var(--muted-foreground)',
            }}>
              loading...
            </div>

          ) : roadmaps.length === 0 ? (
            <div style={{
              padding: '60px 24px',
              textAlign: 'center',
              border: '2px dashed var(--muted)',
              borderRadius: '4px',
            }}>
              <p style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                color: 'var(--muted-foreground)',
                marginBottom: '20px',
              }}>
                no courses yet
              </p>
              <a
                href="/trek"
                className="brutalist-shadow-hover"
                style={{
                  display: 'inline-block',
                  background: 'var(--foreground)',
                  color: 'var(--background)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  fontWeight: 500,
                  padding: '12px 24px',
                  border: '2px solid var(--border)',
                  borderRadius: '4px',
                  textDecoration: 'none',
                  boxShadow: '4px 4px 0px 0px hsl(0 0% 10%)',
                }}
              >
                start your first trek →
              </a>
            </div>

          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {roadmaps.map(rm => {
                const done = rm.concepts?.filter(c => c.status === 'done').length || 0
                const total = rm.concepts?.length || 0
                const pct = total > 0 ? (done / total) * 100 : 0
                const currentConcept = rm.concepts?.[rm.current_concept_index]

                return (
                  <div
                    key={rm.id}
                    style={{
                      background: 'var(--card)',
                      border: '2px solid var(--border)',
                      borderRadius: '4px',
                      padding: '20px',
                      boxShadow: '4px 4px 0px 0px hsl(0 0% 10%)',
                    }}
                  >
                    {/* Top row */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '16px',
                    }}>
                      <div style={{ flex: 1, minWidth: 0, marginRight: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                          <span style={{
                            fontFamily: 'var(--font-serif)',
                            fontSize: '19px',
                            color: 'var(--foreground)',
                            letterSpacing: '-0.3px',
                          }}>
                            {rm.topic}
                          </span>
                          {rm.status === 'completed' && (
                            <span style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '9px',
                              color: 'var(--foreground)',
                              background: 'var(--muted)',
                              border: '1px solid var(--border)',
                              borderRadius: '2px',
                              padding: '2px 7px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                            }}>
                              done
                            </span>
                          )}
                        </div>
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          color: 'var(--muted-foreground)',
                        }}>
                          {currentConcept && rm.status !== 'completed'
                            ? `up next: ${currentConcept.title}`
                            : `${done} of ${total} concepts`}
                          {' · '}last studied {timeAgo(rm.last_studied)}
                        </span>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                        <a
                          href={`/trek/materials?id=${rm.id}`}
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '11px',
                            color: 'var(--foreground)',
                            textDecoration: 'none',
                            border: '1.5px solid var(--border)',
                            borderRadius: '4px',
                            padding: '6px 12px',
                            background: 'var(--background)',
                          }}
                        >
                          notes
                        </a>
                        <button
                          onClick={() => deleteCourse(rm.id)}
                          disabled={deleting === rm.id}
                          style={{
                            background: 'none',
                            border: '1.5px solid var(--border)',
                            borderRadius: '4px',
                            padding: '6px 12px',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '11px',
                            color: 'var(--muted-foreground)',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={e => e.currentTarget.style.color = 'hsl(0 70% 45%)'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--muted-foreground)'}
                        >
                          {deleting === rm.id ? '...' : 'delete'}
                        </button>
                        {rm.status !== 'completed' && (
                          <button
                            onClick={() => router.push(`/trek?resume=${rm.id}`)}
                            className="brutalist-shadow-hover"
                            style={{
                              background: 'var(--foreground)',
                              color: 'var(--background)',
                              fontFamily: 'var(--font-mono)',
                              fontSize: '11px',
                              fontWeight: 500,
                              padding: '7px 16px',
                              border: '2px solid var(--border)',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              boxShadow: '3px 3px 0px 0px hsl(0 0% 10%)',
                            }}
                          >
                            continue →
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div style={{
                      height: '5px',
                      background: 'var(--muted)',
                      border: '1px solid var(--border)',
                      borderRadius: '2px',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: 'var(--foreground)',
                        borderRadius: '2px',
                        transition: 'width 0.5s ease',
                      }} />
                    </div>

                    {/* Bottom row */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: '8px',
                    }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        color: 'var(--muted-foreground)',
                      }}>
                        {done}/{total} mastered
                        {rm.total_minutes_estimated > 0 && ` · ~${rm.total_minutes_estimated} min`}
                      </span>
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

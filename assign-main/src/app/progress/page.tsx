'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import FlagBadge from '@/components/FlagBadge'
import type { KCProgress, Topic, FlagType } from '@/lib/types'

const B2C_API = '/api/b2c'

function BktBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = pct >= 65 ? '#4ade80' : pct >= 40 ? '#facc15' : '#ff6b6b'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, transition: 'width 0.5s ease' }} />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color, flexShrink: 0, minWidth: '32px', textAlign: 'right' }}>
        {pct}%
      </span>
    </div>
  )
}

function ProgressPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [topics, setTopics] = useState<Topic[]>([])
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null)
  const [progress, setProgress] = useState<KCProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')

  const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' }
  const serif: React.CSSProperties = { fontFamily: 'var(--font-serif)' }

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      const uid = session.user.id
      setUserId(uid)

      try {
        const res = await fetch(`${B2C_API}/topics/${uid}`)
        if (res.ok) {
          const data: Topic[] = await res.json()
          setTopics(data)
          const paramTopicId = searchParams.get('topic')
          const first = paramTopicId
            ? data.find(topic => topic.id === paramTopicId) || data[0]
            : data[0]
          if (first) {
            setSelectedTopic(first)
            await loadProgress(uid, first.id)
          }
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [router, searchParams])

  const loadProgress = async (uid: string, topicId: string) => {
    try {
      const res = await fetch(`${B2C_API}/progress/${uid}/${topicId}`)
      if (res.ok) {
        const data: KCProgress[] = await res.json()
        setProgress(data)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const selectTopic = async (topic: Topic) => {
    setSelectedTopic(topic)
    setProgress([])
    await loadProgress(userId, topic.id)
  }

  const masteredCount = progress.filter(item => item.status === 'mastered').length
  const avgMastery = progress.length > 0
    ? progress.reduce((sum, item) => sum + item.p_learned, 0) / progress.length
    : 0

  return (
    <main style={{ minHeight: '100vh', background: 'var(--background)', color: 'var(--foreground)' }}>
      <style>{`
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--muted);border-radius:2px}
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 28px', borderBottom: '2px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <span style={{ ...serif, fontSize: '22px', letterSpacing: '-0.5px' }}>assign</span>
          </Link>
          <span style={{ ...mono, fontSize: '11px', border: '1.5px solid var(--border)', borderRadius: '4px', padding: '3px 8px' }}>
            progress
          </span>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <a href="/notes" style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)', textDecoration: 'none' }}>notes</a>
          <a href="/dashboard" style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)', textDecoration: 'none' }}>← dashboard</a>
        </div>
      </div>

      {loading ? (
        <div style={{ ...mono, fontSize: '13px', color: 'var(--muted-foreground)', textAlign: 'center', paddingTop: '80px' }}>
          loading progress...
        </div>
      ) : topics.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: '80px', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
          <p style={{ ...mono, fontSize: '13px', color: 'var(--muted-foreground)' }}>no topics started yet</p>
          <Link
            href="/trek"
            style={{ ...mono, fontSize: '12px', color: 'var(--foreground)', border: '2px solid var(--border)', borderRadius: '4px', padding: '8px 16px', textDecoration: 'none', boxShadow: '3px 3px 0 0 hsl(0 0% 10%)' }}
          >
            start learning →
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', maxHeight: 'calc(100vh - 65px)' }}>
          <div style={{ width: '220px', flexShrink: 0, borderRight: '2px solid var(--border)', overflowY: 'auto', padding: '16px' }}>
            <div style={{ ...mono, fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '12px' }}>
              topics
            </div>
            {topics.map(topic => (
              <button
                key={topic.id}
                onClick={() => selectTopic(topic)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: selectedTopic?.id === topic.id ? 'var(--card)' : 'transparent',
                  border: `2px solid ${selectedTopic?.id === topic.id ? 'var(--border)' : 'transparent'}`,
                  borderRadius: '4px',
                  padding: '8px 10px',
                  cursor: 'pointer',
                  color: 'var(--foreground)',
                  fontSize: '13px',
                  fontWeight: selectedTopic?.id === topic.id ? 600 : 400,
                  marginBottom: '4px',
                  boxShadow: selectedTopic?.id === topic.id ? '3px 3px 0 0 hsl(0 0% 10%)' : 'none',
                }}
              >
                {topic.title}
              </button>
            ))}

            <Link
              href="/trek"
              style={{
                ...mono,
                display: 'block',
                fontSize: '11px',
                color: 'var(--muted-foreground)',
                textDecoration: 'none',
                marginTop: '12px',
                padding: '6px 10px',
                border: '1.5px dashed var(--border)',
                borderRadius: '4px',
                textAlign: 'center',
              }}
            >
              + new topic
            </Link>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
            {selectedTopic && (
              <div style={{ maxWidth: '680px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 700, letterSpacing: '-0.4px' }}>
                    {selectedTopic.title}
                  </h2>
                  <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
                    <span style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)' }}>
                      {masteredCount}/{progress.length} mastered
                    </span>
                    <span style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)' }}>
                      avg mastery: {Math.round(avgMastery * 100)}%
                    </span>
                  </div>
                </div>

                {progress.length > 0 && (
                  <div>
                    <div style={{ ...mono, fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '6px' }}>
                      overall progress
                    </div>
                    <div style={{ height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.round((masteredCount / progress.length) * 100)}%`,
                          background: '#4ade80',
                          transition: 'width 0.6s ease',
                        }}
                      />
                    </div>
                  </div>
                )}

                {progress.length === 0 ? (
                  <p style={{ ...mono, fontSize: '13px', color: 'var(--muted-foreground)' }}>
                    no KC data yet — start your trek to see progress
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {progress.map((item, index) => (
                      <div
                        key={item.id}
                        style={{
                          background: 'var(--card)',
                          border: '2px solid var(--border)',
                          borderRadius: '4px',
                          padding: '14px 16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          boxShadow: '3px 3px 0 0 hsl(0 0% 10%)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                            <span style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)', flexShrink: 0 }}>
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <span style={{ fontSize: '14px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              KC {item.kc_id.slice(0, 8)}
                            </span>
                            {item.flag_type && <FlagBadge flagType={item.flag_type as FlagType} size="sm" />}
                          </div>
                          <span
                            style={{
                              ...mono,
                              fontSize: '10px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                              flexShrink: 0,
                              color: item.status === 'mastered' ? '#4ade80' : item.status === 'force_advanced' ? '#facc15' : 'var(--muted-foreground)',
                            }}
                          >
                            {item.status}
                          </span>
                        </div>
                        <BktBar value={item.p_learned} />
                        <div style={{ display: 'flex', gap: '16px' }}>
                          <span style={{ ...mono, fontSize: '10px', color: 'var(--muted-foreground)' }}>
                            attempts: {item.attempt_count}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <a
                  href={`/trek/${selectedTopic.id}`}
                  style={{
                    ...mono,
                    display: 'inline-block',
                    fontSize: '12px',
                    color: 'var(--foreground)',
                    border: '2px solid var(--border)',
                    borderRadius: '4px',
                    padding: '10px 20px',
                    textDecoration: 'none',
                    boxShadow: '3px 3px 0 0 hsl(0 0% 10%)',
                    alignSelf: 'flex-start',
                  }}
                >
                  continue learning →
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

export default function ProgressPage() {
  return (
    <Suspense
      fallback={
        <main style={{ minHeight: '100vh', background: 'var(--background)', color: 'var(--foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--muted-foreground)' }}>
            loading progress...
          </span>
        </main>
      }
    >
      <ProgressPageInner />
    </Suspense>
  )
}

'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Home() {
  const router = useRouter()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
      else setTimeout(() => setVisible(true), 100)
    })
  }, [router])

  const modes = [
    {
      key: 'spark',
      emoji: '⚡',
      name: 'spark',
      tagline: 'stuck on one thing?',
      desc: "five minutes. one concept. you explain it back or we don't move on.",
      color: '#FFE500',
      route: '/spark',
    },
    {
      key: 'trek',
      emoji: '🗺️',
      name: 'trek',
      tagline: 'learn it end to end.',
      desc: 'assign maps the whole topic. walks you through it piece by piece. nothing skipped.',
      color: '#00FF87',
      route: '/trek',
    },
    {
      key: 'recall',
      emoji: '🧠',
      name: 'recall',
      tagline: 'think you know it?',
      desc: 'prove it. assign finds exactly what broke down and fixes only that.',
      color: '#FF2D78',
      route: '/recall',
    },
    {
      key: 'build',
      emoji: '🛠️',
      name: 'build',
      tagline: 'code it yourself.',
      desc: "assign never writes it for you. it asks until you understand what you're doing.",
      color: '#FF6B00',
      route: '/build',
    },
    {
      key: 'dashboard',
      emoji: '📊',
      name: 'dashboard',
      tagline: 'track your progress.',
      desc: 'see all your trek roadmaps, how far you got, and every concept you have mastered.',
      color: '#A855F7',
      route: '/dashboard',
    },
  ]

  return (
    <main style={{
      minHeight: '100vh',
      background: '#080808',
      color: '#fff',
      fontFamily: "'Syne', sans-serif",
      overflow: 'hidden',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .grain {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          opacity: 0.035;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
        }

        .hero-text {
          opacity: 0;
          transform: translateY(30px);
          transition: opacity 0.8s ease, transform 0.8s ease;
        }
        .hero-text.visible {
          opacity: 1;
          transform: translateY(0);
        }

        .mode-card {
          background: #111;
          border: 1px solid #1a1a1a;
          border-radius: 20px;
          padding: 28px;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
          opacity: 0;
          transform: translateY(20px);
        }
        .mode-card.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .mode-card:hover {
          border-color: var(--accent);
          transform: translateY(-3px);
          background: #141414;
        }
        .mode-card:hover .arrow {
          transform: translateX(4px);
        }
        .mode-card:hover .card-glow {
          opacity: 1;
        }

        .card-glow {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 1px;
          background: var(--accent);
          opacity: 0;
          transition: opacity 0.2s ease;
        }

        .arrow {
          transition: transform 0.2s ease;
          display: inline-block;
        }

        .nav-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #FFE500;
          display: inline-block;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }

        .dashboard-link {
          font-size: 11px;
          color: #444;
          font-family: 'DM Mono', monospace;
          letter-spacing: 0.05em;
          text-decoration: none;
          transition: color 0.15s ease;
        }
        .dashboard-link:hover { color: #fff; }

        .signout-btn {
          font-size: 11px;
          color: #333;
          font-family: 'DM Mono', monospace;
          letter-spacing: 0.05em;
          background: none;
          border: none;
          cursor: pointer;
          transition: color 0.15s ease;
          padding: 0;
        }
        .signout-btn:hover { color: #fff; }
      `}</style>

      <div className="grain" />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '720px', margin: '0 auto', padding: '40px 24px 80px' }}>

        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '80px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="nav-dot" />
            <span style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.5px' }}>assign</span>
          </div>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            <a href="/dashboard" className="dashboard-link">dashboard →</a>
            <button
              className="signout-btn"
              onClick={async () => {
                await supabase.auth.signOut()
                router.push('/login')
              }}
            >
              sign out
            </button>
            <span style={{ fontSize: '11px', color: '#333', fontFamily: "'DM Mono', monospace", letterSpacing: '0.05em' }}>BETA</span>
          </div>
        </nav>

        <div style={{ marginBottom: '72px' }}>
          <div
            className={`hero-text ${visible ? 'visible' : ''}`}
            style={{ transitionDelay: '0.1s' }}
          >
            <div style={{
              fontSize: 'clamp(52px, 8vw, 88px)',
              fontWeight: 800,
              lineHeight: 0.95,
              letterSpacing: '-3px',
              marginBottom: '24px',
            }}>
              <span style={{ display: 'block', color: '#fff' }}>the answer</span>
              <span style={{ display: 'block', color: '#fff' }}>is not</span>
              <span style={{ display: 'block', color: '#FFE500' }}>the point.</span>
            </div>
          </div>

          <div
            className={`hero-text ${visible ? 'visible' : ''}`}
            style={{ transitionDelay: '0.3s' }}
          >
            <p style={{
              fontSize: '16px',
              color: '#666',
              lineHeight: 1.6,
              maxWidth: '420px',
              fontWeight: 400,
            }}>
              assign doesn't explain and move on.
              it asks until you can explain it back.
              that's the only moment learning actually happens.
            </p>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          gridTemplateAreas: '"a b" "c d" "e e"',
        }}>
          {modes.map((mode, i) => (
            <button
              key={mode.key}
              className={`mode-card ${visible ? 'visible' : ''}`}
              style={{
                '--accent': mode.color,
                transitionDelay: `${0.4 + i * 0.08}s`,
                textAlign: 'left',
                border: 'none',
                outline: 'none',
                gridArea: i === 4 ? 'e' : undefined,
              } as React.CSSProperties}
              onClick={() => router.push(mode.route)}
            >
              <div className="card-glow" />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <span style={{ fontSize: '22px' }}>{mode.emoji}</span>
                <span className="arrow" style={{ color: '#333', fontSize: '16px' }}>→</span>
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '4px', letterSpacing: '-0.3px' }}>
                {mode.name}
              </div>
              <div style={{ fontSize: '11px', color: mode.color, fontFamily: "'DM Mono', monospace", marginBottom: '10px', letterSpacing: '0.03em' }}>
                {mode.tagline}
              </div>
              <p style={{ fontSize: '13px', color: '#555', lineHeight: 1.5 }}>
                {mode.desc}
              </p>
            </button>
          ))}
        </div>

        <div style={{ marginTop: '48px', padding: '20px 24px', background: '#0e0e0e', borderRadius: '14px', border: '1px solid #1a1a1a' }}>
          <p style={{ fontSize: '12px', color: '#333', fontFamily: "'DM Mono', monospace", textAlign: 'center', letterSpacing: '0.03em' }}>
            used by students who are tired of feeling like they learned something when they didn't
          </p>
        </div>

      </div>
    </main>
  )
}
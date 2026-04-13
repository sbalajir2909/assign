'use client'

import type { ValidationResult } from '@/lib/types'
import FlagBadge from './FlagBadge'

interface MasteryGateProps {
  result: ValidationResult
  attemptNumber: number
  maxAttempts: number
}

const scoreColor = (score: number) => {
  if (score >= 0.65) return '#4ade80'
  if (score >= 0.50) return '#facc15'
  return '#ff6b6b'
}

const scoreLabel = (score: number) => {
  if (score >= 0.85) return 'excellent'
  if (score >= 0.65) return 'passed'
  if (score >= 0.50) return 'partial'
  return 'not yet'
}

export default function MasteryGate({
  result,
  attemptNumber,
  maxAttempts,
}: MasteryGateProps) {
  const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' }
  const pct = Math.round(result.score * 100)

  return (
    <div
      style={{
        background: 'var(--card)',
        border: `2px solid ${result.passed ? '#4ade80' : 'var(--border)'}`,
        borderRadius: '4px',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        boxShadow: '4px 4px 0px 0px hsl(0 0% 10%)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              ...mono,
              fontSize: '22px',
              fontWeight: 700,
              color: scoreColor(result.score),
            }}
          >
            {pct}%
          </span>
          <span
            style={{
              ...mono,
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: scoreColor(result.score),
              border: `1.5px solid ${scoreColor(result.score)}`,
              borderRadius: '4px',
              padding: '2px 6px',
            }}
          >
            {scoreLabel(result.score)}
          </span>
          {result.flag_type && <FlagBadge flagType={result.flag_type} size="sm" />}
        </div>
        <span style={{ ...mono, fontSize: '10px', color: 'var(--muted-foreground)', letterSpacing: '0.06em' }}>
          attempt {attemptNumber}/{maxAttempts}
        </span>
      </div>

      <div
        style={{
          height: '4px',
          background: 'var(--border)',
          borderRadius: '2px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: scoreColor(result.score),
            transition: 'width 0.6s ease',
          }}
        />
      </div>

      <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5, color: 'var(--foreground)' }}>
        {result.feedback}
      </p>

      {(result.what_was_right || result.what_was_wrong) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {result.what_was_right && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <span style={{ color: '#4ade80', fontSize: '13px', flexShrink: 0 }}>+</span>
              <span style={{ fontSize: '13px', color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
                {result.what_was_right}
              </span>
            </div>
          )}
          {result.what_was_wrong && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <span style={{ color: '#ff6b6b', fontSize: '13px', flexShrink: 0 }}>–</span>
              <span style={{ fontSize: '13px', color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
                {result.what_was_wrong}
              </span>
            </div>
          )}
        </div>
      )}

      {!result.passed && attemptNumber >= maxAttempts && (
        <p style={{ ...mono, margin: 0, fontSize: '11px', color: 'var(--muted-foreground)', letterSpacing: '0.04em' }}>
          moving forward — this concept is flagged for review
        </p>
      )}
    </div>
  )
}

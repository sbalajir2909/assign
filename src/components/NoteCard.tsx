import type { KCNote } from '@/lib/types'

interface NoteCardProps {
  note: KCNote
}

export default function NoteCard({ note }: NoteCardProps) {
  const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' }
  const label: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--muted-foreground)',
  }

  return (
    <div
      style={{
        background: 'var(--card)',
        border: '2px solid var(--border)',
        borderRadius: '4px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        boxShadow: '3px 3px 0px 0px hsl(0 0% 10%)',
      }}
    >
      {/* Title */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={label}>concept</span>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, letterSpacing: '-0.3px' }}>
          {note.concept_name}
        </h3>
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span style={label}>summary</span>
        <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.65, color: 'var(--muted-foreground)' }}>
          {note.summary}
        </p>
      </div>

      {/* Key points */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span style={label}>key points</span>
        <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {note.key_points.map((pt, i) => (
            <li key={i} style={{ fontSize: '14px', lineHeight: 1.5 }}>{pt}</li>
          ))}
        </ul>
      </div>

      {/* Student analogy */}
      {note.student_analogy && (
        <div
          style={{
            borderLeft: '3px solid var(--border)',
            paddingLeft: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <span style={label}>your analogy</span>
          <p style={{ margin: 0, fontSize: '13px', fontStyle: 'italic', color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
            "{note.student_analogy}"
          </p>
        </div>
      )}

      {/* Watch out */}
      {note.watch_out && (
        <div
          style={{
            background: '#2a1a1a',
            border: '1.5px solid #ff6b6b44',
            borderRadius: '4px',
            padding: '10px 12px',
            display: 'flex',
            gap: '8px',
            alignItems: 'flex-start',
          }}
        >
          <span style={{ color: '#ff6b6b', fontSize: '13px', flexShrink: 0 }}>!</span>
          <p style={{ margin: 0, fontSize: '13px', color: '#ff6b6b', lineHeight: 1.4 }}>
            {note.watch_out}
          </p>
        </div>
      )}

      {/* Timestamp */}
      <span style={{ ...mono, fontSize: '10px', color: 'var(--muted-foreground)', letterSpacing: '0.04em' }}>
        {new Date(note.created_at).toLocaleDateString()}
      </span>
    </div>
  )
}

'use client'

import type { KCNode } from '@/lib/types'
import FlagBadge from './FlagBadge'

interface KnowledgeMapProps {
  nodes: KCNode[]
  currentKcIndex: number
}

const statusColor = (node: KCNode) => {
  if (node.status === 'mastered')       return '#4ade80'
  if (node.status === 'force_advanced') return '#facc15'
  if (node.status === 'flagged')        return '#ff6b6b'
  if (node.status === 'in_progress')    return 'var(--foreground)'
  return 'var(--muted-foreground)'
}

const statusBg = (node: KCNode, isCurrent: boolean) => {
  if (isCurrent)                        return 'var(--card)'
  if (node.status === 'mastered')       return '#1a2a1a'
  if (node.status === 'force_advanced') return '#2a2a1a'
  if (node.status === 'flagged')        return '#2a1a1a'
  return 'transparent'
}

export default function KnowledgeMap({ nodes, currentKcIndex }: KnowledgeMapProps) {
  const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        overflowY: 'auto',
        maxHeight: '60vh',
      }}
    >
      <div style={{ ...mono, fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '8px' }}>
        knowledge map
      </div>

      {nodes.map((node, i) => {
        const isCurrent = i === currentKcIndex
        const mastered = node.status === 'mastered' || node.status === 'force_advanced'

        return (
          <div
            key={node.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 10px',
              borderRadius: '4px',
              background: statusBg(node, isCurrent),
              border: isCurrent ? '2px solid var(--border)' : '2px solid transparent',
              boxShadow: isCurrent ? '3px 3px 0 0 hsl(0 0% 10%)' : 'none',
              opacity: i > currentKcIndex && node.status === 'not_started' ? 0.4 : 1,
            }}
          >
            {/* Index dot */}
            <div
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                border: `2px solid ${statusColor(node)}`,
                background: mastered ? statusColor(node) : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {mastered && (
                <span style={{ color: '#000', fontSize: '10px', fontWeight: 700 }}>✓</span>
              )}
              {isCurrent && !mastered && (
                <span style={{ ...mono, fontSize: '9px', color: statusColor(node) }}>
                  {i + 1}
                </span>
              )}
            </div>

            {/* Title + flag */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span
                style={{
                  fontSize: '13px',
                  color: isCurrent ? 'var(--foreground)' : statusColor(node),
                  fontWeight: isCurrent ? 600 : 400,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {node.title}
              </span>
              {node.flag_type && <FlagBadge flagType={node.flag_type} size="sm" />}
            </div>

            {/* BKT score */}
            <span style={{ ...mono, fontSize: '10px', color: statusColor(node), flexShrink: 0 }}>
              {Math.round(node.p_learned * 100)}%
            </span>
          </div>
        )
      })}
    </div>
  )
}

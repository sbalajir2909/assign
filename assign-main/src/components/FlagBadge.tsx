import type { FlagType } from '@/lib/types'

const FLAG_CONFIG: Record<
  NonNullable<FlagType>,
  { label: string; bg: string; color: string; border: string }
> = {
  struggling: { label: 'struggling', bg: '#2a1a1a', color: '#ff6b6b', border: '#ff6b6b' },
  misconception: { label: 'misconception', bg: '#1a1a2a', color: '#818cf8', border: '#818cf8' },
  strong: { label: 'strong', bg: '#1a2a1a', color: '#4ade80', border: '#4ade80' },
}

interface FlagBadgeProps {
  flagType: FlagType
  size?: 'sm' | 'md'
}

export default function FlagBadge({ flagType, size = 'md' }: FlagBadgeProps) {
  if (!flagType) return null

  const cfg = FLAG_CONFIG[flagType]
  const fontSize = size === 'sm' ? '10px' : '11px'
  const padding = size === 'sm' ? '2px 6px' : '3px 8px'

  return (
    <span
      style={{
        display: 'inline-block',
        fontFamily: 'var(--font-mono)',
        fontSize,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        padding,
        borderRadius: '4px',
        border: `1.5px solid ${cfg.border}`,
        background: cfg.bg,
        color: cfg.color,
        lineHeight: 1.4,
      }}
    >
      {cfg.label}
    </span>
  )
}

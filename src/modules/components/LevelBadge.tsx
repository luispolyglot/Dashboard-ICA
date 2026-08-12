import type { StudyLevel } from '../types'

type LevelBadgeSize = 'normal' | 'small'

type LevelBadgeProps = {
  level: StudyLevel
  size?: LevelBadgeSize
}

type Tone = 'slate' | 'blue' | 'emerald' | 'amber' | 'orange' | 'violet'

const COLOR_MAP: Record<StudyLevel, Tone> = {
  'Pre-A1': 'slate',
  A1: 'blue',
  'A1+': 'blue',
  A2: 'emerald',
  'A2+': 'emerald',
  B1: 'amber',
  'B1+': 'amber',
  B2: 'orange',
  'B2+': 'orange',
  C1: 'violet',
}

const TONE_CLASSES: Record<Tone, string> = {
  slate: 'bg-muted text-muted-foreground',
  blue: 'bg-blue-500/15 text-blue-400',
  emerald: 'bg-emerald-500/15 text-emerald-400',
  amber: 'bg-amber-500/15 text-amber-400',
  orange: 'bg-orange-500/15 text-orange-400',
  violet: 'bg-violet-500/15 text-violet-400',
}

export function LevelBadge({ level, size = 'normal' }: LevelBadgeProps) {
  const tone = COLOR_MAP[level] || 'slate'
  const sizeClass = size === 'small' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'

  return (
    <span
      className={`inline-flex items-center rounded-md font-semibold tracking-wide ${sizeClass} ${TONE_CLASSES[tone]}`}
    >
      {level}
    </span>
  )
}

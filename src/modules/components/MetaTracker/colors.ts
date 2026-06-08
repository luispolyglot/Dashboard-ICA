export const LEVEL_COLORS: Record<string, string> = {
  'Pre-A1': '#64748b',
  A1: '#3B82F6',
  'A1+': '#3B82F6',
  A2: '#22C55E',
  'A2+': '#22C55E',
  B1: '#EAB308',
  'B1+': '#EAB308',
  B2: '#F97316',
  'B2+': '#F97316',
  C1: '#A855F7',
}

export function getMetaTrackerLevelColor(level: string | null | undefined): string {
  if (!level) return LEVEL_COLORS['Pre-A1']
  return LEVEL_COLORS[level] || LEVEL_COLORS['Pre-A1']
}

export function hexWithAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : normalized
  const int = Number.parseInt(full, 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255
  const safeAlpha = Math.max(0, Math.min(1, alpha))
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`
}

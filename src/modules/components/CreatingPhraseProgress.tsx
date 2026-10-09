import { useEffect, useState } from 'react'
import { GameProgress } from '../game/ui'
import { t } from '@/i18n'

/**
 * «Creando tu frase…» with a bar that fills up little by little, like the nota desafiante's
 * «Preparando tu desafío…» (Luis, 9 Oct): the spinner looked stuck when the AI took 8-9 s.
 * The AI does not report its progress, so the bar moves on its own: fast at first, slower
 * later, and it never reaches the end until the phrase arrives (then this disappears).
 */
export function CreatingPhraseProgress({ manual = false, className }: { manual?: boolean; className?: string }) {
  const [value, setValue] = useState(0.04)

  useEffect(() => {
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt
      // About 60 % at 3 s, 85 % at 6 s, 93 % at 9 s; never 100 % by itself.
      setValue(Math.max(0.04, 0.96 * (1 - Math.exp(-elapsed / 3200))))
    }, 120)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className={className} role='status'>
      <p className='m-0 mb-2 text-center text-sm font-extrabold' style={{ color: 'var(--ica-c-ink)' }}>
        {manual ? t('Revisando tu frase…') : t('Creando tu frase…')}
      </p>
      <GameProgress value={value} color='var(--ica-c)' height={12} label={t('Progreso')} />
    </div>
  )
}

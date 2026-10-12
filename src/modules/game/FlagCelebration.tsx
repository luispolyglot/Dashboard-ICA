import { useEffect } from 'react'
import confetti from 'canvas-confetti'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { langName, t } from '@/i18n'
import { LanguageFlag } from '../components/LanguagePicker'
import { FlagInitial } from './ranking'

/**
 * BANDERA CONSEGUIDA (Luis, 9 Oct): buying the flag of a language has to feel like a big win.
 * The flag comes in spinning with your name on it, light rays turn behind it, confetti falls and
 * the «acquired» sound plays. Then it shows how it looks on your initial.
 */
export function FlagCelebration({
  lang,
  name,
  initial,
  onClose,
}: {
  lang: string
  name: string
  initial: string
  onClose: () => void
}) {
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    // The confetti arrives when the flag lands. The only sound is the cash register of the purchase
    // (Luis, 9 Oct: no second sound when it lands).
    const timer = window.setTimeout(() => {
      if (reduce) return
      try {
        const shoot = (originX: number, angle: number) =>
          void confetti({ particleCount: 70, angle, spread: 65, startVelocity: 55, origin: { x: originX, y: 0.75 }, zIndex: 140 })
        shoot(0.1, 60)
        shoot(0.9, 120)
        window.setTimeout(() => void confetti({ particleCount: 90, spread: 100, origin: { y: 0.35 }, zIndex: 140 }), 350)
      } catch {
        // Without confetti, nothing happens.
      }
    }, 1150)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const language = langName(lang)

  return (
    <div
      className='fixed inset-0 z-[125] flex items-center justify-center overflow-hidden px-6'
      style={{ background: 'radial-gradient(circle at 50% 40%, #0b4f70 0%, #061a2b 70%)' }}
      role='dialog'
      aria-modal='true'
      aria-label={t('Bandera conseguida')}
    >
      {/* Light rays turning behind the flag */}
      <div
        aria-hidden='true'
        className='ica-flag-rays pointer-events-none absolute top-[40%] left-1/2 size-[160vmax] -translate-x-1/2 -translate-y-1/2'
        style={{
          background:
            'repeating-conic-gradient(from 0deg, rgba(255,216,77,0.12) 0deg 9deg, transparent 9deg 22deg)',
          maskImage: 'radial-gradient(circle, black 0%, black 18%, transparent 55%)',
          WebkitMaskImage: 'radial-gradient(circle, black 0%, black 18%, transparent 55%)',
        }}
      />

      <div className='relative flex w-full max-w-sm flex-col items-center text-center text-white'>
        <motion.p
          className='m-0 text-[13px] font-black tracking-[0.2em] text-[#ffc72c] uppercase'
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          {t('Bandera de {lang}', { lang: language.toLowerCase() })}
        </motion.p>

        <div className='relative mt-6' style={{ perspective: 900 }}>
          <motion.div
            className='relative'
            initial={{ rotateY: -720, scale: 0.2, opacity: 0 }}
            animate={{ rotateY: 0, scale: 1, opacity: 1 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformStyle: 'preserve-3d' }}
          >
            <div
              className='ica-flag-wave overflow-hidden rounded-2xl'
              style={{ boxShadow: '0 18px 50px -10px rgba(0,0,0,0.6), 0 0 0 4px rgba(255,255,255,0.9)' }}
            >
              <LanguageFlag language={lang} size={250} />
            </div>
            <motion.span
              className='absolute inset-x-0 top-1/2 mx-auto w-max max-w-[92%] -translate-y-1/2 truncate rounded-full px-4 py-1.5 text-xl font-black text-white'
              style={{ background: 'rgba(6,26,43,0.78)', backdropFilter: 'blur(4px)' }}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.15, type: 'spring', stiffness: 260, damping: 14 }}
            >
              {name}
            </motion.span>
          </motion.div>
        </div>

        <motion.h2
          className='font-display m-0 mt-8 text-4xl leading-tight font-black'
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.25, type: 'spring', stiffness: 200, damping: 12 }}
        >
          {t('¡Bandera conseguida!')}
        </motion.h2>

        <motion.div
          className='mt-5 flex items-center gap-3 rounded-3xl bg-white/10 px-4 py-3 text-left backdrop-blur-sm'
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.7, duration: 0.5 }}
        >
          <FlagInitial initial={initial} flag={lang} size={48} />
          <span className='text-sm font-bold text-white/90'>
            {t('Ya sale de fondo en tu inicial, en tu perfil y en el ranking.')}
          </span>
        </motion.div>

        <motion.div
          className='mt-7 w-full'
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.1, duration: 0.5 }}
        >
          <Button type='button' size='xl' variant='gold' className='w-full' onClick={onClose} autoFocus>
            {t('¡Genial!')}
          </Button>
        </motion.div>
      </div>
    </div>
  )
}

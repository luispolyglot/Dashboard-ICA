import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import confetti from 'canvas-confetti'
import { motion, useReducedMotion } from 'motion/react'
import {
  DownloadIcon,
  Gamepad2Icon,
  HeadphonesIcon,
  MoonIcon,
  MoonStarIcon,
  RotateCcwIcon,
  Share2Icon,
  SunIcon,
  SunriseIcon,
  SunsetIcon,
  SwordsIcon,
  XIcon,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
import { langName, t, uiLocale } from '@/i18n'
import { useDashboardContext } from '../../context/DashboardContext'
import {
  fetchMyIcaPercentile,
  fetchMyIcaSummary,
  yearRange,
  type IcaPercentile,
  type IcaSummary,
} from '../../services/icaSummary'
import { longestStreak } from '../achievements'
import { FlameIcon } from '../icons'
import { gameSfx } from '../sfx'
import {
  buildWrappedSlides,
  daysInYear,
  hasWrappedActivity,
  hourMood,
  isWrappedAutoOpenTime,
  latestWrappedYear,
  songsFor,
  topPercentLabel,
  type IcaArchetype,
  type WrappedSlide,
} from './wrappedSlides'
import { drawWrappedImage, WRAPPED_H, WRAPPED_W } from './wrappedImage'

/**
 * WRAPPED ICA (Luis, 9 Oct): your year in the app as full-screen stories, like Spotify Wrapped.
 * Tap the right side to go on, the left side to go back, hold to pause. Each year's Wrapped comes
 * out on 15 December, opens once by itself and stays in Estadísticas › Global («Wrapped 2026»).
 */

const OPEN_EVENT = 'ica:open-wrapped'
const SHOWN_PREFIX = 'ica-wrapped-shown-v1:'
const SLIDE_MS = 6500
const INTRO_MS = 4200

export function openIcaWrapped(year: number): void {
  window.dispatchEvent(new CustomEvent<number>(OPEN_EVENT, { detail: year }))
}

const PROFILE: Record<IcaArchetype, { name: string; text: string; color: string; edge: string }> = {
  I: {
    name: 'Cazapalabras',
    text: 'Nadie guarda palabras como tú. Tu Baúl ICA no ha parado de crecer.',
    color: '#3aaeee',
    edge: '#0b84b5',
  },
  C: {
    name: 'Fábrica de frases',
    text: 'Lo tuyo es crear: conviertes palabras sueltas en frases de verdad.',
    color: '#3b82f6',
    edge: '#2563eb',
  },
  G: {
    name: 'Gamer',
    text: 'Lo tuyo es aprender jugando: retos del día, desafíos y piques con otros icademers.',
    color: '#a259f0',
    edge: '#7a35c9',
  },
  A: {
    name: 'Oído de oro',
    text: 'Escuchar y activar es tu superpoder. Tus notas maestras lo saben.',
    color: '#1e5fb4',
    edge: '#163f80',
  },
}

const BACKGROUNDS: Record<WrappedSlide['kind'], string> = {
  intro: 'linear-gradient(160deg, #061a2b 0%, #0b4f70 55%, #3aaeee 130%)',
  days: 'linear-gradient(165deg, #3a1406 0%, #b4501f 55%, #f2955a 120%)',
  words: 'linear-gradient(160deg, #04263a 0%, #0b84b5 60%, #3aaeee 120%)',
  wordOfYear: 'linear-gradient(170deg, #1d1503 0%, #5c4205 50%, #e0a500 125%)',
  creation: 'linear-gradient(160deg, #0a1a3d 0%, #2563eb 60%, #60a5fa 125%)',
  flashcards: 'linear-gradient(160deg, #052e2b 0%, #0e7c76 55%, #2dd4bf 125%)',
  listening: 'linear-gradient(160deg, #0a1633 0%, #163f80 55%, #1e5fb4 115%)',
  games: 'linear-gradient(160deg, #1d0a36 0%, #7a35c9 55%, #a259f0 120%)',
  rhythm: 'linear-gradient(175deg, #050b1f 0%, #1b2a5c 60%, #4c3b8f 125%)',
  profile: 'linear-gradient(160deg, #061a2b 0%, #0b4f70 60%, #1e5fb4 125%)',
  top: 'linear-gradient(165deg, #1d1503 0%, #6b4a00 55%, #ffc72c 135%)',
  final: 'linear-gradient(160deg, #061a2b 0%, #0b3f5c 50%, #1d1503 130%)',
}

const numberFormat = () => new Intl.NumberFormat(uiLocale())

/** A number that counts up when its story appears. */
function CountUp({ value, delay = 0.35, duration = 1.4 }: { value: number; delay?: number; duration?: number }) {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(reduce ? value : 0)
  useEffect(() => {
    if (reduce || value <= 0) {
      setShown(value)
      return
    }
    let frame = 0
    const start = performance.now() + delay * 1000
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - start) / (duration * 1000)))
      const eased = 1 - Math.pow(1 - progress, 3)
      setShown(Math.round(value * eased))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, delay, duration, reduce])
  return <>{numberFormat().format(shown)}</>
}

/** Text that rises into place, one after another. */
function Rise({ children, delay = 0, className, style }: { children: ReactNode; delay?: number; className?: string; style?: CSSProperties }) {
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: 26, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ delay, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

function Kicker({ children }: { children: ReactNode }) {
  return (
    <Rise className='mb-3 text-[13px] font-black tracking-[0.18em] text-white/70 uppercase'>{children}</Rise>
  )
}

function BigNumber({ value, delay = 0.35 }: { value: number; delay?: number }) {
  return (
    <motion.div
      className='font-display text-[88px] leading-[0.95] font-black tracking-tight text-white tabular-nums sm:text-[104px]'
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 160, damping: 14 }}
    >
      <CountUp value={value} delay={delay} />
    </motion.div>
  )
}

/** Floating soft lights in the background of every story. */
function Glows({ colors }: { colors: [string, string] }) {
  return (
    <div aria-hidden='true' className='pointer-events-none absolute inset-0 overflow-hidden'>
      <div className='ica-wr-float absolute -top-24 -left-24 size-80 rounded-full opacity-40 blur-3xl' style={{ background: colors[0] }} />
      <div
        className='ica-wr-float absolute -right-20 bottom-10 size-96 rounded-full opacity-30 blur-3xl'
        style={{ background: colors[1], animationDelay: '-4s' }}
      />
    </div>
  )
}

function Sparkles({ count = 14 }: { count?: number }) {
  const dots = useMemo(
    () =>
      Array.from({ length: count }, (_, index) => ({
        left: (index * 37) % 100,
        top: (index * 53) % 100,
        size: 2 + (index % 3),
        delay: (index % 7) * 0.45,
      })),
    [count],
  )
  return (
    <div aria-hidden='true' className='pointer-events-none absolute inset-0'>
      {dots.map((dot, index) => (
        <span
          key={index}
          className='ica-wr-star absolute rounded-full bg-white'
          style={{ left: `${dot.left}%`, top: `${dot.top}%`, width: dot.size, height: dot.size, animationDelay: `${dot.delay}s` }}
        />
      ))}
    </div>
  )
}

function SlideBody({ children }: { children: ReactNode }) {
  return <div className='relative flex h-full flex-col justify-center px-7 pt-16 pb-24 text-white'>{children}</div>
}

function monthName(monthStart: string): string {
  const [year, month] = monthStart.split('-').map(Number)
  return new Intl.DateTimeFormat(uiLocale(), { month: 'long' }).format(new Date(year, (month || 1) - 1, 1))
}

/** The longest single word decides the size, so the word of the year never breaks in two. */
function wordOfYearSize(word: string): number {
  const longest = Math.max(...word.split(/\s+/).map((part) => Array.from(part).length), 1)
  if (longest <= 7) return 76
  if (longest <= 9) return 60
  if (longest <= 12) return 46
  return 36
}

function flashComment(percent: number): string {
  if (percent >= 85) return t('Memoria de élite.')
  if (percent >= 65) return t('Vas muy fino.')
  return t('Cada fallo también cuenta: así se aprende.')
}

function HourIcon({ hour }: { hour: number }) {
  const mood = hourMood(hour)
  const props = { className: 'size-16', strokeWidth: 2.2 }
  if (mood === 'early') return <SunriseIcon {...props} />
  if (mood === 'morning') return <SunIcon {...props} />
  if (mood === 'afternoon') return <SunsetIcon {...props} />
  if (mood === 'night') return <MoonIcon {...props} />
  return <MoonStarIcon {...props} />
}

function hourText(hour: number): string {
  const mood = hourMood(hour)
  if (mood === 'early') return t('Madrugas para aprender. Muy pocas personas lo hacen.')
  if (mood === 'morning') return t('Lo tuyo son las mañanas.')
  if (mood === 'afternoon') return t('Tu momento es la tarde.')
  if (mood === 'night') return t('Aprendes cuando cae la noche.')
  return t('Búho total: aprendes de madrugada.')
}

function SlideView({
  slide,
  year,
  language,
  firstName,
  summary,
  onReplay,
  onClose,
}: {
  slide: WrappedSlide
  year: number
  language: string
  firstName: string
  summary: IcaSummary
  onReplay: () => void
  onClose: () => void
}) {
  switch (slide.kind) {
    case 'intro':
      return (
        <SlideBody>
          <Sparkles count={18} />
          <div className='flex items-end justify-center gap-3'>
            {(['I', 'C', 'A'] as const).map((letter, index) => (
              <motion.span
                key={letter}
                className='font-ica flex size-20 items-center justify-center rounded-3xl text-5xl text-white'
                style={{
                  background: PROFILE[letter].color,
                  boxShadow: `0 6px 0 ${PROFILE[letter].edge}`,
                }}
                initial={{ opacity: 0, y: 60, rotate: -20, scale: 0.4 }}
                animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
                transition={{ delay: 0.2 + index * 0.22, type: 'spring', stiffness: 220, damping: 12 }}
              >
                {letter}
              </motion.span>
            ))}
          </div>
          <Rise delay={1} className='mt-10 text-center text-[15px] font-black tracking-[0.2em] text-[#ffc72c] uppercase'>
            {t('Tu Wrapped ICA')}
          </Rise>
          <motion.div
            className='font-display text-center text-[120px] leading-none font-black tracking-tight'
            initial={{ opacity: 0, scale: 1.6, filter: 'blur(12px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={{ delay: 1.2, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            {year}
          </motion.div>
          <Rise delay={1.7} className='mt-4 text-center text-lg font-bold text-white/85'>
            {t('Un año aprendiendo {lang}. Vamos a verlo.', { lang: language.toLowerCase() })}
          </Rise>
        </SlideBody>
      )

    case 'days':
      return (
        <SlideBody>
          <Kicker>{t('Constancia')}</Kicker>
          <Rise delay={0.1} className='text-2xl font-extrabold'>
            {slide.cycleDays > 0 ? t('Completaste el ciclo ICA') : t('Entraste a aprender')}
          </Rise>
          <div className='my-3 flex items-center gap-3'>
            <motion.span
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 200, damping: 10 }}
              className='ica-wr-flicker'
            >
              <FlameIcon size={72} tone='fire' />
            </motion.span>
            <BigNumber value={slide.cycleDays > 0 ? slide.cycleDays : slide.activeDays} />
          </div>
          <Rise delay={0.9} className='text-2xl font-extrabold'>
            {t('días')}
          </Rise>
          {slide.bestStreak > 1 ? (
            <Rise delay={1.6} className='mt-8 rounded-3xl bg-white/12 px-5 py-4 text-lg font-bold backdrop-blur-sm'>
              {t('Tu mejor racha del año: {n} días seguidos.', { n: slide.bestStreak })}
            </Rise>
          ) : null}
        </SlideBody>
      )

    case 'words':
      return (
        <SlideBody>
          <Kicker>{t('Inmersión')}</Kicker>
          <Rise delay={0.1} className='text-2xl font-extrabold'>
            {t('Guardaste en tu Baúl ICA')}
          </Rise>
          <BigNumber value={slide.words} />
          <Rise delay={0.9} className='text-2xl font-extrabold'>
            {t('palabras nuevas')}
          </Rise>
          {slide.firstWord ? (
            <Rise delay={1.7} className='mt-8 rounded-3xl bg-white/12 px-5 py-4 backdrop-blur-sm'>
              <span className='block text-sm font-bold text-white/75'>{t('Todo empezó con')}</span>
              <span className='block text-3xl font-black'>{slide.firstWord.target}</span>
              <span className='block text-base font-bold text-white/75'>{slide.firstWord.native}</span>
            </Rise>
          ) : null}
        </SlideBody>
      )

    case 'wordOfYear':
      return (
        <SlideBody>
          <Sparkles count={22} />
          <Kicker>{t('Tu palabra del año')}</Kicker>
          <div className='my-6 flex flex-wrap justify-center gap-x-4' aria-label={slide.target}>
            {slide.target.split(/\s+/).map((part, wordIndex, parts) => {
              const before = parts.slice(0, wordIndex).join('').length
              return (
                <span key={wordIndex} className='flex whitespace-nowrap'>
                  {Array.from(part).map((char, charIndex) => (
                    <motion.span
                      key={charIndex}
                      aria-hidden='true'
                      className='font-display leading-none font-black text-[#ffd84d]'
                      style={{ fontSize: wordOfYearSize(slide.target), textShadow: '0 6px 30px rgba(255,199,44,0.45)' }}
                      initial={{ opacity: 0, y: -40, rotate: -25, scale: 0.3 }}
                      animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
                      transition={{ delay: 0.4 + (before + charIndex) * 0.08, type: 'spring', stiffness: 260, damping: 13 }}
                    >
                      {char}
                    </motion.span>
                  ))}
                </span>
              )
            })}
          </div>
          <Rise delay={0.6 + slide.target.length * 0.08} className='text-center text-2xl font-bold text-white/85'>
            {slide.native}
          </Rise>
          <Rise
            delay={1.2 + slide.target.length * 0.08}
            className='mt-8 rounded-3xl bg-white/12 px-5 py-4 text-center text-lg font-bold backdrop-blur-sm'
          >
            {t('La repasaste {answers} veces en flashcards y la acertaste {correct}.', {
              answers: slide.answers,
              correct: slide.correct,
            })}
          </Rise>
        </SlideBody>
      )

    case 'creation':
      return (
        <SlideBody>
          <Kicker>{t('Creación')}</Kicker>
          <Rise delay={0.1} className='text-2xl font-extrabold'>
            {t('Creaste')}
          </Rise>
          <BigNumber value={slide.phrases} />
          <Rise delay={0.9} className='text-2xl font-extrabold'>
            {t('frases con tus palabras')}
          </Rise>
          {slide.topWord ? (
            <Rise delay={1.7} className='mt-8 rounded-3xl bg-white/12 px-5 py-4 text-lg font-bold backdrop-blur-sm'>
              {t('La palabra que más usaste:')}{' '}
              <span className='font-black text-[#ffd84d]'>{slide.topWord.word}</span>
              {', '}
              {t('en {n} frases.', { n: slide.topWord.times })}
            </Rise>
          ) : null}
        </SlideBody>
      )

    case 'flashcards': {
      const percent = slide.total > 0 ? Math.round((slide.correct / slide.total) * 100) : 0
      const radius = 84
      const circumference = 2 * Math.PI * radius
      return (
        <SlideBody>
          <Kicker>{t('Flashcards')}</Kicker>
          <div className='relative mx-auto my-4 size-[220px]'>
            <svg viewBox='0 0 200 200' className='size-full -rotate-90'>
              <circle cx='100' cy='100' r={radius} fill='none' stroke='rgba(255,255,255,0.18)' strokeWidth='18' />
              <motion.circle
                cx='100'
                cy='100'
                r={radius}
                fill='none'
                stroke='#5eead4'
                strokeWidth='18'
                strokeLinecap='round'
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: circumference * (1 - percent / 100) }}
                transition={{ delay: 0.4, duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
              />
            </svg>
            <span className='font-display absolute inset-0 flex items-center justify-center text-6xl font-black tabular-nums'>
              <CountUp value={percent} delay={0.4} duration={1.6} />%
            </span>
          </div>
          <Rise delay={1.1} className='text-center text-2xl font-extrabold'>
            {t('{n} flashcards acertadas', { n: numberFormat().format(slide.correct) })}
          </Rise>
          <Rise delay={1.6} className='mt-2 text-center text-lg font-bold text-white/80'>
            {t('de {n} respuestas.', { n: numberFormat().format(slide.total) })} {flashComment(percent)}
          </Rise>
        </SlideBody>
      )
    }

    case 'listening':
      return (
        <SlideBody>
          <Kicker>{t('Activación')}</Kicker>
          <div className='mb-4 flex h-16 items-end gap-1.5' aria-hidden='true'>
            {Array.from({ length: 9 }, (_, index) => (
              <span
                key={index}
                className='ica-wr-eq w-3 rounded-full bg-white/85'
                style={{ animationDelay: `${(index % 4) * 0.15 + index * 0.05}s` }}
              />
            ))}
            <HeadphonesIcon className='ml-3 size-12 text-white/90' strokeWidth={2.2} />
          </div>
          <BigNumber value={slide.minutes} delay={0.2} />
          <Rise delay={0.8} className='text-2xl font-extrabold'>
            {t('minutos escuchando tus notas maestras')}
          </Rise>
          {slide.minutes >= 7 ? (
            <Rise delay={1.5} className='mt-6 text-lg font-bold text-white/85'>
              {t('Eso son {n} canciones seguidas.', { n: songsFor(slide.minutes) })}
            </Rise>
          ) : null}
          {slide.notes > 0 ? (
            <Rise delay={2} className='mt-6 rounded-3xl bg-white/12 px-5 py-4 text-lg font-bold backdrop-blur-sm'>
              {t('Y cerraste {n} notas maestras.', { n: slide.notes })}
            </Rise>
          ) : null}
        </SlideBody>
      )

    case 'games':
      return (
        <SlideBody>
          <Kicker>{t('Juegos')}</Kicker>
          {slide.dailyGames > 0 ? (
            <Rise delay={0.2} className='flex items-center gap-4'>
              <Gamepad2Icon className='size-14 shrink-0' strokeWidth={2.2} />
              <span>
                <span className='font-display block text-6xl leading-none font-black tabular-nums'>
                  <CountUp value={slide.dailyGames} delay={0.3} />
                </span>
                <span className='block text-lg font-extrabold'>
                  {t('retos del día')} · {t('{n} sin fallos', { n: slide.perfect })}
                </span>
              </span>
            </Rise>
          ) : null}
          {slide.played > 0 ? (
            <Rise delay={0.9} className='mt-7 flex items-center gap-4'>
              <SwordsIcon className='size-14 shrink-0' strokeWidth={2.2} />
              <span>
                <span className='font-display block text-6xl leading-none font-black tabular-nums'>
                  <CountUp value={slide.won} delay={1} />
                </span>
                <span className='block text-lg font-extrabold'>
                  {t('desafíos ganados de {n}', { n: slide.played })}
                </span>
              </span>
            </Rise>
          ) : null}
          {slide.rival ? (
            <Rise delay={1.7} className='mt-8 rounded-3xl bg-white/12 px-5 py-4 text-lg font-bold backdrop-blur-sm'>
              {t('Tu gran rival:')} <span className='font-black text-[#ffd84d]'>{slide.rival.name}</span>.{' '}
              {t('{n} desafíos entre los dos.', { n: slide.rival.games })}
            </Rise>
          ) : null}
        </SlideBody>
      )

    case 'rhythm':
      return (
        <SlideBody>
          <Sparkles count={26} />
          <Kicker>{t('Tu ritmo')}</Kicker>
          {slide.hour !== null ? (
            <>
              <Rise delay={0.1} className='text-2xl font-extrabold'>
                {t('Tu hora ICA')}
              </Rise>
              <div className='my-3 flex items-center gap-4'>
                <motion.span
                  initial={{ opacity: 0, rotate: -90, scale: 0.3 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  transition={{ delay: 0.3, type: 'spring', stiffness: 150, damping: 12 }}
                  className='text-[#ffd84d]'
                >
                  <HourIcon hour={slide.hour} />
                </motion.span>
                <motion.span
                  className='font-display text-[96px] leading-none font-black tabular-nums'
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.45, type: 'spring', stiffness: 160, damping: 14 }}
                >
                  {String(slide.hour).padStart(2, '0')}h
                </motion.span>
              </div>
              <Rise delay={1} className='text-xl font-bold text-white/85'>
                {hourText(slide.hour)}
              </Rise>
            </>
          ) : null}
          {slide.bestMonth ? (
            <Rise delay={1.6} className='mt-8 rounded-3xl bg-white/12 px-5 py-4 text-lg font-bold backdrop-blur-sm'>
              {t('Tu mejor mes fue {month}: {n} días de ciclo ICA.', {
                month: monthName(slide.bestMonth.month),
                n: slide.bestMonth.days,
              })}
            </Rise>
          ) : null}
        </SlideBody>
      )

    case 'profile': {
      const profile = PROFILE[slide.archetype]
      return (
        <SlideBody>
          <Kicker>{t('Tu perfil ICA')}</Kicker>
          <Rise delay={0.1} className='text-2xl font-extrabold'>
            {t('Este año fuiste…')}
          </Rise>
          <motion.div
            className='mx-auto my-8 flex size-40 items-center justify-center rounded-full'
            style={{ background: profile.color, boxShadow: `0 10px 0 ${profile.edge}` }}
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.6, type: 'spring', stiffness: 120, damping: 11 }}
          >
            {slide.archetype === 'G' ? (
              <Gamepad2Icon className='ica-wr-glow size-24 text-white' strokeWidth={2} />
            ) : (
              <span className='ica-wr-glow font-ica text-8xl text-white'>{slide.archetype}</span>
            )}
          </motion.div>
          <Rise delay={1.3} className='font-display text-center text-5xl font-black'>
            {t(profile.name)}
          </Rise>
          <Rise delay={1.8} className='mt-4 text-center text-lg font-bold text-white/85'>
            {t(profile.text)}
          </Rise>
        </SlideBody>
      )
    }

    case 'top': {
      const percent = Math.round((slide.applied / Math.max(1, slide.possible)) * 100)
      return (
        <SlideBody>
          <Sparkles count={24} />
          <Kicker>{t('Tu constancia')}</Kicker>
          <Rise delay={0.1} className='text-2xl font-extrabold'>
            {t('Aplicaste ICA')}
          </Rise>
          <motion.div
            className='font-display text-[88px] leading-[0.95] font-black tabular-nums'
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, type: 'spring', stiffness: 160, damping: 14 }}
          >
            <CountUp value={percent} delay={0.3} />%
          </motion.div>
          <Rise delay={0.8} className='text-xl font-extrabold'>
            {t('de tus días ({applied} de {possible})', { applied: slide.applied, possible: slide.possible })}
          </Rise>
          {slide.topPercent > 0 ? (
            <motion.div
              className='mt-8 rounded-3xl px-5 py-5 text-center'
              style={{ background: '#ffc72c', color: '#3a2a00', boxShadow: '0 8px 0 #e0a500' }}
              initial={{ opacity: 0, scale: 0.5, rotate: -6 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ delay: 1.7, type: 'spring', stiffness: 180, damping: 12 }}
            >
              <span className='block text-sm font-black tracking-[0.14em] uppercase'>{t('Estás en el top')}</span>
              <span className='font-display block text-6xl leading-none font-black'>
                {topPercentLabel(slide.topPercent, uiLocale())}%
              </span>
              <span className='mt-1 block text-base font-extrabold'>
                {t('de icademers que más aplicaron ICA en {year}', { year })}
              </span>
            </motion.div>
          ) : (
            <Rise delay={1.6} className='mt-8 rounded-3xl bg-white/12 px-5 py-4 text-lg font-bold backdrop-blur-sm'>
              {t('Cada día que aplicaste ICA contó. El año que viene, a por el top.')}
            </Rise>
          )}
        </SlideBody>
      )
    }

    case 'final':
      return (
        <FinalSlide
          year={year}
          language={language}
          firstName={firstName}
          summary={summary}
          onReplay={onReplay}
          onClose={onClose}
        />
      )
  }
}

function FinalSlide({
  year,
  language,
  firstName,
  summary,
  onReplay,
  onClose,
}: {
  year: number
  language: string
  firstName: string
  summary: IcaSummary
  onReplay: () => void
  onClose: () => void
}) {
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [help, setHelp] = useState(false)
  const fileName = `wrapped-ica-${year}.png`
  const archetype = PROFILE[hasWrappedActivity(summary) ? archetypeLetter(summary) : 'C']

  const stats = [
    { value: numberFormat().format(summary.cycleDays), label: t('días de ciclo ICA'), color: '#f2955a' },
    { value: numberFormat().format(summary.wordsAdded), label: t('palabras nuevas'), color: '#87def9' },
    { value: numberFormat().format(summary.phrasesCreated), label: t('frases creadas'), color: '#93c5fd' },
    { value: numberFormat().format(summary.reviewsCorrect), label: t('flashcards acertadas'), color: '#5eead4' },
    { value: numberFormat().format(summary.listeningMinutes), label: t('minutos escuchando'), color: '#bfe9f8' },
    { value: numberFormat().format(summary.challengesWon), label: t('desafíos ganados'), color: '#d8b4fe' },
  ]

  useEffect(() => {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = WRAPPED_W
      canvas.height = WRAPPED_H
      const context = canvas.getContext('2d')
      if (!context) return
      drawWrappedImage(context, {
        year,
        name: firstName,
        language,
        title: t('Wrapped ICA'),
        stats,
        wordLabel: t('Tu palabra del año'),
        word: summary.topReviewWord?.target ?? null,
        wordNative: summary.topReviewWord?.native ?? null,
        profileLabel: t('Tu perfil ICA'),
        profileName: t(archetype.name),
        profileLetter: archetypeLetter(summary) === 'G' ? '★' : archetypeLetter(summary),
        profileColor: archetype.color,
        footer: 'icademy.app',
      })
      setImageUrl(canvas.toDataURL('image/png'))
      canvas.toBlob((blob) => setImageFile(blob ? new File([blob], fileName, { type: 'image/png' }) : null), 'image/png')
    } catch {
      setImageUrl(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, firstName, language])

  const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  const canShare = Boolean(imageFile && navigator.canShare?.({ files: [imageFile] }))

  const save = () => {
    if (canShare && imageFile) {
      navigator.share({ files: [imageFile], title: t('Mi Wrapped ICA {year}', { year }) }).catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setHelp(true)
      })
      return
    }
    if (isTouch) {
      setHelp(true)
      return
    }
    if (!imageUrl) return
    const link = document.createElement('a')
    link.href = imageUrl
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return (
    <div className='relative flex h-full flex-col justify-center px-6 pt-14 pb-8 text-white'>
      <Sparkles count={20} />
      <Rise className='text-center text-[13px] font-black tracking-[0.18em] text-[#ffc72c] uppercase'>
        {t('Wrapped ICA {year}', { year })}
      </Rise>
      <Rise delay={0.15} className='font-display mt-2 text-center text-3xl leading-tight font-black'>
        {firstName ? t('Felicidades por este año, {name}', { name: firstName }) : t('Felicidades por este año')}
      </Rise>
      <div className='mt-6 grid grid-cols-2 gap-2.5'>
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            className='rounded-2xl bg-white/10 px-3.5 py-3 backdrop-blur-sm'
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.35 + index * 0.1, type: 'spring', stiffness: 200, damping: 16 }}
          >
            <span className='font-display block text-3xl leading-none font-black tabular-nums' style={{ color: stat.color }}>
              {stat.value}
            </span>
            <span className='mt-1 block text-[13px] font-extrabold text-white/80'>{stat.label}</span>
          </motion.div>
        ))}
      </div>
      <Rise delay={1.2} className='mt-5 text-center text-base font-bold text-white/80'>
        {t('Nos vemos en {year}.', { year: year + 1 })}
      </Rise>
      <div className='relative z-10 mt-6 flex flex-col gap-2' onPointerDown={(event) => event.stopPropagation()}>
        <Button type='button' size='xl' variant='gold' className='w-full' onClick={save} disabled={!imageUrl}>
          {isTouch ? <Share2Icon className='size-5' strokeWidth={2.6} /> : <DownloadIcon className='size-5' strokeWidth={2.6} />}
          {isTouch ? t('Guardar o compartir') : t('Descargar imagen')}
        </Button>
        {help ? (
          <p className='m-0 rounded-2xl bg-white/15 px-3 py-2 text-center text-xs font-bold'>
            {t('Tu móvil no deja guardarla desde aquí. Haz una captura de pantalla.')}
          </p>
        ) : null}
        <div className='grid grid-cols-2 gap-2'>
          <Button type='button' variant='outline' className='h-11 rounded-2xl border-white/30 bg-white/10 font-extrabold text-white hover:bg-white/20' onClick={onReplay}>
            <RotateCcwIcon className='size-4' strokeWidth={2.6} />
            {t('Ver otra vez')}
          </Button>
          <Button type='button' className='h-11 rounded-2xl font-extrabold' onClick={onClose}>
            {t('Cerrar')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function archetypeLetter(summary: IcaSummary): IcaArchetype {
  const slides = buildWrappedSlides(summary, 0)
  const profile = slides.find((slide) => slide.kind === 'profile')
  return profile && profile.kind === 'profile' ? profile.archetype : 'C'
}

const GLOW_COLORS: Record<WrappedSlide['kind'], [string, string]> = {
  intro: ['#3aaeee', '#a259f0'],
  days: ['#ffc72c', '#f2955a'],
  words: ['#87def9', '#1e5fb4'],
  wordOfYear: ['#ffc72c', '#f2955a'],
  creation: ['#93c5fd', '#3aaeee'],
  flashcards: ['#5eead4', '#3aaeee'],
  listening: ['#3aaeee', '#a259f0'],
  games: ['#d8b4fe', '#3b82f6'],
  rhythm: ['#a259f0', '#1e5fb4'],
  profile: ['#3aaeee', '#ffc72c'],
  top: ['#ffc72c', '#f2955a'],
  final: ['#ffc72c', '#3aaeee'],
}

function WrappedStories({ year, onClose }: { year: number; onClose: () => void }) {
  const { user } = useAuth()
  const { config, creationDays, savedCreationDays } = useDashboardContext()
  const [summary, setSummary] = useState<IcaSummary | null>(null)
  const [failed, setFailed] = useState(false)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [round, setRound] = useState(0)
  const holdTimer = useRef<number | null>(null)
  const held = useRef(false)

  const language = langName(config?.targetLang || '')
  const firstName = String(user?.user_metadata?.display_name || '').trim().split(/\s+/)[0] || ''
  const [percentile, setPercentile] = useState<IcaPercentile | null>(null)

  useEffect(() => {
    if (!config?.targetLang || !config?.nativeLang) return
    let alive = true
    const range = yearRange(year)
    // The «top %» story is a bonus: if it cannot be loaded, the Wrapped goes on without it.
    Promise.all([
      fetchMyIcaSummary({ ...range, targetLang: config.targetLang, nativeLang: config.nativeLang }),
      fetchMyIcaPercentile(year),
    ])
      .then(([data, top]) => {
        if (!alive) return
        setPercentile(top)
        setSummary(data)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [year, config?.targetLang, config?.nativeLang])

  const slides = useMemo(() => {
    if (!summary) return []
    const best = longestStreak(daysInYear(creationDays, year), daysInYear(savedCreationDays, year))
    return buildWrappedSlides(summary, best, percentile)
  }, [summary, creationDays, savedCreationDays, year, percentile])

  const slide = slides[index]
  const isLast = index === slides.length - 1

  const next = useCallback(() => setIndex((value) => Math.min(value + 1, Math.max(0, slides.length - 1))), [slides.length])
  const back = useCallback(() => setIndex((value) => Math.max(0, value - 1)), [])

  // Each story moves on by itself, except the last one.
  useEffect(() => {
    if (!slide || isLast || paused) return
    const timer = window.setTimeout(next, slide.kind === 'intro' ? INTRO_MS : SLIDE_MS)
    return () => window.clearTimeout(timer)
  }, [slide, isLast, paused, next, round, index])

  useEffect(() => {
    if (!slide) return
    if (slide.kind === 'final') {
      gameSfx.celebrate()
      try {
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          void confetti({ particleCount: 120, spread: 90, origin: { y: 0.35 }, zIndex: 140 })
        }
      } catch {
        // Without confetti, nothing happens.
      }
    } else if (index > 0) {
      gameSfx.tap()
    }
  }, [slide, index])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === ' ') next()
      else if (event.key === 'ArrowLeft') back()
      else if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, back, onClose])

  // Lock the page behind while the stories are open.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const onPointerDown = () => {
    held.current = false
    holdTimer.current = window.setTimeout(() => {
      held.current = true
      setPaused(true)
    }, 260)
  }
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current)
    if (held.current) {
      setPaused(false)
      return
    }
    if (isLast) return
    const box = event.currentTarget.getBoundingClientRect()
    if (event.clientX - box.left < box.width * 0.3) back()
    else next()
  }

  const duration = slide?.kind === 'intro' ? INTRO_MS : SLIDE_MS

  return (
    <div
      className='fixed inset-0 z-[130] flex items-center justify-center bg-black/85 backdrop-blur-sm'
      role='dialog'
      aria-modal='true'
      aria-label={t('Wrapped ICA {year}', { year })}
    >
      <div
        className='relative h-dvh w-full overflow-hidden select-none sm:h-[min(92dvh,860px)] sm:w-auto sm:aspect-[9/16] sm:rounded-[32px] sm:shadow-2xl'
        style={{ background: slide ? BACKGROUNDS[slide.kind] : BACKGROUNDS.intro, transition: 'background 0.6s ease' }}
      >
        {/* Progress bars */}
        <div className='absolute inset-x-0 top-0 z-20 flex gap-1 px-3 pt-[max(env(safe-area-inset-top),0.75rem)]'>
          {slides.map((_, barIndex) => (
            <div key={barIndex} className='h-1 flex-1 overflow-hidden rounded-full bg-white/25'>
              <div
                key={`${barIndex}-${index}-${round}`}
                className={barIndex === index && !isLast ? 'ica-wr-progress h-full bg-white' : 'h-full bg-white'}
                style={{
                  width: barIndex < index || (barIndex === index && isLast) ? '100%' : barIndex === index ? undefined : '0%',
                  animationDuration: `${duration}ms`,
                  animationPlayState: paused ? 'paused' : 'running',
                }}
              />
            </div>
          ))}
        </div>

        <button
          type='button'
          onClick={onClose}
          aria-label={t('Cerrar')}
          className='absolute top-[max(env(safe-area-inset-top),0.75rem)] right-3 z-30 mt-4 flex size-10 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-sm'
        >
          <XIcon className='size-5' strokeWidth={2.8} />
        </button>

        {slide ? (
          <>
            <Glows colors={GLOW_COLORS[slide.kind]} />
            <div
              key={`${index}-${round}`}
              className='relative z-10 h-full'
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerLeave={() => {
                if (holdTimer.current) window.clearTimeout(holdTimer.current)
                if (held.current) setPaused(false)
              }}
            >
              <SlideView
                slide={slide}
                year={year}
                language={language}
                firstName={firstName}
                summary={summary as IcaSummary}
                onReplay={() => {
                  setIndex(0)
                  setRound((value) => value + 1)
                }}
                onClose={onClose}
              />
            </div>
          </>
        ) : (
          <div className='flex h-full flex-col items-center justify-center gap-4 px-8 text-center text-white'>
            {failed ? (
              <>
                <p className='m-0 text-lg font-bold'>{t('No pudimos preparar tu Wrapped. Prueba en un rato.')}</p>
                <Button type='button' variant='gold' onClick={onClose}>
                  {t('Cerrar')}
                </Button>
              </>
            ) : (
              <>
                <div className='flex gap-2' aria-hidden='true'>
                  {(['I', 'C', 'A'] as const).map((letter, letterIndex) => (
                    <span
                      key={letter}
                      className='ica-wr-bounce font-ica flex size-12 items-center justify-center rounded-2xl text-2xl text-white'
                      style={{ background: PROFILE[letter].color, animationDelay: `${letterIndex * 0.15}s` }}
                    >
                      {letter}
                    </span>
                  ))}
                </div>
                <p className='m-0 text-base font-bold text-white/80'>{t('Preparando tu año…')}</p>
              </>
            )}
          </div>
        )}

        {slide && index === 0 ? (
          <p className='pointer-events-none absolute inset-x-0 bottom-[max(env(safe-area-inset-bottom),1.25rem)] z-20 m-0 text-center text-xs font-bold text-white/60'>
            {t('Toca para avanzar · mantén pulsado para pausar')}
          </p>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Mounted once in the app: opens the Wrapped when Estadísticas asks for it and, from 15 December
 * to 15 January, once by itself (only if there is something to show).
 */
export function IcaWrappedHost() {
  const { user } = useAuth()
  const { config } = useDashboardContext()
  const [year, setYear] = useState<number | null>(null)

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<number>).detail
      if (detail) setYear(detail)
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  useEffect(() => {
    if (!user?.id || !config?.targetLang || !config?.nativeLang) return
    const now = new Date()
    if (!isWrappedAutoOpenTime(now)) return
    const wrappedYear = latestWrappedYear(now)
    const key = `${SHOWN_PREFIX}${user.id}:${wrappedYear}`
    try {
      if (window.localStorage.getItem(key)) return
    } catch {
      return
    }
    let alive = true
    const timer = window.setTimeout(() => {
      fetchMyIcaSummary({ ...yearRange(wrappedYear), targetLang: config.targetLang, nativeLang: config.nativeLang })
        .then((summary) => {
          if (!alive || !hasWrappedActivity(summary)) return
          try {
            window.localStorage.setItem(key, '1')
          } catch {
            // Without storage it could show again; nothing breaks.
          }
          setYear(wrappedYear)
        })
        .catch(() => undefined)
    }, 2500)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [user?.id, config?.targetLang, config?.nativeLang])

  if (!year) return null
  return <WrappedStories year={year} onClose={() => setYear(null)} />
}

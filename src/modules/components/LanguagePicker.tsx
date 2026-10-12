import { langName, t } from '@/i18n'
import { useId, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, SearchIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Panel, tone as toneColors, type Tone } from '../game/ui'

// Banderas dibujadas en SVG (los emojis de bandera no se ven en Windows).
// Una por idioma de LANGUAGES; formato 3:2 con esquinas redondeadas.

const W = 30
const H = 20

/** Puntos de una estrella de 5 puntas (para China, Vietnam y Turquía). */
function star(cx: number, cy: number, r: number, rotation = -90): string {
  const points: string[] = []
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? r : r * 0.4
    const angle = ((rotation + i * 36) * Math.PI) / 180
    points.push(`${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`)
  }
  return points.join(' ')
}

function hStripes(colors: string[]) {
  const h = H / colors.length
  return colors.map((color, index) => <rect key={index} x='0' y={index * h} width={W} height={h + 0.05} fill={color} />)
}

function vStripes(colors: string[]) {
  const w = W / colors.length
  return colors.map((color, index) => <rect key={index} x={index * w} y='0' width={w + 0.05} height={H} fill={color} />)
}

function nordicCross(bg: string, cross: string, inner?: string) {
  return (
    <>
      <rect width={W} height={H} fill={bg} />
      <rect x='8' y='0' width='6' height={H} fill={cross} />
      <rect x='0' y='7' width={W} height='6' fill={cross} />
      {inner ? (
        <>
          <rect x='9.6' y='0' width='2.8' height={H} fill={inner} />
          <rect x='0' y='8.6' width={W} height='2.8' fill={inner} />
        </>
      ) : null}
    </>
  )
}

const FLAGS: Record<string, () => ReactNode> = {
  Español: () => hStripes(['#AA151B', '#F1BF00', '#F1BF00', '#AA151B']),
  Inglés: () => (
    <>
      <rect width={W} height={H} fill='#012169' />
      <path d='M0 0L30 20M30 0L0 20' stroke='#fff' strokeWidth='4' />
      <path d='M0 0L30 20M30 0L0 20' stroke='#C8102E' strokeWidth='1.5' />
      <path d='M15 0V20M0 10H30' stroke='#fff' strokeWidth='6' />
      <path d='M15 0V20M0 10H30' stroke='#C8102E' strokeWidth='3.4' />
    </>
  ),
  Polaco: () => hStripes(['#FFFFFF', '#DC143C']),
  Francés: () => vStripes(['#002395', '#FFFFFF', '#ED2939']),
  Alemán: () => hStripes(['#1A1A1A', '#DD0000', '#FFCE00']),
  Italiano: () => vStripes(['#009246', '#FFFFFF', '#CE2B37']),
  Portugués: () => (
    <>
      <rect width={W} height={H} fill='#FF0000' />
      <rect width='12' height={H} fill='#006600' />
      <circle cx='12' cy='10' r='4' fill='#FFCC00' />
      <rect x='10.4' y='7.8' width='3.2' height='4.4' rx='1.2' fill='#FFFFFF' stroke='#FF0000' strokeWidth='0.8' />
    </>
  ),
  Ruso: () => hStripes(['#FFFFFF', '#0039A6', '#D52B1E']),
  Chino: () => (
    <>
      <rect width={W} height={H} fill='#DE2910' />
      <polygon points={star(6, 6, 3.6)} fill='#FFDE00' />
      <polygon points={star(11.2, 2.4, 1.1, -60)} fill='#FFDE00' />
      <polygon points={star(13.4, 4.6, 1.1, -80)} fill='#FFDE00' />
      <polygon points={star(13.4, 7.6, 1.1, -100)} fill='#FFDE00' />
      <polygon points={star(11.2, 9.8, 1.1, -120)} fill='#FFDE00' />
    </>
  ),
  Japonés: () => (
    <>
      <rect width={W} height={H} fill='#FFFFFF' />
      <circle cx='15' cy='10' r='5.6' fill='#BC002D' />
    </>
  ),
  Coreano: () => (
    <>
      <rect width={W} height={H} fill='#FFFFFF' />
      <path d='M10 10A5 5 0 0 1 20 10Z' fill='#CD2E3A' />
      <path d='M10 10A5 5 0 0 0 20 10Z' fill='#0047A0' />
      {[
        [5, 4.4, 33],
        [25, 4.4, -33],
        [5, 15.6, -33],
        [25, 15.6, 33],
      ].map(([x, y, angle]) => (
        <g key={`${x}-${y}`} transform={`rotate(${angle} ${x} ${y})`} fill='#1A1A1A'>
          <rect x={x - 2.4} y={y - 1.9} width='4.8' height='0.8' />
          <rect x={x - 2.4} y={y - 0.4} width='4.8' height='0.8' />
          <rect x={x - 2.4} y={y + 1.1} width='4.8' height='0.8' />
        </g>
      ))}
    </>
  ),
  Árabe: () => (
    <>
      <rect width={W} height={H} fill='#006C35' />
      <path d='M8 8.2q1.5-2.2 3 0t3 0 3 0 3 0 3 0' fill='none' stroke='#FFFFFF' strokeWidth='1' strokeLinecap='round' />
      <path d='M8.5 13.4H21.5M21.5 12.3V14.5' stroke='#FFFFFF' strokeWidth='1' strokeLinecap='round' />
    </>
  ),
  Turco: () => (
    <>
      <rect width={W} height={H} fill='#E30A17' />
      <circle cx='11' cy='10' r='5' fill='#FFFFFF' />
      <circle cx='12.3' cy='10' r='4' fill='#E30A17' />
      <polygon points={star(17.4, 10, 2.1, 180)} fill='#FFFFFF' />
    </>
  ),
  Holandés: () => hStripes(['#AE1C28', '#FFFFFF', '#21468B']),
  Sueco: () => nordicCross('#006AA7', '#FECC00'),
  Noruego: () => nordicCross('#BA0C2F', '#FFFFFF', '#00205B'),
  Danés: () => (
    <>
      <rect width={W} height={H} fill='#C8102E' />
      <rect x='9' y='0' width='3.6' height={H} fill='#FFFFFF' />
      <rect x='0' y='8.2' width={W} height='3.6' fill='#FFFFFF' />
    </>
  ),
  Finés: () => nordicCross('#FFFFFF', '#002F6C'),
  Checo: () => (
    <>
      {hStripes(['#FFFFFF', '#D7141A'])}
      <path d='M0 0L15 10L0 20Z' fill='#11457E' />
    </>
  ),
  Húngaro: () => hStripes(['#CD2A3E', '#FFFFFF', '#436F4D']),
  Rumano: () => vStripes(['#002B7F', '#FCD116', '#CE1126']),
  Griego: () => (
    <>
      {hStripes(['#0D5EAF', '#FFFFFF', '#0D5EAF', '#FFFFFF', '#0D5EAF', '#FFFFFF', '#0D5EAF', '#FFFFFF', '#0D5EAF'])}
      <rect width='11.1' height='11.1' fill='#0D5EAF' />
      <rect x='4.44' y='0' width='2.22' height='11.1' fill='#FFFFFF' />
      <rect x='0' y='4.44' width='11.1' height='2.22' fill='#FFFFFF' />
    </>
  ),
  Hindi: () => (
    <>
      {hStripes(['#FF9933', '#FFFFFF', '#138808'])}
      <circle cx='15' cy='10' r='2.5' fill='none' stroke='#000080' strokeWidth='0.7' />
      <circle cx='15' cy='10' r='0.6' fill='#000080' />
    </>
  ),
  Tailandés: () => hStripes(['#A51931', '#F4F5F8', '#2D2A4A', '#2D2A4A', '#F4F5F8', '#A51931']),
  Vietnamita: () => (
    <>
      <rect width={W} height={H} fill='#DA251D' />
      <polygon points={star(15, 10.4, 5.2)} fill='#FFFF00' />
    </>
  ),
  Ucraniano: () => hStripes(['#0057B7', '#FFD700']),
  Catalán: () => hStripes(['#FCDD09', '#DA121A', '#FCDD09', '#DA121A', '#FCDD09', '#DA121A', '#FCDD09', '#DA121A', '#FCDD09']),
  Hebreo: () => (
    <>
      <rect width={W} height={H} fill='#FFFFFF' />
      <rect x='0' y='2' width={W} height='2.6' fill='#0038B8' />
      <rect x='0' y='15.4' width={W} height='2.6' fill='#0038B8' />
      <path d='M15 6.1L18.4 11.9H11.6ZM15 13.9L11.6 8.1H18.4Z' fill='none' stroke='#0038B8' strokeWidth='0.9' strokeLinejoin='round' />
    </>
  ),
}

/** Bandera del idioma (rectángulo redondeado). `size` es el ancho en píxeles. */
export function LanguageFlag({ language, size = 32, className }: { language: string; size?: number; className?: string }) {
  const clipId = useId()
  const draw = FLAGS[language]
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={size}
      height={Math.round((size * H) / W)}
      className={cn('shrink-0', className)}
      aria-hidden='true'
    >
      <defs>
        <clipPath id={clipId}>
          <rect width={W} height={H} rx='4' />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {draw ? (
          draw()
        ) : (
          <>
            <rect width={W} height={H} fill='var(--muted)' />
            <circle cx='15' cy='10' r='5.5' fill='none' stroke='var(--muted-foreground)' strokeWidth='1.2' />
            <path d='M9.5 10H20.5M15 4.5c-2.4 3-2.4 8 0 11M15 4.5c2.4 3 2.4 8 0 11' fill='none' stroke='var(--muted-foreground)' strokeWidth='1' />
          </>
        )}
      </g>
      <rect x='0.5' y='0.5' width={W - 1} height={H - 1} rx='3.6' fill='none' stroke='rgb(15 34 51 / 0.16)' strokeWidth='1' />
    </svg>
  )
}

/** Tarjeta grande de un idioma (bandera + nombre); al tocarla se cambia. */
export function LanguageCard({
  label,
  language,
  onClick,
  tone,
  hint = 'Cambiar',
}: {
  label: string
  language: string
  onClick: () => void
  tone?: Tone
  hint?: string
}) {
  const colors = tone ? toneColors(tone) : null
  return (
    <Panel as='button' tone={tone} onClick={onClick} ariaLabel={`${label}: ${langName(language)}. ${t(hint)}`} className='flex items-center gap-4 px-4 py-4'>
      <LanguageFlag language={language} size={60} className='rounded-md' />
      <span className='min-w-0 flex-1'>
        <span
          className='block text-xs font-extrabold tracking-[0.08em] uppercase'
          style={{ color: colors ? colors.ink : 'var(--muted-foreground)' }}
        >
          {label}
        </span>
        <span className='block truncate font-display text-2xl leading-tight font-extrabold tracking-tight'>{langName(language)}</span>
      </span>
      {/* Solo la flecha: el texto "Cambiar" va en el aria-label (así cabe el nombre entero) */}
      <span className='flex size-9 shrink-0 items-center justify-center rounded-full bg-card/70 text-muted-foreground'>
        <ChevronRightIcon className='size-5' strokeWidth={2.8} aria-hidden='true' />
      </span>
    </Panel>
  )
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** Lista de idiomas con buscador: una fila grande por idioma con su bandera. */
export function LanguageListPicker({
  title,
  value,
  options,
  onPick,
  onBack,
  listClassName,
}: {
  title: string
  value: string
  options: string[]
  onPick: (language: string) => void
  onBack?: () => void
  listClassName?: string
}) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const clean = normalize(query)
    if (!clean) return options
    // Busca por el nombre que se ve (idioma de la interfaz) y también por el nombre en español
    return options.filter(
      (language) => normalize(langName(language)).includes(clean) || normalize(language).includes(clean),
    )
  }, [options, query])

  return (
    <div className='flex min-h-0 flex-col gap-3'>
      <div className='flex items-center gap-2'>
        {onBack ? (
          <button
            type='button'
            onClick={onBack}
            className='flex size-10 shrink-0 items-center justify-center rounded-2xl border-2 border-border text-muted-foreground transition-colors hover:bg-muted'
            aria-label={t('Volver')}
          >
            <ChevronLeftIcon className='size-5' strokeWidth={2.6} />
          </button>
        ) : null}
        <p className='m-0 font-display text-lg leading-tight font-extrabold tracking-tight'>{title}</p>
      </div>

      <label className='relative block'>
        <SearchIcon
          className='pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground'
          strokeWidth={2.4}
          aria-hidden='true'
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('Busca un idioma')}
          aria-label={t('Buscar idioma')}
          className='h-12 rounded-2xl pl-11 text-base font-semibold'
        />
      </label>

      <div className={cn('-mx-1 grid grid-cols-[minmax(0,1fr)] gap-2 overflow-y-auto px-1 pt-0.5 pb-2', listClassName)}>
        {filtered.length === 0 ? (
          <p className='m-0 py-6 text-center text-sm font-bold text-muted-foreground'>{t('No encontramos ese idioma.')}</p>
        ) : (
          filtered.map((language) => {
            const selected = language === value
            return (
              <button
                key={language}
                type='button'
                onClick={() => onPick(language)}
                aria-pressed={selected}
                className={cn(
                  'ica-press flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 px-3 py-2 text-left transition-colors',
                  selected ? '' : 'border-border bg-card hover:bg-muted/60 dark:bg-transparent',
                )}
                style={
                  selected
                    ? {
                        background: 'var(--ica-ok-soft)',
                        borderColor: 'color-mix(in oklab, var(--ica-ok) 55%, transparent)',
                        boxShadow: '0 3px 0 color-mix(in oklab, var(--ica-ok) 40%, transparent)',
                      }
                    : { boxShadow: '0 3px 0 var(--border)' }
                }
              >
                <LanguageFlag language={language} size={36} />
                <span className='min-w-0 flex-1 truncate text-base font-extrabold'>{langName(language)}</span>
                {selected ? (
                  <span
                    className='flex size-7 shrink-0 items-center justify-center rounded-full text-white'
                    style={{ background: 'var(--ica-ok)' }}
                  >
                    <CheckIcon className='size-4' strokeWidth={3} aria-hidden='true' />
                  </span>
                ) : null}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

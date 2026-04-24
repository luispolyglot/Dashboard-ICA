import { useState } from 'react'
import {
  computeLevelPosition,
  getLevelThresholds,
  LEVEL_KEYS,
} from './leveling'

type MetaTrackerBarProps = {
  targetLang: string
  totalWords: number
}

const LEVEL_COLORS: Record<string, string> = {
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

const GRADIENT_STOPS: { pct: number; color: string }[] = [
  { pct: 0, color: '#64748b' },
  { pct: 0.11111, color: '#3B82F6' },
  { pct: 0.22222, color: '#22C55E' },
  { pct: 0.33333, color: '#22C55E' },
  { pct: 0.44444, color: '#EAB308' },
  { pct: 0.55555, color: '#EAB308' },
  { pct: 0.66666, color: '#F97316' },
  { pct: 0.77777, color: '#F97316' },
  { pct: 1, color: '#A855F7' },
]

const hexToRgb = (hex: string) => {
  const clean = hex.replace('#', '')
  const value =
    clean.length === 3
      ? clean
          .split('')
          .map((chr) => chr + chr)
          .join('')
      : clean
  const intValue = parseInt(value, 16)
  return {
    r: (intValue >> 16) & 0xff,
    g: (intValue >> 8) & 0xff,
    b: intValue & 0xff,
  }
}

const rgbToHex = ({ r, g, b }: { r: number; g: number; b: number }) =>
  `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`

const interpolateColor = (
  from: { r: number; g: number; b: number },
  to: { r: number; g: number; b: number },
  ratio: number,
) => ({
  r: Math.round(from.r + (to.r - from.r) * ratio),
  g: Math.round(from.g + (to.g - from.g) * ratio),
  b: Math.round(from.b + (to.b - from.b) * ratio),
})

const getGradientColorAtPercent = (rawPct: number) => {
  const pct = Math.min(Math.max(rawPct, 0), 1)
  for (let i = 1; i < GRADIENT_STOPS.length; i += 1) {
    const previous = GRADIENT_STOPS[i - 1]
    const current = GRADIENT_STOPS[i]
    if (pct <= current.pct) {
      if (current.pct === previous.pct) {
        return current.color
      }
      const rangePct = (pct - previous.pct) / (current.pct - previous.pct)
      const fromRgb = hexToRgb(previous.color)
      const toRgb = hexToRgb(current.color)
      return rgbToHex(interpolateColor(fromRgb, toRgb, rangePct))
    }
  }

  return GRADIENT_STOPS[GRADIENT_STOPS.length - 1].color
}

export function MetaTrackerBar({
  targetLang,
  totalWords,
}: MetaTrackerBarProps) {
  const thresholds = getLevelThresholds(targetLang)
  const pos = computeLevelPosition(totalWords, thresholds)
  const currentColor = LEVEL_COLORS[pos.currentLevelKey] || '#64748b'
  const nextColor = LEVEL_COLORS[pos.nextLevelKey] || '#64748b'
  const walkerColor = getGradientColorAtPercent(pos.pctOverall)
  const [infoOpen, setInfoOpen] = useState(false)
  return (
    <div className='relative box-border mx-auto mb-2 rounded-[14px] border border-slate-300 px-4.5 py-3.5 bg-[linear-gradient(160deg,#ffffff,#eef3f9)] dark:border-[#1e293b] dark:bg-[linear-gradient(160deg,#0f172a,#0a0f1a)]'>
      <style>
        {`@keyframes metaWalkerBob { 0%,100% { transform: translateY(0) translateX(-50%); } 50% { transform: translateY(-3px) translateX(-50%); } }
          @keyframes metaLevelPulse { 0% { box-shadow: 0 0 0 0 #EAB30880; } 70% { box-shadow: 0 0 0 14px #EAB30800; } 100% { box-shadow: 0 0 0 0 #EAB30800; } }
        `}
      </style>
      <div className='mb-3 flex flex-wrap items-center justify-between gap-2.5'>
        <div className='flex flex-wrap items-center gap-2.5'>
          <span className='text-[10px] font-semibold tracking-[0.08em] text-slate-600 uppercase dark:text-[#475569]'>
            Mi progreso en {targetLang}
          </span>
          <button
            onClick={() => setInfoOpen((open) => !open)}
            aria-label='Informacion sobre el progreso'
            className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-400 p-0 text-[10px] leading-none font-bold transition-all duration-200 dark:border-[#334155] ${
              infoOpen
                ? 'bg-blue-500/12 text-blue-400'
                : 'bg-transparent text-slate-500 dark:text-[#64748b]'
            }`}
          >
            i
          </button>
          <div className='hidden lg:flex gap-2 items-center'>
            <span
              style={{
                padding: '3px 9px',
                borderRadius: 7,
                background: `${currentColor}15`,
                border: `1px solid ${currentColor}40`,
                color: currentColor,
                fontSize: 11,
                fontWeight: 700,
                animation: 'metaLevelPulse 1.5s ease-out infinite',
              }}
            >
              {pos.currentLevelKey}
            </span>
            <span className='text-[10px] text-slate-500 dark:text-[#64748b]'>
              →
            </span>
            <span
              style={{
                padding: '3px 9px',
                borderRadius: 7,
                background: `${nextColor}08`,
                border: `1px solid ${nextColor}25`,
                color: `${nextColor}aa`,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {pos.nextLevelKey}
            </span>
          </div>
        </div>
        <div className='w-full lg:w-auto flex gap-2 items-center lg:justify-end justify-between'>
          <div className='flex lg:hidden gap-2 items-center'>
            <span
              style={{
                padding: '3px 9px',
                borderRadius: 7,
                background: `${currentColor}15`,
                border: `1px solid ${currentColor}40`,
                color: currentColor,
                fontSize: 11,
                fontWeight: 700,
                animation: 'metaLevelPulse 1.5s ease-out infinite',
              }}
            >
              {pos.currentLevelKey}
            </span>
            <span className='text-[10px] text-slate-500 dark:text-[#64748b]'>
              →
            </span>
            <span
              style={{
                padding: '3px 9px',
                borderRadius: 7,
                background: `${nextColor}08`,
                border: `1px solid ${nextColor}25`,
                color: `${nextColor}aa`,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {pos.nextLevelKey}
            </span>
          </div>
          <div className='text-[11px] text-slate-500 dark:text-[#64748b]'>
            <span className='text-[13px] font-bold text-slate-900 dark:text-[#f1f5f9]'>
              {pos.total.toLocaleString()}
            </span>
            <span className='text-slate-600 dark:text-[#475569]'>
              {' '}
              / {pos.segEnd.toLocaleString()} palabras
            </span>
          </div>
        </div>
      </div>

      {infoOpen && (
        <div
          style={{
            position: 'absolute',
            top: 46,
            left: 18,
            zIndex: 20,
            width: 'min(340px, calc(100% - 36px))',
            padding: '14px 16px',
            borderRadius: 12,
            background: '#020617',
            border: '1px solid #334155',
            boxShadow: '0 12px 40px #000000a0',
          }}
        >
          <div className='mb-2 flex items-center justify-between'>
            <span className='text-[11px] font-bold tracking-[0.06em] text-blue-400 uppercase'>
              ¿Como se calcula?
            </span>
            <button
              onClick={() => setInfoOpen(false)}
              className='cursor-pointer border-none bg-none p-0 text-[12px] leading-none text-slate-600 dark:text-[#475569]'
            >
              ✕
            </button>
          </div>
          <p className='m-0 mb-2.5 text-[12px] leading-[1.55] text-slate-500 dark:text-[#94a3b8]'>
            Tu progreso se calcula en función de las{' '}
            <strong className='text-slate-900 dark:text-[#f1f5f9]'>
              palabras ICA que has activado
            </strong>
            , sumadas a las que ya tenías antes de empezar.
          </p>
          <div
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              background: '#3d251020',
              border: '1px solid #F9731630',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 7,
            }}
          >
            <span className='shrink-0 text-[13px] leading-[1.3]'>💡</span>
            <p className='m-0 text-[11px] leading-normal text-amber-300 dark:text-[#fdba74]'>
              Los umbrales se basan en datos de otros estudiantes que han
              aplicado ICA. Es acertado pero <strong>no exacto</strong>.
            </p>
          </div>
        </div>
      )}

      <div className='relative pt-7 pb-4.5'>
        <div
          style={{
            position: 'absolute',
            top: -4,
            left: `${pos.pctOverall * 100}%`,
            transform: 'translateY(0) translateX(-50%)',
            zIndex: 3,
            transition: 'left 1s cubic-bezier(.25,1,.5,1)',
            fontSize: 24,
            animation: 'metaWalkerBob 1.6s ease-in-out infinite',
          }}
        >
          🚶‍➡️
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderTop: `6px solid ${walkerColor}`,
              marginTop: -4,
              marginLeft: 6,
            }}
          />
        </div>

        <div className='relative h-2.25 overflow-hidden rounded-[5px] border border-slate-300 bg-slate-100 dark:border-[#1e293b] dark:bg-[#020617]'>
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              bottom: 0,
              width: `${pos.pctOverall * 100}%`,
              overflow: 'hidden',
              transition: 'width 1s cubic-bezier(.25,1,.5,1)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                bottom: 0,
                width: `${100 / Math.max(pos.pctOverall, 0.0001)}%`,
                background: `linear-gradient(90deg,
                #64748b 0%,
                #3B82F6 11.11%,
                #22C55E 22.22%,
                #22C55E 33.33%,
                #EAB308 44.44%,
                #EAB308 55.55%,
                #F97316 66.66%,
                #F97316 77.77%,
                #A855F7 88.88%,
                #A855F7 100%)`,
              }}
            />
          </div>

          {LEVEL_KEYS.map((key, idx) => {
            const leftPct = ((idx + 1) / LEVEL_KEYS.length) * 100
            const reached = pos.pctOverall >= (idx + 1) / LEVEL_KEYS.length
            return (
              <div
                key={key}
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${leftPct}%`,
                  width: 1,
                  background: reached ? '#ffffff30' : '#1e293b',
                  pointerEvents: 'none',
                }}
              />
            )
          })}
        </div>

        <div className='pointer-events-none absolute inset-x-0 bottom-0 flex'>
          {LEVEL_KEYS.map((key, idx) => {
            const leftPct = ((idx + 1) / LEVEL_KEYS.length) * 100
            const reached = pos.pctOverall >= (idx + 1) / LEVEL_KEYS.length
            const isNext = key === pos.nextLevelKey

            return (
              <div
                key={key}
                style={{
                  position: 'absolute',
                  left: `${leftPct}%`,
                  transform: 'translateX(-50%)',
                  fontSize: 9,
                  color: reached
                    ? LEVEL_COLORS[key]
                    : isNext
                      ? '#94a3b8'
                      : '#334155',
                  fontWeight: reached || isNext ? 700 : 500,
                  whiteSpace: 'nowrap',
                }}
              >
                {key}
              </div>
            )
          })}
          <div
            style={{
              position: 'absolute',
              left: 0,
              transform: 'translateX(-50%)',
              fontSize: 9,
              color: '#334155',
              fontWeight: 500,
            }}
          >
            0
          </div>
        </div>
      </div>
    </div>
  )
}

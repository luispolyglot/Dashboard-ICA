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

export function MetaTrackerBar({
  targetLang,
  totalWords,
}: MetaTrackerBarProps) {
  const thresholds = getLevelThresholds(targetLang)
  const pos = computeLevelPosition(totalWords, thresholds)
  const currentColor = LEVEL_COLORS[pos.currentLevelKey] || '#64748b'
  const nextColor = LEVEL_COLORS[pos.nextLevelKey] || '#64748b'
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
            top: -2,
            left: `${pos.pctOverall * 100}%`,
            transform: 'translateY(0) translateX(-50%)',
            zIndex: 3,
            transition: 'left 1s cubic-bezier(.25,1,.5,1)',
            fontSize: 24,
            animation: 'metaWalkerBob 1.6s ease-in-out infinite',
          }}
        >
          🚶‍➡️
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
                #3B82F6 0%,
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

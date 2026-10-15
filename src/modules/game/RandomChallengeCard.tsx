import { lazy, Suspense, useState } from 'react'
import { t } from '@/i18n'
import { SwordsIcon } from './icons'
import { RandomMatchOverlay } from './RandomMatchOverlay'
import { gameSfx } from './sfx'
import type { AppConfig } from '../types'

const IcaChallengesView = lazy(() =>
  import('../views/IcaChallengesView').then((module) => ({ default: module.IcaChallengesView })),
)

/**
 * DESAFÍO ALEATORIO (Luis, 14 Oct): a big button on Inicio, like «Jugar» in Clash Royale. It
 * challenges a random icademer who can be challenged now, without leaving Inicio: the «Retar a …»
 * search screen opens on top and the app chooses the rival and the mode (Luis, 15 Oct). Someone of
 * your language plays with the mix of both vaults; anyone else, each with their own words.
 */
export function RandomChallengeCard({ config, compact = false }: { config: AppConfig | null; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  // A new draw every time (the window closes when the challenge is sent or cancelled).
  const [draw, setDraw] = useState(0)
  // When the search started: the «Buscando rival…» screen shows at once, even while Desafíos ICA
  // loads, and the search lasts the same 3-4 s in total.
  const [startedAt, setStartedAt] = useState(0)

  return (
    <>
      <button
        type='button'
        onClick={() => {
          gameSfx.tap()
          setDraw((value) => value + 1)
          setStartedAt(Date.now())
          setOpen(true)
        }}
        disabled={!config}
        // Luis, 15 Oct: on the computer it reacts to the mouse like the games (it rises a little
        // and the swords move); a tap presses it down.
        className={`ica-press group flex w-full items-center gap-3 rounded-3xl text-left transition-[transform,filter] duration-150 hover:-translate-y-0.5 hover:brightness-110 disabled:hover:translate-y-0 ${compact ? 'px-4 py-3' : 'flex-col justify-center px-5 py-6 text-center'}`}
        style={{
          background: 'linear-gradient(180deg, var(--ica-a), color-mix(in oklab, var(--ica-a) 78%, #000))',
          color: '#fff',
          boxShadow: '0 5px 0 var(--ica-a-edge)',
        }}
      >
        <span
          className={`flex shrink-0 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-12 ${compact ? 'size-12' : 'size-16'}`}
          style={{ background: 'rgba(255,255,255,0.16)' }}
        >
          <SwordsIcon size={compact ? 30 : 40} />
        </span>
        <span className='min-w-0'>
          <span className={`block font-display font-black tracking-tight ${compact ? 'text-lg' : 'text-2xl'}`}>
            {t('Desafío aleatorio')}
          </span>
          <span className='block text-sm font-bold opacity-85'>{t('Reta a un icademer al azar, ahora mismo.')}</span>
        </span>
      </button>
      {open && config ? (
        <Suspense
          fallback={<RandomMatchOverlay state={{ phase: 'searching' }} myName='' names={[]} onClose={() => setOpen(false)} />}
        >
          <IcaChallengesView
            key={draw}
            randomStartedAt={startedAt}
            targetLang={config.targetLang}
            nativeLang={config.nativeLang}
            // RANDOM_RIVAL of IcaChallengesView (written here so that screen still loads only when used).
            embeddedRivalId='__random__'
            onEmbeddedDone={() => setOpen(false)}
          />
        </Suspense>
      ) : null}
    </>
  )
}

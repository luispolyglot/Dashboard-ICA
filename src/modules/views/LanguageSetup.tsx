import { useState } from 'react'
import { LANGUAGES, LEVELS } from '../constants'
import type { AppConfig, CEFRLevel } from '../types'

const LEVEL_DESC: Record<CEFRLevel, string> = {
  '0': 'Sin conocimientos previos',
  A1: 'Entiendo frases muy basicas',
  A2: 'Me comunico en situaciones simples',
  B1: 'Me desenvuelvo en la mayoria de situaciones',
  B2: 'Me expreso con fluidez',
  C1: 'Uso avanzado y complejo',
  C2: 'Dominio casi nativo',
}

const LEVEL_CLASS: Record<CEFRLevel, string> = {
  '0': 'border-slate-500 text-slate-300 bg-slate-500/10',
  A1: 'border-blue-500 text-blue-400 bg-blue-500/10',
  A2: 'border-emerald-500 text-emerald-400 bg-emerald-500/10',
  B1: 'border-amber-500 text-amber-400 bg-amber-500/10',
  B2: 'border-orange-500 text-orange-400 bg-orange-500/10',
  C1: 'border-violet-500 text-violet-400 bg-violet-500/10',
  C2: 'border-pink-500 text-pink-400 bg-pink-500/10',
}

type LanguageSetupProps = {
  onSave: (config: AppConfig) => Promise<void>
}

export function LanguageSetup({ onSave }: LanguageSetupProps) {
  const [nativeLang, setNativeLang] = useState('Español')
  const [targetLang, setTargetLang] = useState('Polaco')
  const [level, setLevel] = useState<CEFRLevel>('A2')

  return (
    <section className='flex flex-1 items-center justify-center px-5 py-10'>
      <div className='w-full max-w-xl text-center'>
        <div className='mb-5 text-5xl'>🌍</div>
        <h2 className='mb-2 font-serif text-4xl font-bold text-slate-100'>Configura tus idiomas</h2>
        <p className='mb-9 text-sm leading-relaxed text-slate-500'>
          Elige tu idioma materno, el que aprendes y tu nivel actual.
        </p>

        <div className='mb-5 text-left'>
          <label className='mb-2 block text-[11px] uppercase tracking-wider text-slate-400'>Tu idioma materno</label>
          <select
            value={nativeLang}
            onChange={(e) => setNativeLang(e.target.value)}
            className='w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-base text-slate-100 outline-none'
          >
            {LANGUAGES.map((language) => (
              <option key={language}>{language}</option>
            ))}
          </select>
        </div>

        <div className='mb-5 text-left'>
          <label className='mb-2 block text-[11px] uppercase tracking-wider text-slate-400'>Idioma que aprendes</label>
          <div className='flex gap-2.5'>
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className='w-full flex-1 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-base font-semibold text-slate-100 outline-none'
            >
              {LANGUAGES.filter((language) => language !== nativeLang).map((language) => (
                <option key={language}>{language}</option>
              ))}
            </select>

            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as CEFRLevel)}
              className='w-20 rounded-xl border border-slate-800 bg-slate-950 px-2 py-3 text-center text-sm text-slate-300 outline-none'
            >
              {LEVELS.map((currentLevel) => (
                <option key={currentLevel} value={currentLevel}>
                  {currentLevel === '0' ? 'Nivel 0' : currentLevel}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className='mb-8 text-left'>
          <div className='grid grid-cols-4 gap-1.5 sm:grid-cols-7'>
            {LEVELS.map((currentLevel) => (
              <button
                key={currentLevel}
                type='button'
                onClick={() => setLevel(currentLevel)}
                className={`rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
                  level === currentLevel
                    ? LEVEL_CLASS[currentLevel]
                    : 'border-slate-800 bg-slate-950 text-slate-500'
                }`}
              >
                {currentLevel === '0' ? 'Nivel 0' : currentLevel}
              </button>
            ))}
          </div>
          <p className='mt-2.5 text-center text-xs text-slate-500'>{LEVEL_DESC[level]}</p>
        </div>

        <button
          type='button'
          onClick={() => onSave({ nativeLang, targetLang, level })}
          className='w-full rounded-xl bg-gradient-to-r from-blue-500 to-blue-700 px-4 py-3.5 text-base font-semibold text-white'
        >
          Empezar
        </button>
      </div>
    </section>
  )
}

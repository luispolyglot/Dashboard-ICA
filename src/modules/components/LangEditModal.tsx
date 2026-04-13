import { LANGUAGES, LEVELS } from '../constants'
import type { AppConfig, CEFRLevel } from '../types'

type LangEditModalProps = {
  config: AppConfig
  setConfig: (config: AppConfig) => void
  onClose: () => void
}

export function LangEditModal({
  config,
  setConfig,
  onClose,
}: LangEditModalProps) {
  const baseSelectClass =
    'w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none'

  return (
    <div
      className='fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-5'
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className='w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6'
      >
        <h3 className='mb-5 font-serif text-2xl text-slate-100'>
          Cambiar idiomas
        </h3>

        <div className='mb-4'>
          <label className='mb-1.5 block text-[11px] uppercase tracking-wider text-slate-400'>
            Idioma materno
          </label>
          <select
            value={config.nativeLang}
            onChange={(e) =>
              setConfig({ ...config, nativeLang: e.target.value })
            }
            className={baseSelectClass}
          >
            {LANGUAGES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </div>

        <div className='mb-4'>
          <label className='mb-1.5 block text-[11px] uppercase tracking-wider text-slate-400'>
            Idioma objetivo + nivel
          </label>
          <div className='flex gap-2.5'>
            <select
              value={config.targetLang}
              onChange={(e) =>
                setConfig({ ...config, targetLang: e.target.value })
              }
              className={`${baseSelectClass} w-full`}
            >
              {LANGUAGES.filter((l) => l !== config.nativeLang).map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>

            <select
              value={config.level || 'A2'}
              onChange={(e) =>
                setConfig({ ...config, level: e.target.value as CEFRLevel })
              }
              className={`${baseSelectClass} w-24! text-center`}
            >
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l === '0' ? 'Nivel 0' : l}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type='button'
          onClick={onClose}
          className='mt-2 w-full rounded-xl bg-gradient-to-r from-blue-500 to-blue-700 px-4 py-3 text-sm font-semibold text-white'
        >
          Guardar
        </button>
      </div>
    </div>
  )
}

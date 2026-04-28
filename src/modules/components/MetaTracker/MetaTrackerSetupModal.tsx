import { useState } from 'react'
import type { MetaTrackerStartLevel } from '../../types'
import { computeLevelPosition, getLevelThresholds } from './leveling'

type MetaTrackerSetupModalProps = {
  targetLang: string
  saving: boolean
  onClose: () => void
  onSave: (payload: {
    startLevel: MetaTrackerStartLevel
    priorIcaWords: number
  }) => Promise<void>
}

type SetupStep = 'entry' | 'existing-questions' | 'existing-confirm' | 'newbie'

const OPTIONS: Array<{ key: MetaTrackerStartLevel; label: string }> = [
  { key: '0', label: 'Desde cero' },
  { key: 'A1', label: 'A1' },
  { key: 'A1+', label: 'A1+' },
  { key: 'A2', label: 'A2' },
  { key: 'A2+', label: 'A2+' },
  { key: 'B1', label: 'B1' },
  { key: 'B1+', label: 'B1+' },
  { key: 'B2', label: 'B2' },
  { key: 'B2+', label: 'B2+' },
  { key: 'C1', label: 'C1' },
]

export function MetaTrackerSetupModal({
  targetLang,
  saving,
  onClose,
  onSave,
}: MetaTrackerSetupModalProps) {
  const [step, setStep] = useState<SetupStep>('entry')
  const [startLevel, setStartLevel] = useState<MetaTrackerStartLevel>('0')
  const [priorIcaWords, setPriorIcaWords] = useState('0')

  const thresholds = getLevelThresholds(targetLang)
  const baseWords = startLevel === '0' ? 0 : thresholds[startLevel] || 0
  const priorWords = Number(priorIcaWords || 0)
  const previewTotal = Math.max(
    0,
    baseWords + (Number.isFinite(priorWords) ? priorWords : 0),
  )
  const previewPos = computeLevelPosition(previewTotal, thresholds)

  const handleConfirmExisting = async () => {
    const parsed = Number(priorIcaWords)
    const safeWords = Number.isFinite(parsed)
      ? Math.max(0, Math.floor(parsed))
      : 0
    await onSave({ startLevel, priorIcaWords: safeWords })
  }

  return (
    <div
      className='fixed inset-0 z-200 flex items-center justify-center bg-black/80 p-5 backdrop-blur-sm'
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className='max-h-[90vh] w-full max-w-115 overflow-y-auto rounded-[20px] border border-slate-300 px-6 py-7 bg-[linear-gradient(160deg,#ffffff,#eef3f9)] dark:border-[#1e293b] dark:bg-[linear-gradient(160deg,#0f172a,#0a0f1a)]'
      >
        <div className='mb-1.5 flex items-center justify-between'>
          <h3 className='m-0 text-xl font-semibold text-slate-900 dark:text-[#f1f5f9]'>
            {step === 'entry'
              ? '📊 Trackear mi progreso'
              : step === 'existing-confirm'
                ? '⚠️ Confirmar'
                : step === 'newbie'
                  ? '🎯 Tu nivel actual'
                  : '📊 Trackear mi progreso'}
          </h3>
          <button
            onClick={onClose}
            className='size-7.5 cursor-pointer rounded-lg border border-slate-300 text-[13px] text-slate-600 dark:border-[#1e293b] dark:text-[#64748b]'
          >
            ✕
          </button>
        </div>

        {step === 'entry' ? (
          <>
            <p className='mb-5.5 text-[13px] leading-normal text-slate-600 dark:text-[#64748b]'>
              ¿Has usado ICA anteriormente para {targetLang}?
            </p>

            <div className='flex gap-2.5'>
              <button
                onClick={() => setStep('existing-questions')}
                className='flex-1 cursor-pointer rounded-xl border border-slate-300 bg-white p-3.25 text-[14px] font-semibold text-slate-700 dark:border-[#1e293b] dark:bg-[#020617] dark:text-slate-200'
              >
                Si
              </button>
              <button
                onClick={() => {
                  setPriorIcaWords('0')
                  setStep('newbie')
                }}
                className='flex-1 cursor-pointer rounded-xl border border-blue-500/30 bg-blue-500/10 p-3.25 text-[14px] font-semibold text-blue-600 dark:text-blue-400'
              >
                No
              </button>
            </div>
          </>
        ) : step === 'existing-questions' ? (
          <>
            <p className='mb-5.5 text-[13px] leading-normal text-slate-600 dark:text-[#64748b]'>
              Cuentanos tu punto de partida para situarte en la barra de nivel
              de {targetLang}.
            </p>

            <label className='mb-2 block text-[11px] font-medium tracking-[0.06em] text-slate-600 uppercase dark:text-[#64748b]'>
              1. ¿Con qué nivel empezaste a aplicar ICA?
            </label>
            <div className='mb-5.5 grid grid-cols-[repeat(auto-fit,minmax(80px,1fr))] gap-1.25'>
              {OPTIONS.map((option) => {
                const selected = startLevel === option.key
                return (
                  <button
                    key={option.key}
                    onClick={() => setStartLevel(option.key)}
                    className={`cursor-pointer rounded-[9px] border-[1.5px] px-1.5 py-2.5 text-center text-[12px] font-bold ${
                      selected
                        ? 'border-blue-500 bg-blue-500/10 text-blue-500 dark:border-[#3B82F6] dark:bg-[#3B82F615] dark:text-[#60a5fa]'
                        : 'border-slate-300 bg-white text-slate-500 dark:border-[#1e293b] dark:bg-[#020617] dark:text-[#94a3b8]'
                    }`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>

            <label className='mb-2 block text-[11px] font-medium tracking-[0.06em] text-slate-600 uppercase dark:text-[#64748b]'>
              2. ¿Cuántas palabras ICA tienes acumuladas?
            </label>
            <input
              type='number'
              min='0'
              step='1'
              value={priorIcaWords}
              onChange={(event) => setPriorIcaWords(event.target.value)}
              placeholder='0'
              className='mb-1 box-border w-full rounded-[10px] border border-slate-300 bg-white px-3.5 py-2.75 text-center text-[16px] font-semibold text-slate-900 dark:border-[#1e293b] dark:bg-[#020617] dark:text-[#f1f5f9]'
            />
            <p className='mb-5.5 text-[11px] leading-normal text-slate-600 dark:text-[#475569]'>
              Palabras que ya habias memorizado antes de usar esta app.
            </p>

            <div className='mb-5.5 rounded-xl border border-slate-300 px-4 py-3.5 bg-[linear-gradient(160deg,#ffffff,#eef3f9)] dark:border-[#1e293b] dark:bg-[linear-gradient(160deg,#0f172a,#0a0f1a)]'>
              <div className='mb-2 text-[10px] font-semibold tracking-[0.06em] text-slate-600 uppercase dark:text-[#64748b]'>
                Vista previa
              </div>
              <div className='mb-2 flex flex-wrap items-center gap-2.5'>
                <span className='text-[20px] font-bold text-slate-900 dark:text-[#f1f5f9]'>
                  {previewPos.currentLevelKey}
                </span>
                <span className='text-[11px] text-slate-500 dark:text-[#64748b]'>
                  → rumbo a
                </span>
                <span className='text-[14px] font-semibold text-slate-500 dark:text-[#94a3b8]'>
                  {previewPos.nextLevelKey}
                </span>
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: 4,
                  background: '#1e293b',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    background:
                      'linear-gradient(90deg,#3B82F6,#22C55E,#EAB308,#F97316,#A855F7)',
                    width: `${previewPos.pctOverall * 100}%`,
                    borderRadius: 4,
                    transition: 'width .4s',
                  }}
                />
              </div>
              <div className='mt-1.75 text-[11px] text-slate-500 dark:text-[#64748b]'>
                Total:{' '}
                <span className='font-bold text-slate-900 dark:text-[#f1f5f9]'>
                  {previewPos.total.toLocaleString()}
                </span>{' '}
                palabras
              </div>
            </div>
            <div className='flex gap-2.5'>
              <button
                onClick={() => setStep('entry')}
                className='flex-1 cursor-pointer rounded-xl border border-slate-300 bg-white p-3.25 text-[13px] font-semibold text-slate-600 dark:border-[#1e293b] dark:bg-[#020617] dark:text-[#94a3b8]'
              >
                ← Volver
              </button>
              <button
                onClick={() => setStep('existing-confirm')}
                className='flex-1 cursor-pointer rounded-xl border-none bg-linear-to-br from-blue-500 to-blue-900 p-3.25 text-[14px] font-bold text-white'
              >
                Continuar →
              </button>
            </div>
          </>
        ) : step === 'existing-confirm' ? (
          <>
            <div className='mb-4.5 rounded-[14px] border border-slate-300 p-4.5 bg-[linear-gradient(160deg,#ffffff,#eef3f9)] dark:border-[#1e293b] dark:bg-[linear-gradient(160deg,#0f172a,#0a0f1a)]'>
              <p className='m-0 text-[14px] leading-[1.6] text-slate-900 dark:text-[#f1f5f9]'>
                ¿Estás seguro/a que empezaste a aplicar ICA con un nivel{' '}
                <span className='font-bold text-blue-500 dark:text-[#60a5fa]'>
                  {startLevel === '0' ? 'de cero' : startLevel}
                </span>{' '}
                y que desde entonces has añadido{' '}
                <span className='font-bold text-blue-500 dark:text-[#60a5fa]'>
                  {Number(priorIcaWords || 0).toLocaleString()}
                </span>{' '}
                palabras?
              </p>
            </div>

            <div className='mb-5.5 flex items-start gap-2.5 rounded-xl border border-orange-400/25 bg-orange-100/60 px-4 py-3.5 dark:border-[#F9731640] dark:bg-[#3d2510]'>
              <span className='shrink-0 text-[18px]'>⚠️</span>
              <p className='m-0 text-[12px] leading-normal font-medium text-orange-700 dark:text-[#fdba74]'>
                <strong>Importante:</strong> esta información{' '}
                <strong>no se podrá cambiar</strong> una vez confirmada. <br />{' '}
                Los umbrales se basan en datos de otros estudiantes que han
                aplicado ICA. Es acertado pero <strong>no exacto</strong>.
              </p>
            </div>

            <div className='flex gap-2.5'>
              <button
                onClick={() => setStep('existing-questions')}
                className='flex-1 cursor-pointer rounded-xl border border-slate-300 bg-white p-3.25 text-[13px] font-semibold text-slate-600 dark:border-[#1e293b] dark:bg-[#020617] dark:text-[#94a3b8]'
              >
                ← Revisar
              </button>
              <button
                onClick={() => void handleConfirmExisting()}
                disabled={saving}
                style={{ flex: 2 }}
                className={`rounded-xl border-none bg-linear-to-br from-emerald-500 to-emerald-800 p-3.25 text-[14px] font-bold text-white ${saving ? 'cursor-default opacity-70' : 'cursor-pointer opacity-100'}`}
              >
                {saving ? 'Guardando...' : '✓ Sí, confirmar'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className='mb-5.5 text-[13px] leading-normal text-slate-600 dark:text-[#64748b]'>
              Selecciona tu nivel actual en {targetLang} para iniciar el
              MetaTracker.
            </p>

            <label className='mb-2 block text-[11px] font-medium tracking-[0.06em] text-slate-600 uppercase dark:text-[#64748b]'>
              Nivel actual
            </label>
            <div className='mb-5.5 grid grid-cols-[repeat(auto-fit,minmax(80px,1fr))] gap-1.25'>
              {OPTIONS.map((option) => {
                const selected = startLevel === option.key
                return (
                  <button
                    key={option.key}
                    onClick={() => setStartLevel(option.key)}
                    className={`cursor-pointer rounded-[9px] border-[1.5px] px-1.5 py-2.5 text-center text-[12px] font-bold ${
                      selected
                        ? 'border-blue-500 bg-blue-500/10 text-blue-500 dark:border-[#3B82F6] dark:bg-[#3B82F615] dark:text-[#60a5fa]'
                        : 'border-slate-300 bg-white text-slate-500 dark:border-[#1e293b] dark:bg-[#020617] dark:text-[#94a3b8]'
                    }`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
            <div className='mb-5.5 flex items-start gap-2.5 rounded-xl border border-orange-400/25 bg-orange-100/60 px-4 py-3.5 dark:border-[#F9731640] dark:bg-[#3d2510]'>
              <span className='shrink-0 text-[18px]'>⚠️</span>
              <p className='m-0 text-[12px] leading-normal font-medium text-orange-700 dark:text-[#fdba74]'>
                <strong>Importante:</strong> esta informacion{' '}
                <strong>no se podra cambiar</strong> una vez confirmada. <br />{' '}
                Los umbrales se basan en datos de otros estudiantes que han
                aplicado ICA. Es acertado pero <strong>no exacto</strong>.
              </p>
            </div>

            <div className='flex gap-2.5'>
              <button
                onClick={() => setStep('entry')}
                className='flex-1 cursor-pointer rounded-xl border border-slate-300 bg-white p-3.25 text-[13px] font-semibold text-slate-600 dark:border-[#1e293b] dark:bg-[#020617] dark:text-[#94a3b8]'
              >
                ← Volver
              </button>
              <button
                onClick={() => void onSave({ startLevel, priorIcaWords: 0 })}
                disabled={saving}
                style={{ flex: 2 }}
                className={`rounded-xl border-none bg-linear-to-br from-emerald-500 to-emerald-800 p-3.25 text-[14px] font-bold text-white ${saving ? 'cursor-default opacity-70' : 'cursor-pointer opacity-100'}`}
              >
                {saving ? 'Guardando...' : '✓ Aceptar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useDashboardContext } from '../../context/DashboardContext'
import type { AppConfig } from '../../types'
import { MetaTrackerBar } from './MetaTrackerBar'
import { getLevelThresholds } from './leveling'
import { MetaTrackerSetupModal } from './MetaTrackerSetupModal'

type MetaTrackerSectionProps = {
  config: AppConfig
}

export function MetaTrackerSection({ config }: MetaTrackerSectionProps) {
  const {
    metaTrackerProfile,
    metaTrackerLoading,
    metaTrackerSaving,
    saveMetaTracker,
  } = useDashboardContext()
  const [showSetup, setShowSetup] = useState(false)

  const thresholds = getLevelThresholds(config.targetLang)
  const startLevel = metaTrackerProfile?.startLevel || '0'
  const baseWords = startLevel === '0' ? 0 : (thresholds[startLevel] ?? 0)
  const priorWords = metaTrackerProfile?.priorIcaWords ?? 0
  const activationWords = metaTrackerProfile?.activationWordsTotal ?? 0
  const totalWords = baseWords + priorWords + activationWords

  const handleSave = async (payload: {
    startLevel: typeof startLevel
    priorIcaWords: number
  }) => {
    await saveMetaTracker(payload)
    setShowSetup(false)
  }

  if (metaTrackerLoading) {
    return (
      <div className='mx-auto mb-2 w-full rounded-[14px] border border-dashed border-slate-400 px-5 py-4.5 text-center text-[13px] text-slate-500 bg-[linear-gradient(160deg,#ffffff,#eef3f9)] dark:border-[#334155] dark:text-[#94a3b8] dark:bg-[linear-gradient(160deg,#0f172a,#0a0f1a)]'>
        Cargando meta tracker...
      </div>
    )
  }

  return (
    <>
      {showSetup && (
        <MetaTrackerSetupModal
          targetLang={config.targetLang}
          saving={metaTrackerSaving}
          onClose={() => setShowSetup(false)}
          onSave={handleSave}
        />
      )}

      {metaTrackerProfile?.confirmedAt ? (
        <div className='mb-5'>
          <MetaTrackerBar
            targetLang={config.targetLang}
            totalWords={totalWords}
          />
        </div>
      ) : (
        <div className='mx-auto mb-5 w-full rounded-[14px] border border-dashed border-slate-400 px-5 py-4.5 text-center bg-[linear-gradient(160deg,#ffffff,#eef3f9)] dark:border-[#334155] dark:bg-[linear-gradient(160deg,#0f172a,#0a0f1a)]'>
          <div className='mb-2.5 text-[11px] font-semibold tracking-[0.06em] text-slate-500 uppercase dark:text-[#64748b]'>
            Mi progreso en {config.targetLang}
          </div>
          <button
            onClick={() => setShowSetup(true)}
            className='inline-flex cursor-pointer items-center gap-2 rounded-[11px] border border-blue-500/25 bg-blue-500/10 px-5.5 py-2.5 text-[13px] font-bold text-blue-500 dark:border-[#3B82F640] dark:bg-[#3B82F610] dark:text-[#60a5fa]'
          >
            📊 Trackear mi progreso
          </button>
          <p className='mt-2 text-[11px] leading-normal text-slate-600 dark:text-[#475569]'>
            Responde 2 preguntas para situarte en la barra de nivel.
          </p>
        </div>
      )}
    </>
  )
}

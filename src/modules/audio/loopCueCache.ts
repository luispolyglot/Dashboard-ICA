import { LOOP_START_CUE_URL, LOOP_STEP_CUE_URL } from './loopCues'
import { LOOP_FINISH_CUE_URL } from './loopCues'
import {
  getOfflineAuxAudioBlob,
  upsertOfflineAuxAudioBlob,
} from '../services/masterNotesOfflineStore'

type LoopCueKind = 'start' | 'step' | 'finish'

const LOOP_CUE_CONFIG: Record<LoopCueKind, { id: string; url: string }> = {
  start: {
    id: 'loop-cue-start-female',
    url: LOOP_START_CUE_URL,
  },
  step: {
    id: 'loop-cue-step-female',
    url: LOOP_STEP_CUE_URL,
  },
  finish: {
    id: 'loop-cue-finish-female',
    url: LOOP_FINISH_CUE_URL,
  },
}

async function fetchCueBlob(url: string): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('No se pudo descargar cue auxiliar')
  }
  return await response.blob()
}

export async function warmLoopCueOfflineCache(): Promise<void> {
  const entries = Object.entries(LOOP_CUE_CONFIG) as Array<[LoopCueKind, { id: string; url: string }]>

  await Promise.all(
    entries.map(async ([, config]) => {
      const cached = await getOfflineAuxAudioBlob(config.id)
      if (cached) return

      try {
        const blob = await fetchCueBlob(config.url)
        await upsertOfflineAuxAudioBlob(config.id, blob)
      } catch {
        // noop
      }
    }),
  )
}

export async function getLoopCuePlaybackSource(kind: LoopCueKind): Promise<Blob | string> {
  const config = LOOP_CUE_CONFIG[kind]
  const cached = await getOfflineAuxAudioBlob(config.id)
  if (cached) return cached

  try {
    const blob = await fetchCueBlob(config.url)
    await upsertOfflineAuxAudioBlob(config.id, blob)
    return blob
  } catch {
    return config.url
  }
}

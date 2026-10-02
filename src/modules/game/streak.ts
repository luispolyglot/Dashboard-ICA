import { CREATION_WORDS_GOAL } from '../constants'
import type { DailyProgressEntry } from '../types'
import { getStreakWithSaved, shiftIsoDay, todayKey } from '../utils'

export type IcaStreakInput = {
  creationDays: string[]
  savedCreationDays: string[]
  creationSavesUsedThisMonth: number
  creationSavesLimit: number
  todayProgress: DailyProgressEntry
}

export type IcaStreakState = {
  /** Días seguidos con el ciclo ICA hecho (contando los salvados con CongeladICA). */
  streak: number
  /** El ciclo ICA de hoy (5 palabras + 1 frase + 1 activación con voz) está hecho. */
  cycleDoneToday: boolean
  /** Ayer se falló y hoy se puede salvar la racha con una CongeladICA. */
  frozenPending: boolean
}

export function isIcaCycleDone(progress: DailyProgressEntry): boolean {
  return (
    progress.wordsAdded >= CREATION_WORDS_GOAL &&
    progress.phraseGenerated &&
    progress.voiceActivationsCount > 0
  )
}

// Misma regla que la pantalla de Rachas: si ayer se falló, antes-de-ayer se cumplió
// y queda CongeladICA este mes, la racha está "congelada" hasta que acabe hoy.
function getPendingFrozenDay(
  creationDays: string[],
  savedCreationDays: string[],
  hasSaveQuota: boolean,
  todayDone: boolean,
): string | null {
  const today = todayKey()
  const yesterday = shiftIsoDay(today, -1)
  const twoDaysAgo = shiftIsoDay(today, -2)
  const monthStart = `${today.slice(0, 7)}-01`
  if (todayDone || !hasSaveQuota || yesterday < monthStart) return null
  if (creationDays.includes(yesterday) || savedCreationDays.includes(yesterday)) return null
  if (creationDays.includes(twoDaysAgo) || savedCreationDays.includes(twoDaysAgo)) return yesterday
  return null
}

export function getIcaStreakState(input: IcaStreakInput): IcaStreakState {
  const today = todayKey()
  const cycleDoneToday = isIcaCycleDone(input.todayProgress)
  const baseCreationDays = input.creationDays
  // El servidor tarda un poco en apuntar el día de hoy: si el ciclo ya está hecho,
  // lo contamos ya para que la llama se encienda al momento.
  const creationDays =
    cycleDoneToday && !baseCreationDays.includes(today)
      ? [...baseCreationDays, today]
      : baseCreationDays
  const hasSaveQuota = input.creationSavesUsedThisMonth < input.creationSavesLimit
  const pendingFrozenDay = getPendingFrozenDay(
    creationDays,
    input.savedCreationDays,
    hasSaveQuota,
    creationDays.includes(today),
  )

  return {
    streak: getStreakWithSaved(creationDays, input.savedCreationDays, pendingFrozenDay),
    cycleDoneToday,
    frozenPending: Boolean(pendingFrozenDay),
  }
}

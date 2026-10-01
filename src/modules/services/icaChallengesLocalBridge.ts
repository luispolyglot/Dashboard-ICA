import type { Lexicard } from '../types'

type LocalContext = { cards: Lexicard[]; targetLang: string; nativeLang: string }

let localContext: LocalContext = { cards: [], targetLang: '', nativeLang: '' }

export function registerIcaChallengesLocalContext(input: LocalContext) {
  localContext = input
}

export function getIcaChallengesLocalContext(): LocalContext {
  return localContext
}

export async function resetIcaChallengesLocal(): Promise<void> {
  const simulator = await import('./icaChallengesLocal')
  simulator.resetIcaChallengesLocal()
}

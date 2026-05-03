import type { ReviewMode } from '../types'
import type { ReviewPlayStyle } from '../review/playStyle'

export const DASHBOARD_ROUTES = {
  home: '/',
  newIcaWords: '/new-ica-words',
  myIcaWords: '/my-ica-words',
  flashcards: '/flashcards',
  flashcardsPlay: '/flashcards/play',
  activationPhrase: '/activation-phrase',
  phraseHistory: '/phrase-history',
  leaderboard: '/leaderboard',
  streaks: '/streaks',
  profile: '/profile',
  trackers: '/trackers',
  trackersNew: '/trackers/new',
  analytics: '/analytics',
  manageWhitelist: '/manage-whitelist',
  historicLeaderboard: '/historic-leaderboard',
} as const

export const DASHBOARD_LABELS: Record<string, string> = {
  '/': 'Inicio',
  '/new-ica-words': 'Añadir palabras ICA',
  '/my-ica-words': 'Mi creación ICA',
  '/flashcards': 'Flashcards',
  '/flashcards/play': 'Práctica Flashcards',
  '/activation-phrase': 'Mi frase de activación',
  '/phrase-history': 'Mi historial de frases',
  '/leaderboard': 'Leaderboard',
  '/streaks': 'Rachas',
  '/profile': 'Perfil',
  '/trackers': 'Trackers de mejora',
  '/trackers/new': 'Nuevo tracker de mejora',
  '/analytics': 'Analíticas Admin',
  '/manage-whitelist': 'Gestionar whitelist',
  '/historic-leaderboard': 'Histórico leaderboard',
}

export function getFlashcardsPlayRoute(
  mode: ReviewMode,
  playStyle?: ReviewPlayStyle,
): string {
  const baseRoute = `${DASHBOARD_ROUTES.flashcardsPlay}/${mode}`
  if (!playStyle) return baseRoute
  return `${baseRoute}?playStyle=${playStyle}`
}

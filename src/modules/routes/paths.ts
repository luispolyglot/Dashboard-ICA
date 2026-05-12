import type { ReviewMode } from '../types'
import {
  REVIEW_PENDING_ONLY_QUERY_PARAM,
  REVIEW_PLAY_STYLE_QUERY_PARAM,
  type ReviewPlayStyle,
} from '../review/playStyle'

export const DASHBOARD_ROUTES = {
  home: '/',
  newIcaWords: '/new-ica-words',
  myIcaWords: '/my-ica-words',
  flashcards: '/flashcards',
  flashcardsPlay: '/flashcards/play',
  activationPhrase: '/activation-phrase',
  phraseHistory: '/phrase-history',
  masterNotes: '/master-notes',
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
  '/my-ica-words': 'Historial de palabras ICA',
  '/flashcards': 'Flashcards',
  '/flashcards/play': 'Práctica Flashcards',
  '/activation-phrase': 'Creación de frases ICA',
  '/phrase-history': 'Historial de frases ICA',
  '/master-notes': 'Notas maestras',
  '/master-notes/note': 'Nota Maestra',
  '/master-notes/note/activate': 'Activar frase',
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
  pendingOnly?: boolean,
): string {
  const baseRoute = `${DASHBOARD_ROUTES.flashcardsPlay}/${mode}`
  const params = new URLSearchParams()

  if (playStyle) {
    params.set(REVIEW_PLAY_STYLE_QUERY_PARAM, playStyle)
  }

  if (pendingOnly) {
    params.set(REVIEW_PENDING_ONLY_QUERY_PARAM, '1')
  }

  const query = params.toString()
  if (!query) return baseRoute
  return `${baseRoute}?${query}`
}

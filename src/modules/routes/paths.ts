import type { ReviewMode } from '../types'

export const DASHBOARD_ROUTES = {
  home: '/',
  newIcaWords: '/new-ica-words',
  myIcaWords: '/my-ica-words',
  flashcards: '/flashcards',
  flashcardsPlay: '/flashcards/play',
  activationPhrase: '/activation-phrase',
  phraseHistory: '/phrase-history',
  profile: '/profile',
  analytics: '/analytics',
  manageWhitelist: '/manage-whitelist',
} as const

export const DASHBOARD_LABELS: Record<string, string> = {
  '/': 'Inicio',
  '/new-ica-words': 'Añadir palabras ICA',
  '/my-ica-words': 'Mi creación ICA',
  '/flashcards': 'Flashcards',
  '/flashcards/play': 'Práctica Flashcards',
  '/activation-phrase': 'Mi frase de activación',
  '/phrase-history': 'Mi historial de frases',
  '/profile': 'Perfil',
  '/analytics': 'Analíticas Admin',
  '/manage-whitelist': 'Gestionar whitelist',
}

export function getFlashcardsPlayRoute(mode: ReviewMode): string {
  return `${DASHBOARD_ROUTES.flashcardsPlay}/${mode}`
}

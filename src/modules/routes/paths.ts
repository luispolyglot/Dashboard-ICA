export const DASHBOARD_ROUTES = {
  home: '/',
  newIcaWords: '/new-ica-words',
  myIcaWords: '/my-ica-words',
  flashcards: '/flashcards',
  activationPhrase: '/activation-phrase',
  phraseHistory: '/phrase-history',
  profile: '/profile',
} as const

export const DASHBOARD_LABELS: Record<string, string> = {
  '/': 'Inicio',
  '/new-ica-words': 'Añadir palabras ICA',
  '/my-ica-words': 'Mi creación ICA',
  '/flashcards': 'Flashcards',
  '/activation-phrase': 'Mi frase de activación',
  '/phrase-history': 'Mi historial de frases',
  '/profile': 'Perfil',
}

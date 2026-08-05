import type { ReviewMode } from '../types'
import {
  REVIEW_CONFIRM_ANSWER_QUERY_PARAM,
  REVIEW_PENDING_ONLY_QUERY_PARAM,
  REVIEW_PLAY_STYLE_QUERY_PARAM,
  type ReviewPlayStyle,
} from '../review/playStyle'

export const DASHBOARD_ROUTES = {
  home: '/',
  newIcaWords: '/new-ica-words',
  myIcaWords: '/my-ica-words',
  gamesIca: '/games-ica',
  flashcards: '/flashcards',
  flashcardsPlay: '/flashcards/play',
  preguntica: '/preguntica',
  pregunticaHistory: '/preguntica/history',
  activationPhrase: '/activation-phrase',
  phraseHistory: '/phrase-history',
  masterNotes: '/master-notes',
  leaderboard: '/leaderboard',
  streaks: '/streaks',
  profile: '/profile',
  manageNotifications: '/manage-notifications',
  myAnalytics: '/my-analytics',
  calendarIcademy: '/calendar-icademy',
  calendarIcademyManage: '/calendar-icademy/manage',
  calendarIcademyTeachers: '/calendar-icademy/teachers',
  testsIca: '/tests-ica',
  instagramTrackPosts: '/instagram-track-posts',
  trackers: '/trackers',
  trackersNew: '/trackers/new',
  analytics: '/analytics',
  manageWhitelist: '/manage-whitelist',
  managePregunticaQuestions: '/manage-preguntica-questions',
  historicLeaderboard: '/historic-leaderboard',
  coachingPersonalized: '/coaching-personalized',
  manageCoaching: '/manage-coaching',
  manageCoachingCalendar: '/manage-coaching/calendar',
  offlineSafe: '/offline-safe',
} as const

export const DASHBOARD_LABELS: Record<string, string> = {
  '/': 'Inicio',
  '/new-ica-words': 'Añadir palabras ICA',
  '/my-ica-words': 'Mi baúl ICA',
  '/games-ica': 'Juegos ICA',
  '/flashcards': 'Flashcards',
  '/flashcards/play': 'Práctica Flashcards',
  '/preguntica': 'PreguntICA',
  '/preguntica/history': 'Historial PreguntICA',
  '/activation-phrase': 'Creación de frases ICA',
  '/phrase-history': 'Historial de frases ICA',
  '/master-notes': 'Notas maestras',
  '/master-notes/note': 'Nota Maestra',
  '/master-notes/note/activate': 'Activar frase',
  '/leaderboard': 'Leaderboard',
  '/streaks': 'Rachas',
  '/profile': 'Perfil',
  '/manage-notifications': 'Notificaciones',
  '/my-analytics': 'Mis estadísticas mensuales',
  '/calendar-icademy': 'Calendario ICADEMY',
  '/calendar-icademy/manage': 'Gestionar Calendario ICADEMY',
  '/calendar-icademy/teachers': 'Profesores ICADEMY',
  '/tests-ica': 'Tests ICA',
  '/instagram-track-posts': 'Track post Instagram',
  '/trackers': 'Trackers de mejora',
  '/trackers/new': 'Nuevo tracker de mejora',
  '/analytics': 'Analíticas Admin',
  '/manage-whitelist': 'Gestionar whitelist',
  '/manage-preguntica-questions': 'Preguntas PreguntICA',
  '/historic-leaderboard': 'Histórico leaderboard',
  '/coaching-personalized': 'Coaching Personalizado',
  '/manage-coaching': 'Administrar Coaching',
  '/manage-coaching/calendar': 'Calendario Coaching',
  '/offline-safe': 'Modo sin conexión',
}

export function getFlashcardsPlayRoute(
  mode: ReviewMode,
  playStyle?: ReviewPlayStyle,
  pendingOnly?: boolean,
  confirmAnswer?: boolean,
): string {
  const baseRoute = `${DASHBOARD_ROUTES.flashcardsPlay}/${mode}`
  const params = new URLSearchParams()

  if (playStyle) {
    params.set(REVIEW_PLAY_STYLE_QUERY_PARAM, playStyle)
  }

  if (pendingOnly) {
    params.set(REVIEW_PENDING_ONLY_QUERY_PARAM, '1')
  }

  if (confirmAnswer) {
    params.set(REVIEW_CONFIRM_ANSWER_QUERY_PARAM, '1')
  }

  const query = params.toString()
  if (!query) return baseRoute
  return `${baseRoute}?${query}`
}

export function getManageCoachingUserRoute(userId: string, sessionId?: string): string {
  const base = `${DASHBOARD_ROUTES.manageCoaching}/${userId}`
  if (!sessionId) return base

  const params = new URLSearchParams()
  params.set('sessionId', sessionId)
  return `${base}?${params.toString()}`
}

export function getManageCoacherSessionsRoute(coachUserId: string): string {
  return `${DASHBOARD_ROUTES.manageCoaching}/coacher/${coachUserId}`
}

export function getIcaTestMonthRoute(monthCode: string, redo = false): string {
  const base = `${DASHBOARD_ROUTES.testsIca}/${monthCode}`
  return redo ? `${base}/redo` : base
}

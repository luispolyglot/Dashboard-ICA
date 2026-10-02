export type ImportanceKey =
  | 'vital'
  | 'frequent'
  | 'occasional'
  | 'rare'
  | 'irrelevant'

export type CEFRLevel = '0' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'

export type StudyLevel =
  | 'Pre-A1'
  | 'A1'
  | 'A1+'
  | 'A2'
  | 'A2+'
  | 'B1'
  | 'B1+'
  | 'B2'
  | 'B2+'
  | 'C1'

export type AppView = 'home' | 'add' | 'review' | 'manage' | 'phrase' | 'phrases'

export type ReviewMode =
  | 'mixed'
  | 'vital'
  | 'frequent'
  | 'occasional'
  | 'rare'
  | 'irrelevant'

export type CalendarTab = 'review' | 'creation'

export interface ImportanceLevel {
  key: ImportanceKey
  label: string
  desc: string
  color: string
  bg: string
  multiplier: number
}

export interface Lexicard {
  id: string
  target: string
  native: string
  targetLang?: string
  nativeLang?: string
  examplePhrase?: string | null
  exampleTranslation?: string | null
  importance: ImportanceKey
  interval: number
  easeFactor: number
  streak: number
  lastReviewed: number | null
  lastSeenSession?: number
  activationCount?: number
  firstActivatedAt?: number | null
  lastActivatedAt?: number | null
  createdAt: number
}

export interface LeaderboardEntry {
  rank: number
  user_id: string
  username: string
  display_name: string
  ica_streak_days?: number
  is_creation_streak_frozen?: boolean
  score?: number
  avg_percent?: number
  review_percent?: number
  creation_percent?: number
  ica_test_points?: number | null
  listening_points?: number | null
  preguntica_points?: number | null
  instagram_points?: number | null
  total_points?: number
  /** Insignia destacada del alumno ("categoria:rango"), cuando el servidor la devuelva. */
  featured_badge?: string | null
}

export interface PhraseGenerationEntry {
  id: string
  source_words: string[]
  generated_phrase: string | null
  translation: string | null
  model: string | null
  target_lang?: string | null
  native_lang?: string | null
  created_at: string
}

export interface PhraseVoiceActivationEntry {
  id: string
  phrase_generation_id: string
  storage_path: string
  duration_ms: number | null
  mime_type: string | null
  size_bytes: number | null
  status: 'uploaded' | 'processing' | 'ready' | 'failed'
  created_at: string
}

export interface MasterNote {
  id: string
  name: string
  state: 'open' | 'closed'
  close_type: 'final' | 'temporal'
  closed_level: string | null
  total_duration_ms: number
  final_audio_path: string | null
  target_lang: string | null
  native_lang: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
}

export interface MasterNoteChunk {
  id: string
  master_note_id: string
  phrase_generation_id: string
  storage_path: string
  duration_ms: number
  mime_type: string | null
  size_bytes: number | null
  sort_order: number
  created_at: string
}

export interface MasterNotePlaylist {
  id: string
  name: string
  target_lang: string | null
  native_lang: string | null
  created_at: string
  updated_at: string
}

export interface MasterNotePlaylistItem {
  id: string
  playlist_id: string
  master_note_id: string
  sort_order: number
  created_at: string
}

export interface DailyProgressEntry {
  wordsAdded: number
  phraseGenerated: boolean
  reviewCorrect: number
  voiceActivationsCount: number
}

export type MetaTrackerStartLevel =
  | '0'
  | 'A1'
  | 'A1+'
  | 'A2'
  | 'A2+'
  | 'B1'
  | 'B1+'
  | 'B2'
  | 'B2+'
  | 'C1'

export interface MetaTrackerProfile {
  startLevel: MetaTrackerStartLevel
  priorIcaWords: number
  activationWordsTotal: number
  confirmedAt: number | null
}

export interface ImprovementTracker {
  id: string
  trackerMonth: string
  pronunciationPct: number
  fluencyPct: number
  improvisationPct: number
  createdAt: string
}

export interface ImprovementTrackerInput {
  targetLang: string
  nativeLang: string
  trackerMonth: string
  pronunciationPct: number
  fluencyPct: number
  improvisationPct: number
}

export interface InstagramTrackPostEntry {
  id: string
  trackMonth: string
  dayIndex: number
  postUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface InstagramTrackPostInput {
  targetLang: string
  nativeLang: string
  trackMonth: string
  dayIndex: number
  postUrl: string | null
}

export interface CalendarIcademyEntry {
  id: string
  classKey: string
  className: string
  languageCode: string
  sessionDate: string
  sessionTime: string
  teacherId: string | null
  teacher: string
  groupName: string | null
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface CalendarIcademyEntryInput {
  classKey: string
  className: string
  languageCode: string
  sessionDate: string
  sessionTime: string
  teacherId: string
  groupName?: string | null
  note?: string | null
}

export interface IcademyTeacher {
  userId: string
  displayName: string
  username: string | null
  createdAt: string
  updatedAt: string
}

export interface IcademyTeacherAssignableUser {
  userId: string
  displayName: string
  username: string | null
  createdAt: string
  isTeacher: boolean
}

export interface CalendarIcademyPreference {
  id: string
  userId: string
  classKey: string
  languageCode: string
  notificationsEnabled: boolean
  minutesBefore: number
  quietHoursStart: string | null
  quietHoursEnd: string | null
  lastNotifiedForSessionId: string | null
  lastNotifiedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CalendarIcademyPreferenceInput {
  classKey: string
  languageCode: string
  notificationsEnabled: boolean
  minutesBefore: number
  quietHoursStart?: string | null
  quietHoursEnd?: string | null
}

export interface CalendarIcademySessionBlacklistItem {
  id: string
  userId: string
  calendarEntryId: string
  classKey: string
  createdAt: string
  updatedAt: string
}

export interface CalendarIcademyTeacherNotificationPreference {
  userId: string
  notificationsEnabled: boolean
  minutesBefore: number
  quietHoursStart: string | null
  quietHoursEnd: string | null
  lastNotifiedForSessionId: string | null
  lastNotifiedAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

export interface CalendarIcademyTeacherNotificationPreferenceInput {
  notificationsEnabled: boolean
  minutesBefore: number
  quietHoursStart?: string | null
  quietHoursEnd?: string | null
}

export interface PushSubscriptionDevice {
  id: string
  endpoint: string
  isActive: boolean
  userAgent: string | null
  createdAt: string
  updatedAt: string
  lastSeenAt: string
}

export interface PushReminderPreferences {
  userId: string
  icaStreakEnabled: boolean
  icaStreakHour: number
  flashcardsStreakEnabled: boolean
  flashcardsStreakHour: number
  habitLossEnabled: boolean
  habitLossLastStage: number
  createdAt: string | null
  updatedAt: string | null
}

export interface PushReminderPreferencesInput {
  icaStreakEnabled: boolean
  icaStreakHour: number
  flashcardsStreakEnabled: boolean
  flashcardsStreakHour: number
  habitLossEnabled: boolean
}

export interface CoachingNotificationPreference {
  userId: string
  masterNoteClosedEnabled: boolean
  activeSessionEnabled: boolean
  classScheduleReminderMinutes: 10 | 30 | 60
  createdAt: string | null
  updatedAt: string | null
}

export interface CoachingNotificationPreferenceInput {
  masterNoteClosedEnabled: boolean
  activeSessionEnabled: boolean
  classScheduleReminderMinutes: 10 | 30 | 60
}

export type IcaChallengeStatus =
  | 'created'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'not_accepted'

export type IcaChallengeScope = 'global' | 'language'

export type IcaChallengeResultType =
  | 'pending'
  | 'challenger_win'
  | 'challenged_win'
  | 'draw'
  | 'cancelled'
  | 'expired'
  | 'not_accepted'

export type IcaChallengeCompetitorInvitationStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'

export interface IcaChallengeCompetitor {
  challengeId: string
  userId: string
  competitorOrder: number
  invitationStatus: IcaChallengeCompetitorInvitationStatus
  score: number | null
  payload: Record<string, unknown>
  acceptedAt: string | null
  rejectedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface IcaChallengePlayRecord {
  id: string
  challengeId: string
  userId: string
  index: number
  isCorrect: boolean
  responseMs: number | null
  payload: Record<string, unknown>
  createdAt: string
}

export interface IcaChallengeRecord {
  id: string
  challengeSlug: string
  status: IcaChallengeStatus
  resultType: IcaChallengeResultType
  scope: IcaChallengeScope
  targetLang: string | null
  nativeLang: string | null
  challengerUserId: string
  challengedUserId: string
  winnerUserId: string | null
  durationSeconds: number | null
  expiresAt: string | null
  acceptUntil: string | null
  turnUserId: string | null
  turnExpiresAt: string | null
  startedAt: string | null
  finalizedAt: string | null
  gameMetadata: Record<string, unknown>
  phases: Record<string, unknown>[]
  competitors: IcaChallengeCompetitor[]
  createdAt: string
  updatedAt: string
}

export interface IcaChallengeAvailableUser {
  userId: string
  displayName: string
  username: string | null
  nativeLang: string | null
  targetLang: string | null
  cefrLevel: string | null
  /** Nivel real (barra de progreso) en tu mismo par de idiomas. */
  level: string | null
  /** Está inscrito con tu mismo par de idiomas (puede jugar "por idioma"). */
  samePair: boolean
  /** Se puede jugar con la mezcla de baúles (mismo idioma y nivel parecido). */
  mixedAllowed: boolean
  mixedBlockedReason: string | null
  activeChallengesCount: number
  canChallenge: boolean
  blockedReason: string | null
  /** Victorias seguidas ahora mismo (se ve al lado del nombre). */
  winStreak: number
  /** Desafíos de los últimos 30 días (los que más juegan salen arriba). */
  recentChallenges: number
}

export type IcaChallengeQuestionKind = 'choice' | 'write' | 'speak' | 'listen' | 'cloze' | 'pairs'
export type IcaChallengeFormat = 'turns' | 'lightning'
/** own: cada uno juega con su baúl · mixed: las mismas palabras, 5 de cada baúl */
export type IcaChallengeWordSource = 'own' | 'mixed'

export interface IcaChallengeTypeRecord {
  id: string
  name: string
  iconKey: string
  isActive: boolean
  isPlayable: boolean
  order: number
  scopes: IcaChallengeScope[]
  config: Record<string, unknown>
  kind: IcaChallengeQuestionKind | null
  format: IcaChallengeFormat | null
  maxLevelGap: number
}

export type IcaChallengePublicQuestion =
  | { kind: 'choice'; prompt: string; options: string[] }
  | { kind: 'listen'; audioText: string; options: string[] }
  | { kind: 'write'; prompt: string; hint: string }
  | { kind: 'speak'; prompt: string }
  | { kind: 'cloze'; before: string; after: string; options: string[] }
  /** Parejas: 5 palabras (izquierda) y sus significados desordenados (derecha). */
  | { kind: 'pairs'; words: string[]; options: string[] }

export interface IcaChallengeRoundInfo {
  roundNumber: number
  roundsTotal: number
  positionInRound: number
  questionsInRound: number
}

export interface IcaChallengeServedQuestion {
  index: number
  kind: IcaChallengeQuestionKind
  data: IcaChallengePublicQuestion
  language: { target: string; native: string }
  /** Tiempo que queda para responder (modos por turnos). null en el Modo Relámpago. */
  limitMs: number | null
  round: IcaChallengeRoundInfo | null
}

export interface IcaChallengeReveal {
  target: string
  native: string
  correctOptionIndex: number | null
  phrase: string | null
  phraseTranslation: string | null
}

export interface IcaChallengeProgress {
  answered: number
  correct: number
  total: number | null
  rivalAnswered: number
  rivalCorrect: number
}

export interface IcaChallengeSession {
  endsAt: string
  remainingMs: number
  totalMs: number
}

export interface IcaChallengePlayState {
  challenge: {
    id: string
    status: IcaChallengeStatus
    typeId: string
    kind: IcaChallengeQuestionKind
    format: IcaChallengeFormat
    wordSource: IcaChallengeWordSource
    rounds: number
    questionsPerRound: number
    totalQuestions: number | null
    secondsPerQuestion: number
    sessionSeconds: number | null
    isMyTurn: boolean
    turnExpiresAt: string | null
    resultType: IcaChallengeResultType
    winnerUserId: string | null
    levels: Record<string, string | null> | null
  }
  me: {
    userId: string
    answered: number
    correct: number
    done: boolean
    hasOpenQuestion: boolean
    sessionStarted: boolean
    round: IcaChallengeRoundInfo | null
  }
  rival: { userId: string; answered: number; correct: number; done: boolean }
  session: IcaChallengeSession | null
}

export type IcaChallengeStepStatus = 'question' | 'answered' | 'round_finished' | 'done'

/** Tu balance en Desafíos ICA (todos los idiomas). */
export interface IcaChallengeStats {
  played: number
  wins: number
  losses: number
  draws: number
  /** Victorias seguidas ahora mismo (una derrota o un empate la cortan). */
  currentStreak: number
  bestStreak: number
}

/** Parejas: resultado del tablero, en el orden de las palabras de la izquierda. */
export interface IcaChallengePairsResult {
  correct: boolean[]
  /** Significado correcto (índice de la columna derecha) de cada palabra. */
  solution: number[]
  /** Lo que unió el alumno (null = sin unir). */
  chosen: Array<number | null>
}

export interface IcaChallengeStep {
  status: IcaChallengeStepStatus
  question: IcaChallengeServedQuestion | null
  result: { isCorrect: boolean; timedOut: boolean; reveal: IcaChallengeReveal } | null
  /** Solo en Parejas. */
  pairs: IcaChallengePairsResult | null
  progress: IcaChallengeProgress | null
  session: IcaChallengeSession | null
  late: boolean
  /** Tras acabar una ronda: ¿sigues tú? (pasa si tu rival ya terminó). */
  isMyTurn: boolean | null
}

export interface IcaChallengeReviewItem {
  index: number
  kind: IcaChallengeQuestionKind
  target: string
  native: string
  phrase: string | null
  phraseTranslation: string | null
  isCorrect: boolean
  timedOut: boolean
  myAnswer: string | null
  fromRival: boolean
  targetLang: string | null
}

export interface IcaChallengeRivalWord {
  target: string
  native: string
  phrase: string | null
  phraseTranslation: string | null
  targetLang: string | null
}

export interface IcaChallengeReview {
  items: IcaChallengeReviewItem[]
  /** Palabras del baúl del rival (solo con el desafío terminado y cada uno con sus palabras). */
  rivalWords?: IcaChallengeRivalWord[]
  me: { correct: number; answered: number }
  rival: { correct: number; answered: number; done: boolean }
  wordSource: IcaChallengeWordSource
}

export interface IcaChallengeEnrollment {
  id: string | null
  userId: string | null
  targetLang: string
  nativeLang: string
  isActive: boolean
  createdAt: string | null
  updatedAt: string | null
}

export interface IcaOwnWordsChallengeConfig {
  rounds: 1 | 2 | 5 | 10
  responseSeconds: number
  wordSource?: IcaChallengeWordSource
}

export interface IcaTestQuestion {
  promptNative: string
  correctTarget: string
  options: string[]
  correctOptionIndex: number
  promptLexicardId: string
  optionLexicardIds: string[]
}

export interface IcaTestAnswer {
  questionIndex: number
  selectedOptionIndex: number | null
  isCorrect: boolean
  timedOut: boolean
}

export type IcaTestStatus = 'running' | 'completed' | 'failed'

export interface IcaTestRecord {
  id: string
  targetLang: string
  nativeLang: string
  testMonth: string
  monthCode: string
  status: IcaTestStatus
  score: number
  totalQuestions: number
  startedAt: string
  finalizedAt: string | null
  completedAt: string | null
  currentQuestionIndex: number
  answers: IcaTestAnswer[]
  failReason: string | null
  questions: IcaTestQuestion[]
  wordsUsed: string[]
}

export type DailyProgressMap = Record<string, DailyProgressEntry>

export interface AppConfig {
  nativeLang: string
  targetLang: string
}

export interface ActivationPhraseResult {
  phrase: string
  translation: string
  words_used?: string[]
  // Nota desafiante: trozos {target, native}. null = no se pudo dividir; undefined = prompt antiguo.
  chunks?: Array<{ target: string; native: string }> | null
}

export interface PhraseTokenInsightResult {
  translation: string
  meaning: string
  grammarTip: string
  examples: string[]
}

export interface AnthropicTextBlock {
  type: 'text'
  text: string
}

export interface AnthropicResponse {
  content?: AnthropicTextBlock[]
}

export interface BridgeStorageGetResponse {
  value: string
}

export interface BridgeStorage {
  get: (key: string) => Promise<BridgeStorageGetResponse | null>
  set: (key: string, value: string) => Promise<void>
}

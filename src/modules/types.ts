export type ImportanceKey =
  | 'vital'
  | 'frequent'
  | 'occasional'
  | 'rare'
  | 'irrelevant'

export type CEFRLevel = '0' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'

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
  level: CEFRLevel
}

export interface ActivationPhraseResult {
  phrase: string
  translation: string
  words_used?: string[]
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

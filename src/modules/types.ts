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
  score?: number
  avg_percent?: number
  review_percent?: number
  creation_percent?: number
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

export interface DailyProgressEntry {
  wordsAdded: number
  phraseGenerated: boolean
  reviewCorrect: number
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

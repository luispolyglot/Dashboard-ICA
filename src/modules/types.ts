export type ImportanceKey =
  | 'vital'
  | 'frequent'
  | 'occasional'
  | 'rare'
  | 'irrelevant'

export type CEFRLevel = '0' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'

export type AppView = 'home' | 'add' | 'review' | 'manage' | 'phrase' | 'phrases'

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
  importance: ImportanceKey
  interval: number
  easeFactor: number
  streak: number
  lastReviewed: number | null
  lastSeenSession?: number
  createdAt: number
}

export interface LeaderboardEntry {
  rank: number
  user_id: string
  username: string
  display_name: string
  score: number
}

export interface PhraseGenerationEntry {
  id: string
  source_words: string[]
  generated_phrase: string | null
  translation: string | null
  model: string | null
  created_at: string
}

export interface DailyProgressEntry {
  wordsAdded: number
  phraseGenerated: boolean
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

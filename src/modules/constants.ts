import type {
  CEFRLevel,
  DailyProgressEntry,
  DailyProgressMap,
  ImportanceKey,
  ImportanceLevel,
  ReviewMode,
} from './types'

export const IMPORTANCE_LEVELS: ImportanceLevel[] = [
  { key: 'vital', label: 'Vital', desc: 'Cada día', color: '#3B82F6', bg: '#1e3a5f', multiplier: 1 },
  { key: 'frequent', label: 'Frecuente', desc: 'Min. un par al día', color: '#22C55E', bg: '#1a3d2a', multiplier: 1.5 },
  { key: 'occasional', label: 'Ocasional', desc: 'Max. un par al día', color: '#EAB308', bg: '#3d3510', multiplier: 2 },
  { key: 'rare', label: 'Raro', desc: 'Max. un par/semana', color: '#F97316', bg: '#3d2510', multiplier: 3 },
  { key: 'irrelevant', label: 'Irrelevante', desc: 'Casi nunca', color: '#EF4444', bg: '#3d1515', multiplier: 5 },
]

export const LANGUAGES = [
  'Español', 'Inglés', 'Polaco', 'Francés', 'Alemán', 'Italiano', 'Portugués', 'Ruso', 'Chino', 'Japonés',
  'Coreano', 'Árabe', 'Turco', 'Holandés', 'Sueco', 'Noruego', 'Danés', 'Finés', 'Checo', 'Húngaro',
  'Rumano', 'Griego', 'Hindi', 'Tailandés', 'Vietnamita', 'Ucraniano', 'Catalán', 'Hebreo',
]

export const LEVELS: CEFRLevel[] = ['0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export const LEVEL_DESCRIPTIONS: Record<CEFRLevel, string> = {
  '0': 'Principiante absoluto. Solo palabras sueltas.',
  A1: 'Beginner. Present tense only, very basic vocabulary, very short sentences.',
  A2: 'Elementary. Simple grammar, common vocabulary, short clauses. No subjunctive.',
  B1: 'Intermediate. Past, present, future tenses. Moderate vocabulary. Simple opinions.',
  B2: 'Upper intermediate. Conditional, some subjunctive, idiomatic expressions.',
  C1: 'Advanced. Sophisticated grammar, nuanced vocabulary, complex clauses.',
  C2: 'Mastery. Native-like fluency. Any structure, rare vocabulary.',
}

export const LANG_CODES: Record<string, string> = {
  Español: 'es-ES', Inglés: 'en-US', Polaco: 'pl-PL', Francés: 'fr-FR', Alemán: 'de-DE', Italiano: 'it-IT',
  Portugués: 'pt-PT', Ruso: 'ru-RU', Chino: 'zh-CN', Japonés: 'ja-JP', Coreano: 'ko-KR', Árabe: 'ar-SA',
  Turco: 'tr-TR', Holandés: 'nl-NL', Sueco: 'sv-SE', Noruego: 'no-NO', Danés: 'da-DK', Finés: 'fi-FI',
  Checo: 'cs-CZ', Húngaro: 'hu-HU', Rumano: 'ro-RO', Griego: 'el-GR', Hindi: 'hi-IN', Tailandés: 'th-TH',
  Vietnamita: 'vi-VN', Ucraniano: 'uk-UA', Catalán: 'ca-ES', Hebreo: 'he-IL',
}

export const GOAL = 10
export const REVIEW_ROUND_SIZE = 10
export const CREATION_WORDS_GOAL = 5

export const REVIEW_MODE_OPTIONS: Array<{
  key: ReviewMode
  title: string
  description: string
  emoji: string
}> = [
  {
    key: 'mixed',
    title: 'Aleatorio',
    description: 'Juega con tus palabras ICA de forma aleatoria.',
    emoji: '🎲',
  },
  {
    key: 'vital',
    title: 'Vital',
    description: 'Juega con tus palabras ICA de frecuencia vital.',
    emoji: '🔵',
  },
  {
    key: 'frequent',
    title: 'Frecuente',
    description: 'Juega con tus palabras ICA de frecuencia frecuente.',
    emoji: '🟢',
  },
  {
    key: 'occasional',
    title: 'Ocasional',
    description: 'Juega con tus palabras ICA de frecuencia ocasional.',
    emoji: '🟡',
  },
  {
    key: 'rare',
    title: 'Raro',
    description: 'Juega con tus palabras ICA de frecuencia rara.',
    emoji: '🟠',
  },
  {
    key: 'irrelevant',
    title: 'Irrelevante',
    description: 'Juega con tus palabras ICA de frecuencia irrelevante.',
    emoji: '🔴',
  },
]

export const IMPORTANCE_ORDER: Record<ImportanceKey, number> = {
  vital: 0,
  frequent: 1,
  occasional: 2,
  rare: 3,
  irrelevant: 4,
}

export const MONTH_NAMES: string[] = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
export const DAY_NAMES: string[] = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export const getImportance = (key: ImportanceKey | string): ImportanceLevel =>
  IMPORTANCE_LEVELS.find((l) => l.key === key) || IMPORTANCE_LEVELS[0]

export function getTodayProgress(dailyProgress: DailyProgressMap): DailyProgressEntry {
  const d = new Date()
  const tk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const current = dailyProgress[tk]
  if (!current) {
    return { wordsAdded: 0, phraseGenerated: false, reviewCorrect: 0 }
  }

  return {
    wordsAdded: current.wordsAdded ?? 0,
    phraseGenerated: current.phraseGenerated ?? false,
    reviewCorrect: current.reviewCorrect ?? 0,
  }
}

export function isCreationDone(progress: DailyProgressEntry): boolean {
  return progress.wordsAdded >= CREATION_WORDS_GOAL && progress.phraseGenerated
}

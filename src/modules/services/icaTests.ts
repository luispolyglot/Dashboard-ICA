import { supabase } from '@/lib/supabase'
import type {
  IcaTestAnswer,
  IcaTestQuestion,
  IcaTestRecord,
  IcaTestStatus,
  Lexicard,
} from '../types'

export const ICA_TEST_TOTAL_QUESTIONS = 15
export const ICA_TEST_OPTIONS_PER_QUESTION = 4
export const ICA_TEST_SECONDS_PER_QUESTION = 6
export const ICA_TEST_REQUIRED_WORDS =
  ICA_TEST_TOTAL_QUESTIONS * ICA_TEST_OPTIONS_PER_QUESTION
export const ICA_TEST_MIN_MONTH_DATE = '2026-05-01'
export const ICA_TEST_WINDOW_START_DAY = 25
export const ICA_TEST_WINDOW_END_DAY = 28

const ICA_TESTS_TABLE_PROD =
  (import.meta.env.VITE_ICA_TESTS_TABLE as string | undefined) || 'ica_tests'
const ICA_TESTS_TABLE_DEV =
  (import.meta.env.VITE_ICA_TESTS_TABLE_DEV as string | undefined) ||
  'ica_tests_dev'
const ICA_TEST_WINDOW_START_DAY_DEV = 15

function isIcaTestsDevMode(): boolean {
  return (
    import.meta.env.DEV ||
    import.meta.env.VITE_ICA_TESTS_DEV_MODE === '1'
  )
}

function getIcaTestsTableName(): string {
  return isIcaTestsDevMode() ? ICA_TESTS_TABLE_DEV : ICA_TESTS_TABLE_PROD
}

export function getIcaTestWindowStartDay(): number {
  return isIcaTestsDevMode() ? ICA_TEST_WINDOW_START_DAY_DEV : ICA_TEST_WINDOW_START_DAY
}

type IcaTestRow = {
  id: string
  target_lang: string
  native_lang: string
  test_month: string
  status: IcaTestStatus
  score: number
  total_questions: number
  started_at: string
  finalized_at: string | null
  completed_at: string | null
  current_question_index: number
  answers_json: unknown
  fail_reason: string | null
  questions: unknown
  words_used: string[] | null
}

type StartIcaTestInput = {
  targetLang: string
  nativeLang: string
  testMonth: string
  questions: IcaTestQuestion[]
}

type PersistIcaTestAnswerInput = {
  attemptId: string
  answers: IcaTestAnswer[]
  currentQuestionIndex: number
  score: number
}

type FinalizeIcaTestInput = {
  attemptId: string
  status: Extract<IcaTestStatus, 'completed' | 'failed'>
  score: number
  currentQuestionIndex: number
  failReason?: string | null
}

export type IcaTestWordPoolResult = {
  pool: Lexicard[]
  requiredWords: number
  availableWords: number
  fromCurrentMonth: number
  fromPreviousMonth: number
  eligible: boolean
}

async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

function isValidMonthDate(value: string): boolean {
  return /^\d{4}-\d{2}-01$/.test(value)
}

function getMonthDate(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

function shiftMonthDate(monthDate: string, delta: number): string | null {
  if (!isValidMonthDate(monthDate)) return null
  const [yearRaw, monthRaw] = monthDate.split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null

  const cursor = new Date(year, month - 1, 1)
  if (Number.isNaN(cursor.getTime())) return null
  cursor.setMonth(cursor.getMonth() + delta)
  return getMonthDate(cursor.getFullYear(), cursor.getMonth() + 1)
}

function getLexicardMonthDate(value: number): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return getMonthDate(date.getFullYear(), date.getMonth() + 1)
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const next = items.slice()
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

function toMonthCode(testMonth: string): string {
  const [year, month] = testMonth.split('-')
  return `${month}${year}`
}

function parseQuestions(value: unknown): IcaTestQuestion[] {
  if (!Array.isArray(value)) return []

  const parsed: IcaTestQuestion[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue

    const record = item as Record<string, unknown>
    const options = Array.isArray(record.options)
      ? record.options.filter((entry): entry is string => typeof entry === 'string')
      : []
    const optionLexicardIds = Array.isArray(record.optionLexicardIds)
      ? record.optionLexicardIds.filter(
          (entry): entry is string => typeof entry === 'string',
        )
      : []

    const promptNative =
      typeof record.promptNative === 'string' ? record.promptNative : ''
    const correctTarget =
      typeof record.correctTarget === 'string' ? record.correctTarget : ''
    const promptLexicardId =
      typeof record.promptLexicardId === 'string' ? record.promptLexicardId : ''
    const correctOptionIndex =
      typeof record.correctOptionIndex === 'number'
        ? record.correctOptionIndex
        : -1

    if (
      !promptNative ||
      !correctTarget ||
      !promptLexicardId ||
      options.length !== ICA_TEST_OPTIONS_PER_QUESTION ||
      optionLexicardIds.length !== ICA_TEST_OPTIONS_PER_QUESTION ||
      correctOptionIndex < 0 ||
      correctOptionIndex >= options.length
    ) {
      continue
    }

    parsed.push({
      promptNative,
      correctTarget,
      options,
      correctOptionIndex,
      promptLexicardId,
      optionLexicardIds,
    })
  }

  return parsed
}

function parseAnswers(value: unknown): IcaTestAnswer[] {
  if (!Array.isArray(value)) return []

  const parsed: IcaTestAnswer[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>

    const questionIndex =
      typeof record.questionIndex === 'number' ? record.questionIndex : -1
    const selectedOptionIndex =
      typeof record.selectedOptionIndex === 'number'
        ? record.selectedOptionIndex
        : null
    const isCorrect =
      typeof record.isCorrect === 'boolean' ? record.isCorrect : false
    const timedOut = typeof record.timedOut === 'boolean' ? record.timedOut : false

    if (questionIndex < 0 || questionIndex >= ICA_TEST_TOTAL_QUESTIONS) continue

    parsed.push({
      questionIndex,
      selectedOptionIndex,
      isCorrect,
      timedOut,
    })
  }

  return parsed
}

function toIcaTestRecord(row: IcaTestRow): IcaTestRecord {
  return {
    id: row.id,
    targetLang: row.target_lang,
    nativeLang: row.native_lang,
    testMonth: row.test_month,
    monthCode: toMonthCode(row.test_month),
    status: row.status,
    score: Number(row.score ?? 0),
    totalQuestions: Number(row.total_questions ?? ICA_TEST_TOTAL_QUESTIONS),
    startedAt: row.started_at,
    finalizedAt: row.finalized_at,
    completedAt: row.completed_at,
    currentQuestionIndex: Number(row.current_question_index ?? 0),
    answers: parseAnswers(row.answers_json),
    failReason: row.fail_reason,
    questions: parseQuestions(row.questions),
    wordsUsed: Array.isArray(row.words_used)
      ? row.words_used.filter((entry): entry is string => typeof entry === 'string')
      : [],
  }
}

export function getCurrentIcaTestMonthDate(now = new Date()): string {
  return getMonthDate(now.getFullYear(), now.getMonth() + 1)
}

export function getIcaTestMonthLabel(testMonth: string): string {
  const date = new Date(`${testMonth}T00:00:00`)
  if (Number.isNaN(date.getTime())) return testMonth
  return date.toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric',
  })
}

export function getIcaTestMonthCode(testMonth: string): string {
  if (!isValidMonthDate(testMonth)) return testMonth
  return toMonthCode(testMonth)
}

export function parseIcaTestMonthCode(monthCode: string): string | null {
  if (!/^\d{6}$/.test(monthCode)) return null
  const month = Number(monthCode.slice(0, 2))
  const year = Number(monthCode.slice(2))
  if (!Number.isInteger(month) || !Number.isInteger(year)) return null
  if (month < 1 || month > 12) return null
  return getMonthDate(year, month)
}

export function isIcaTestsFeatureAvailable(now = new Date()): boolean {
  if (isIcaTestsDevMode()) return true
  return getCurrentIcaTestMonthDate(now) >= ICA_TEST_MIN_MONTH_DATE
}

export function isIcaTestWindowOpen(now = new Date()): boolean {
  const day = now.getDate()
  return day >= getIcaTestWindowStartDay() && day <= ICA_TEST_WINDOW_END_DAY
}

export function isIcaTestLaunchDay(now = new Date()): boolean {
  return now.getDate() === getIcaTestWindowStartDay()
}

export function buildIcaTestWordPool(
  cards: Lexicard[],
  testMonth: string,
): IcaTestWordPoolResult {
  const previousMonth = shiftMonthDate(testMonth, -1)
  const uniqueByTarget = new Set<string>()

  const isValidWord = (card: Lexicard): boolean => {
    const target = card.target.trim()
    const native = card.native.trim()
    return Boolean(target && native)
  }

  const toTargetKey = (card: Lexicard): string => card.target.trim().toLowerCase()

  const currentMonthCandidates = cards.filter((card) => {
    if (!isValidWord(card)) return false
    return getLexicardMonthDate(card.createdAt) === testMonth
  })

  const previousMonthCandidates = cards.filter((card) => {
    if (!previousMonth || !isValidWord(card)) return false
    return getLexicardMonthDate(card.createdAt) === previousMonth
  })

  const selected: Lexicard[] = []
  const addCard = (card: Lexicard): void => {
    if (selected.length >= ICA_TEST_REQUIRED_WORDS) return
    const key = toTargetKey(card)
    if (uniqueByTarget.has(key)) return
    uniqueByTarget.add(key)
    selected.push(card)
  }

  for (const card of currentMonthCandidates) addCard(card)
  for (const card of previousMonthCandidates) addCard(card)

  const currentMonthKeys = new Set(
    currentMonthCandidates.map((card) => toTargetKey(card)),
  )
  const fromCurrentMonth = selected.filter((card) =>
    currentMonthKeys.has(toTargetKey(card)),
  ).length
  const fromPreviousMonth = selected.length - fromCurrentMonth

  return {
    pool: selected,
    requiredWords: ICA_TEST_REQUIRED_WORDS,
    availableWords: selected.length,
    fromCurrentMonth,
    fromPreviousMonth,
    eligible: selected.length >= ICA_TEST_REQUIRED_WORDS,
  }
}

export function buildIcaTestQuestions(
  wordPool: Lexicard[],
  random: () => number = Math.random,
): IcaTestQuestion[] {
  if (wordPool.length < ICA_TEST_REQUIRED_WORDS) return []

  const shuffledPool = shuffle(wordPool, random).slice(0, ICA_TEST_REQUIRED_WORDS)
  const prompts = shuffledPool.slice(0, ICA_TEST_TOTAL_QUESTIONS)
  const distractors = shuffledPool.slice(ICA_TEST_TOTAL_QUESTIONS)

  if (
    prompts.length !== ICA_TEST_TOTAL_QUESTIONS ||
    distractors.length !==
      ICA_TEST_TOTAL_QUESTIONS * (ICA_TEST_OPTIONS_PER_QUESTION - 1)
  ) {
    return []
  }

  return prompts.map((prompt, index) => {
    const wrongOptions = distractors.slice(index * 3, index * 3 + 3)
    const optionsCards = shuffle([prompt, ...wrongOptions], random)
    const correctOptionIndex = optionsCards.findIndex(
      (card) => card.id === prompt.id,
    )

    return {
      promptNative: prompt.native,
      correctTarget: prompt.target,
      options: optionsCards.map((card) => card.target),
      correctOptionIndex,
      promptLexicardId: prompt.id,
      optionLexicardIds: optionsCards.map((card) => card.id),
    }
  })
}

export function getIcaTestWordsUsed(questions: IcaTestQuestion[]): string[] {
  const words = new Set<string>()
  for (const question of questions) {
    words.add(question.promptNative)
    for (const option of question.options) words.add(option)
  }
  return Array.from(words)
}

export async function listIcaTests(
  targetLang: string,
  nativeLang: string,
): Promise<IcaTestRecord[]> {
  if (!supabase) return []
  const userId = await getCurrentUserId()
  if (!userId) return []

  const { data, error } = await supabase
    .from(getIcaTestsTableName())
    .select(
      'id, target_lang, native_lang, test_month, status, score, total_questions, started_at, finalized_at, completed_at, current_question_index, answers_json, fail_reason, questions, words_used',
    )
    .eq('user_id', userId)
    .eq('target_lang', targetLang)
    .eq('native_lang', nativeLang)
    .order('test_month', { ascending: false })

  if (error) throw error
  return (data || []).map((row) => toIcaTestRecord(row as IcaTestRow))
}

export async function getIcaTestByMonth(
  targetLang: string,
  nativeLang: string,
  testMonth: string,
  options?: { autoFailIfRunning?: boolean },
): Promise<IcaTestRecord | null> {
  if (!supabase) return null
  if (!isValidMonthDate(testMonth)) return null
  const userId = await getCurrentUserId()
  if (!userId) return null

  const { data, error } = await supabase
    .from(getIcaTestsTableName())
    .select(
      'id, target_lang, native_lang, test_month, status, score, total_questions, started_at, finalized_at, completed_at, current_question_index, answers_json, fail_reason, questions, words_used',
    )
    .eq('user_id', userId)
    .eq('target_lang', targetLang)
    .eq('native_lang', nativeLang)
    .eq('test_month', testMonth)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const record = toIcaTestRecord(data as IcaTestRow)

  if (options?.autoFailIfRunning && record.status === 'running') {
    const failed = await finalizeIcaTestAttempt({
      attemptId: record.id,
      status: 'failed',
      score: record.score,
      currentQuestionIndex: record.currentQuestionIndex,
      failReason: 'reentry_after_exit',
    })
    return failed
  }

  return record
}

export async function startIcaTestAttempt(
  input: StartIcaTestInput,
): Promise<IcaTestRecord> {
  if (!supabase) {
    throw new Error('Falta configurar Supabase')
  }
  if (!isValidMonthDate(input.testMonth)) {
    throw new Error('Mes de test inválido')
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    throw new Error('Necesitas iniciar sesión para guardar el test ICA.')
  }

  const payload = {
    user_id: userId,
    target_lang: input.targetLang,
    native_lang: input.nativeLang,
    test_month: input.testMonth,
    status: 'running' as const,
    score: 0,
    total_questions: ICA_TEST_TOTAL_QUESTIONS,
    current_question_index: 0,
    answers_json: [] as IcaTestAnswer[],
    questions: input.questions,
    words_used: getIcaTestWordsUsed(input.questions),
    fail_reason: null,
    finalized_at: null,
    completed_at: null,
  }

  const { data, error } = await supabase
    .from(getIcaTestsTableName())
    .insert(payload)
    .select(
      'id, target_lang, native_lang, test_month, status, score, total_questions, started_at, finalized_at, completed_at, current_question_index, answers_json, fail_reason, questions, words_used',
    )
    .single()

  if (error) {
    if (error.message.includes('duplicate key')) {
      throw new Error('ICA_TEST_ALREADY_STARTED')
    }
    throw error
  }
  return toIcaTestRecord(data as IcaTestRow)
}

export async function persistIcaTestAnswer(
  input: PersistIcaTestAnswerInput,
): Promise<IcaTestRecord> {
  if (!supabase) {
    throw new Error('Falta configurar Supabase')
  }

  const payload = {
    score: Math.max(0, Math.min(ICA_TEST_TOTAL_QUESTIONS, Math.round(input.score))),
    current_question_index: Math.max(
      0,
      Math.min(ICA_TEST_TOTAL_QUESTIONS, Math.round(input.currentQuestionIndex)),
    ),
    answers_json: input.answers,
  }

  const { data, error } = await supabase
    .from(getIcaTestsTableName())
    .update(payload)
    .eq('id', input.attemptId)
    .select(
      'id, target_lang, native_lang, test_month, status, score, total_questions, started_at, finalized_at, completed_at, current_question_index, answers_json, fail_reason, questions, words_used',
    )
    .single()

  if (error) throw error
  const record = toIcaTestRecord(data as IcaTestRow)
  if (record.status !== 'running') {
    throw new Error('ICA_TEST_ATTEMPT_NOT_RUNNING')
  }
  return record
}

export async function finalizeIcaTestAttempt(
  input: FinalizeIcaTestInput,
): Promise<IcaTestRecord> {
  if (!supabase) {
    throw new Error('Falta configurar Supabase')
  }

  const payload = {
    status: input.status,
    score: Math.max(0, Math.min(ICA_TEST_TOTAL_QUESTIONS, Math.round(input.score))),
    current_question_index: Math.max(
      0,
      Math.min(ICA_TEST_TOTAL_QUESTIONS, Math.round(input.currentQuestionIndex)),
    ),
    finalized_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    fail_reason: input.status === 'failed' ? input.failReason ?? 'manual_exit' : null,
  }

  const statusFilter = input.status === 'completed' ? 'running' : null

  let query = supabase
    .from(getIcaTestsTableName())
    .update(payload)
    .eq('id', input.attemptId)

  if (statusFilter) {
    query = query.eq('status', statusFilter)
  }

  const { data, error } = await query
    .select(
      'id, target_lang, native_lang, test_month, status, score, total_questions, started_at, finalized_at, completed_at, current_question_index, answers_json, fail_reason, questions, words_used',
    )
    .single()

  if (error) throw error
  return toIcaTestRecord(data as IcaTestRow)
}

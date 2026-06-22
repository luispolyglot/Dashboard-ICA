import { CORS_HEADERS, jsonResponse } from '../_shared/http.ts'
import webpush from 'npm:web-push@3.6.7'
import {
  ensureAuthenticated,
  ensureCoachingAdmin,
  parseCoachScopes,
} from '../_shared/coaching-auth.ts'
import { countPendingMasterNotesForSession } from './pending-review.ts'
import { canManageSession } from './access-control.ts'
import {
  buildWeekActivationState,
  buildWeekTimeline,
  buildWeekWindows,
  evaluateWeekActivationRequest,
  type CoachingSessionWeekActivationRow,
  type WeekWindow,
} from './week-activation.ts'
import {
  resolveClassScheduleNotificationEvent,
  type ClassNotificationRow,
  type ClassScheduleNotificationEvent,
} from './class-notification.ts'

type CoachingCenterPayload = {
  action?: string
  sessionId?: string
  masterNoteId?: string
  feedbackLoomUrl?: string | null
  feedbackNotes?: string | null
  weekKey?: string
  closureReason?: string | null
  targetLang?: string
  userId?: string
  level?: string
  nativeLang?: string | null
  coachUserId?: string | null
  classSessions?: unknown
  feedbackNmUrl?: string | null
  feedbackNmNotes?: string | null
  weeklyObjectives?: unknown
  notes?: string | null
  isActive?: boolean
  role?: 'coach_admin' | 'super_admin'
  scopes?: unknown
}

type CoachingUserRow = {
  id: string
  user_id: string
  coach_user_id: string | null
  target_lang: string
  native_lang: string | null
  level: string
  class_sessions: unknown
  feedback_nm_url: string | null
  feedback_nm_notes: string | null
  weekly_objectives: unknown
  notes: string | null
  is_active: boolean
  status: 'draft' | 'active' | 'completed' | 'cancelled'
  activated_at: string | null
  duration_weeks: number
  created_at: string
  updated_at: string
}

type MasterNoteChunkRow = {
  id: string
  master_note_id: string
  phrase_generation_id: string | null
  storage_path: string
  sort_order: number
  duration_ms: number | null
}

type PhraseGenerationRow = {
  id: string
  generated_phrase: string | null
  translation: string | null
}

type CoachingSessionWeeklyObjectiveRow = {
  session_id: string
  week_number: number
  words_target: number | null
  nm_target: number | null
  ica_streak_objective_pct: number | null
  flashcards_streak_objective_pct: number | null
  report_exercise_url: string | null
  exercise: unknown
}

type CoachingSessionClassRow = {
  id: string
  session_id: string
  week_number: number
  title: string
  loom_url: string | null
  report: string | null
  report_image_path: string | null
  scheduled_at: string | null
  class_join_url: string | null
  created_at: string
  updated_at: string
}

type WeekProgressItem = {
  wordsCreated: number
  closedMasterNotes: number
  icaStreakPct: number
  flashcardsStreakPct: number
}

type ExerciseObjective = {
  url: string | null
  status: 'pending' | 'completed'
  completedAt: string | null
}

type CoachingClosedNoteItem = {
  id: string
  name: string
  createdAt: string
  closedAt: string
  feedbackLoomUrl: string | null
  feedbackNotes: string | null
}

type PushSubscriptionRow = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  is_active: boolean
}

function safeString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function safeInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }
  if (typeof value === 'string') {
    const normalized = value.trim()
    if (!normalized) return null
    const parsed = Number(normalized)
    if (!Number.isFinite(parsed)) return null
    return Math.trunc(parsed)
  }
  return null
}

function normalizeExerciseObjective(value: unknown): ExerciseObjective {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { url: null, status: 'pending', completedAt: null }
  }

  const record = value as Record<string, unknown>
  const url = safeString(record.url)
  const status = record.status === 'completed' ? 'completed' : 'pending'
  const completedAt = safeString(record.completedAt ?? record.completed_at)

  return {
    url,
    status: status === 'completed' && url ? 'completed' : 'pending',
    completedAt: status === 'completed' && url ? completedAt || new Date().toISOString() : null,
  }
}

function normalizeUrl(value: string | null): string | null {
  if (!value) return null
  const withProtocol = ensureUrlProtocol(value)
  if (!withProtocol) return null

  if (/loom\.com/i.test(withProtocol)) {
    return withProtocol
      .replace('/shared/', '/embed/')
      .replace('/share/', '/embed/')
  }

  return withProtocol
}

function ensureUrlProtocol(value: string | null): string | null {
  if (!value) return null
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

function normalizeIsoDateTime(value: unknown): string | null {
  const raw = safeString(value)
  if (!raw) return null
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

function buildWeekKeyFromIso(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  const week = Math.min(5, Math.max(1, Math.ceil(date.getUTCDate() / 7)))
  return `W${String(week).padStart(2, '0')}`
}

function normalizeProgramWeekKey(value: string | null): string | null {
  if (!value) return null
  const normalized = value.trim().toUpperCase()
  const directMatch = normalized.match(/^W(\d{1,2})$/)
  if (directMatch) {
    const week = Number(directMatch[1])
    if (Number.isFinite(week) && week >= 1 && week <= 12) {
      return `W${String(week).padStart(2, '0')}`
    }
  }

  const calendarMatch = normalized.match(/-S(\d)$/)
  if (calendarMatch) {
    const week = Number(calendarMatch[1])
    if (Number.isFinite(week) && week >= 1 && week <= 5) {
      return `W${String(week).padStart(2, '0')}`
    }
  }

  return null
}

function safeClassSessions(value: unknown): unknown[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => item as Record<string, unknown>)
    .map((item, index) => {
      const createdAt = safeString(item.createdAt ?? item.created_at) || new Date().toISOString()
      const weekKey =
        normalizeProgramWeekKey(
          safeString(item.key ?? item.weekKey ?? item.week_key) ||
            safeString(item.week),
        ) ||
        buildWeekKeyFromIso(createdAt) ||
        `W${String(Math.min(12, index + 1)).padStart(2, '0')}`
      const sessionId = safeString(item.id) || crypto.randomUUID()

      return {
        id: sessionId,
        key: weekKey,
        weekKey,
        title: safeString(item.title) || 'Clase semanal',
        loomUrl: normalizeUrl(safeString(item.loomUrl ?? item.loom_url)),
        report: safeString(item.report),
        reportImagePath:
          safeString(item.reportImagePath ?? item.report_image_path) || null,
        scheduledAt: normalizeIsoDateTime(item.scheduledAt ?? item.scheduled_at),
        classJoinUrl: ensureUrlProtocol(
          safeString(item.classJoinUrl ?? item.class_join_url),
        ),
        createdAt,
        updatedAt: safeString(item.updatedAt ?? item.updated_at) || new Date().toISOString(),
      }
    })
}

async function withSignedClassReportUrls(
  adminClient: { storage: { from: (bucket: string) => { createSignedUrl: (path: string, expiresIn: number) => Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }> } } },
  value: unknown,
): Promise<unknown[]> {
  const sessions = safeClassSessions(value)
  return Promise.all(
    sessions.map(async (item) => {
      const row = item as Record<string, unknown>
      const path = safeString(row.reportImagePath)
      if (!path) {
        return { ...row, reportImageUrl: null }
      }

      const { data, error } = await adminClient.storage
        .from('coaching-class-reports')
        .createSignedUrl(path, 60 * 60)

      if (error || !data?.signedUrl) {
        return { ...row, reportImageUrl: null }
      }

      return {
        ...row,
        reportImageUrl: data.signedUrl,
      }
    }),
  )
}

function safeJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function normalizeWeeklyObjectives(value: unknown): Record<string, unknown> {
  const source = safeJsonObject(value)
  const output: Record<string, unknown> = {}

  for (const [key, raw] of Object.entries(source)) {
    const normalizedWeek = normalizeProgramWeekKey(key)
    if (normalizedWeek && raw && typeof raw === 'object' && !Array.isArray(raw)) {
      output[normalizedWeek] = raw
      continue
    }

    if (
      !normalizedWeek &&
      raw &&
      typeof raw === 'object' &&
      !Array.isArray(raw)
    ) {
      output[key] = raw
    }
  }

  return output
}

function weekNumberFromKey(value: string | null, fallback = 1): number {
  const key = normalizeProgramWeekKey(value)
  if (!key) return fallback
  const parsed = Number(key.slice(1))
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(12, Math.max(1, parsed))
}

function weekKeyFromNumber(value: number): string {
  const week = Math.min(12, Math.max(1, Number.isFinite(value) ? value : 1))
  return `W${String(week).padStart(2, '0')}`
}

function toUtcDate(value: string): Date | null {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function computeWeekProgress(
  input: {
    weekWindows: WeekWindow[]
    wordCreatedAt: string[]
    closedNoteAt: string[]
    creationCompletedDays: string[]
    reviewCompletedDays: string[]
  },
): Record<string, WeekProgressItem> {
  const output: Record<string, WeekProgressItem> = {}
  if (input.weekWindows.length === 0) return output

  const wordDates = input.wordCreatedAt.map((value) => toUtcDate(value)).filter((value): value is Date => Boolean(value))
  const noteDates = input.closedNoteAt.map((value) => toUtcDate(value)).filter((value): value is Date => Boolean(value))

  for (const window of input.weekWindows) {
    const wordsCreated = wordDates.filter(
      (date) => date.getTime() >= window.start.getTime() && date.getTime() < window.end.getTime(),
    ).length

    const closedMasterNotes = noteDates.filter(
      (date) => date.getTime() >= window.start.getTime() && date.getTime() < window.end.getTime(),
    ).length

    const daySet = Array.from({ length: 7 }, (_, idx) => {
      const date = new Date(window.start.getTime() + idx * 24 * 60 * 60 * 1000)
      return date.toISOString().slice(0, 10)
    })

    const icaHits = daySet.filter((day) => input.creationCompletedDays.includes(day)).length
    const flashcardsHits = daySet.filter((day) => input.reviewCompletedDays.includes(day)).length

    output[window.weekKey] = {
      wordsCreated,
      closedMasterNotes,
      icaStreakPct: Math.round((icaHits / 7) * 100),
      flashcardsStreakPct: Math.round((flashcardsHits / 7) * 100),
    }
  }

  return output
}

async function fetchWeekProgressForSession(
  adminClient: any,
  session: { user_id: string; target_lang: string },
  activations: CoachingSessionWeekActivationRow[],
): Promise<Record<string, WeekProgressItem>> {
  const weekWindows = buildWeekWindows(activations)
  if (weekWindows.length === 0) return {}

  const firstWindow = weekWindows[0]
  const lastWindow = weekWindows[weekWindows.length - 1]
  const startIso = firstWindow.start.toISOString()
  const endIso = lastWindow.end.toISOString()
  const startDay = startIso.slice(0, 10)
  const endDay = endIso.slice(0, 10)

  const [wordsResult, notesResult, dailyResult] = await Promise.all([
    adminClient
      .from('lexicards')
      .select('created_at')
      .eq('user_id', session.user_id)
      .eq('target_lang', session.target_lang)
      .gte('created_at', startIso)
      .lt('created_at', endIso),
    adminClient
      .from('master_notes')
      .select('state, closed_at, updated_at')
      .eq('user_id', session.user_id)
      .eq('target_lang', session.target_lang)
      .eq('state', 'closed'),
    adminClient
      .from('daily_metrics')
      .select('day, creation_goal_completed, review_goal_completed')
      .eq('user_id', session.user_id)
      .gte('day', startDay)
      .lt('day', endDay),
  ])

  if (wordsResult.error || notesResult.error || dailyResult.error) {
    return {}
  }

  return computeWeekProgress({
    weekWindows,
    wordCreatedAt: (wordsResult.data || []).map((row: { created_at: string }) => row.created_at),
    closedNoteAt: (notesResult.data || []).map((row: { closed_at: string | null; updated_at: string }) => row.closed_at || row.updated_at),
    creationCompletedDays: (dailyResult.data || [])
      .filter((row: { creation_goal_completed: boolean }) => Boolean(row.creation_goal_completed))
      .map((row: { day: string }) => row.day),
    reviewCompletedDays: (dailyResult.data || [])
      .filter((row: { review_goal_completed: boolean }) => Boolean(row.review_goal_completed))
      .map((row: { day: string }) => row.day),
  })
}

async function fetchClosedNotesByWeekForSession(
  adminClient: any,
  session: {
    user_id: string
    target_lang: string
  },
  activations: CoachingSessionWeekActivationRow[],
): Promise<Record<string, CoachingClosedNoteItem[]>> {
  const output: Record<string, CoachingClosedNoteItem[]> = {}
  const weekWindows = buildWeekWindows(activations)
  if (weekWindows.length === 0) return output

  const { data, error } = await adminClient
    .from('master_notes')
    .select('id, name, state, created_at, closed_at, updated_at, coaching_feedback_loom_url, coaching_feedback_notes')
    .eq('user_id', session.user_id)
    .eq('target_lang', session.target_lang)
    .eq('state', 'closed')
    .order('created_at', { ascending: true })

  if (error) return output

  for (const row of data || []) {
    const closedAt =
      typeof row.closed_at === 'string' && row.closed_at.length > 0
        ? row.closed_at
        : typeof row.updated_at === 'string'
          ? row.updated_at
          : null

    const closedDate = closedAt ? toUtcDate(closedAt) : null
    if (!closedDate || !closedAt) continue

    const matchingWeek =
      weekWindows.find(
        (window) =>
          closedDate.getTime() >= window.start.getTime() &&
          closedDate.getTime() < window.end.getTime(),
      ) || null
    if (!matchingWeek) continue

    const weekKey = matchingWeek.weekKey
    const existing = output[weekKey] || []
    existing.push({
      id: String(row.id),
      name:
        typeof row.name === 'string' && row.name.trim().length > 0
          ? row.name
          : 'Nota Maestra: Sin titulo',
      createdAt:
        typeof row.created_at === 'string' && row.created_at.length > 0
          ? row.created_at
          : closedAt,
      closedAt,
      feedbackLoomUrl: normalizeUrl(safeString(row.coaching_feedback_loom_url)),
      feedbackNotes: safeString(row.coaching_feedback_notes),
    })
    output[weekKey] = existing
  }

  for (const weekKey of Object.keys(output)) {
    output[weekKey].sort((a, b) =>
      a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' }),
    )
  }

  return output
}

function serializeWeeklyObjectives(
  rows: CoachingSessionWeeklyObjectiveRow[],
): Record<string, unknown> {
  const output: Record<string, unknown> = {}

  for (const row of rows) {
    output[weekKeyFromNumber(row.week_number)] = {
      wordsTarget: row.words_target,
      nmTarget: row.nm_target,
      icaStreakObjectivePct: row.ica_streak_objective_pct,
      flashcardsStreakObjectivePct: row.flashcards_streak_objective_pct,
      reportExerciseUrl: row.report_exercise_url,
      exercise: normalizeExerciseObjective(row.exercise),
    }
  }

  return output
}

function serializeClassSessions(rows: CoachingSessionClassRow[]): unknown[] {
  return rows.map((row) => ({
    id: row.id,
    key: weekKeyFromNumber(row.week_number),
    weekKey: weekKeyFromNumber(row.week_number),
    title: row.title,
    loomUrl: normalizeUrl(row.loom_url),
    report: row.report,
    reportImagePath: row.report_image_path,
    scheduledAt: row.scheduled_at,
    classJoinUrl: row.class_join_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

function objectiveRowsFromPayload(
  sessionId: string,
  value: unknown,
): Array<{
  session_id: string
  week_number: number
  words_target: number | null
  nm_target: number | null
  ica_streak_objective_pct: number | null
  flashcards_streak_objective_pct: number | null
  report_exercise_url: string | null
  exercise: ExerciseObjective
}> {
  const normalized = normalizeWeeklyObjectives(value)

  return Object.entries(normalized)
    .filter(([, raw]) => raw && typeof raw === 'object' && !Array.isArray(raw))
    .map(([key, raw]) => {
      const record = raw as Record<string, unknown>
      const nextExercise = normalizeExerciseObjective(
        record.exercise ||
          (safeString(record.reportExerciseUrl)
            ? {
                url: safeString(record.reportExerciseUrl),
                status: 'pending',
                completedAt: null,
              }
            : null),
      )
      return {
        session_id: sessionId,
        week_number: weekNumberFromKey(key),
        words_target: safeInteger(record.wordsTarget),
        nm_target: safeInteger(record.nmTarget),
        ica_streak_objective_pct: safeInteger(
          record.icaStreakObjectivePct ?? record.icaStreakTargetPct,
        ),
        flashcards_streak_objective_pct: safeInteger(
          record.flashcardsStreakObjectivePct ??
            record.flashcardsStreakAchievedPct ??
            record.icaStreakAchievedPct,
        ),
        report_exercise_url: nextExercise.url,
        exercise: nextExercise,
      }
    })
}

function classRowsFromPayload(
  sessionId: string,
  value: unknown,
): Array<{
  session_id: string
  week_number: number
  title: string
  loom_url: string | null
  report: string | null
  report_image_path: string | null
  scheduled_at: string | null
  class_join_url: string | null
  created_at: string
  updated_at: string
}> {
  return safeClassSessions(value).map((item) => {
    const row = item as Record<string, unknown>
    const createdAt = safeString(row.createdAt) || new Date().toISOString()

    return {
      session_id: sessionId,
      week_number: weekNumberFromKey(
        safeString(row.key ?? row.weekKey ?? row.week) ||
          buildWeekKeyFromIso(createdAt),
      ),
      title: safeString(row.title) || 'Clase semanal',
      loom_url: normalizeUrl(safeString(row.loomUrl ?? row.loom_url)),
      report: safeString(row.report),
      report_image_path: safeString(row.reportImagePath ?? row.report_image_path),
      scheduled_at: normalizeIsoDateTime(row.scheduledAt ?? row.scheduled_at),
      class_join_url: ensureUrlProtocol(
        safeString(row.classJoinUrl ?? row.class_join_url),
      ),
      created_at: createdAt,
      updated_at: safeString(row.updatedAt) || new Date().toISOString(),
    }
  })
}

async function replaceSessionProgramData(
  adminClient: any,
  input: {
    sessionId: string
    classSessions?: unknown
    weeklyObjectives?: unknown
  },
): Promise<string | null> {
  if (typeof input.weeklyObjectives !== 'undefined') {
    const { error: deleteObjectivesError } = await adminClient
      .from('coaching_session_weekly_objectives')
      .delete()
      .eq('session_id', input.sessionId)

    if (deleteObjectivesError) return deleteObjectivesError.message

    const objectiveRows = objectiveRowsFromPayload(
      input.sessionId,
      input.weeklyObjectives,
    )

    if (objectiveRows.length > 0) {
      const { error: insertObjectivesError } = await adminClient
        .from('coaching_session_weekly_objectives')
        .insert(objectiveRows)

      if (insertObjectivesError) return insertObjectivesError.message
    }
  }

  if (typeof input.classSessions !== 'undefined') {
    const { error: deleteClassesError } = await adminClient
      .from('coaching_session_classes')
      .delete()
      .eq('session_id', input.sessionId)

    if (deleteClassesError) return deleteClassesError.message

    const classRows = classRowsFromPayload(input.sessionId, input.classSessions)
    if (classRows.length > 0) {
      const { error: insertClassesError } = await adminClient
        .from('coaching_session_classes')
        .insert(classRows)

      if (insertClassesError) return insertClassesError.message
    }
  }

  return null
}

async function fetchProgramDataBySessionIds(
  adminClient: any,
  sessionIds: string[],
): Promise<{
  weeklyObjectivesBySession: Map<string, Record<string, unknown>>
  classSessionsBySession: Map<string, unknown[]>
  error: string | null
}> {
  const weeklyObjectivesBySession = new Map<string, Record<string, unknown>>()
  const classSessionsBySession = new Map<string, unknown[]>()

  if (sessionIds.length === 0) {
    return { weeklyObjectivesBySession, classSessionsBySession, error: null }
  }

  const [weeklyResult, classesResult] = await Promise.all([
    adminClient
      .from('coaching_session_weekly_objectives')
      .select(
        'session_id, week_number, words_target, nm_target, ica_streak_objective_pct, flashcards_streak_objective_pct, report_exercise_url, exercise',
      )
      .in('session_id', sessionIds),
    adminClient
      .from('coaching_session_classes')
      .select(
        'id, session_id, week_number, title, loom_url, report, report_image_path, scheduled_at, class_join_url, created_at, updated_at',
      )
      .in('session_id', sessionIds)
      .order('created_at', { ascending: false }),
  ])

  if (weeklyResult.error || classesResult.error) {
    return {
      weeklyObjectivesBySession,
      classSessionsBySession,
      error: weeklyResult.error?.message || classesResult.error?.message || 'Program data error',
    }
  }

  const objectivesGrouped = new Map<string, CoachingSessionWeeklyObjectiveRow[]>()
  for (const row of (weeklyResult.data || []) as CoachingSessionWeeklyObjectiveRow[]) {
    const existing = objectivesGrouped.get(row.session_id) || []
    existing.push(row)
    objectivesGrouped.set(row.session_id, existing)
  }

  const classesGrouped = new Map<string, CoachingSessionClassRow[]>()
  for (const row of (classesResult.data || []) as CoachingSessionClassRow[]) {
    const existing = classesGrouped.get(row.session_id) || []
    existing.push(row)
    classesGrouped.set(row.session_id, existing)
  }

  for (const sessionId of sessionIds) {
    weeklyObjectivesBySession.set(
      sessionId,
      serializeWeeklyObjectives(objectivesGrouped.get(sessionId) || []),
    )
    classSessionsBySession.set(
      sessionId,
      serializeClassSessions(classesGrouped.get(sessionId) || []),
    )
  }

  return { weeklyObjectivesBySession, classSessionsBySession, error: null }
}

async function fetchWeekActivationsBySessionIds(
  adminClient: any,
  sessionIds: string[],
): Promise<{
  activationsBySession: Map<string, CoachingSessionWeekActivationRow[]>
  error: string | null
}> {
  const activationsBySession = new Map<string, CoachingSessionWeekActivationRow[]>()

  if (sessionIds.length === 0) {
    return { activationsBySession, error: null }
  }

  const { data, error } = await adminClient
    .from('coaching_session_week_activations')
    .select('session_id, week_number, activated_at, ended_at')
    .in('session_id', sessionIds)
    .order('week_number', { ascending: true })

  if (error) {
    return {
      activationsBySession,
      error: error.message,
    }
  }

  for (const row of (data || []) as CoachingSessionWeekActivationRow[]) {
    const existing = activationsBySession.get(row.session_id) || []
    existing.push(row)
    activationsBySession.set(row.session_id, existing)
  }

  for (const sessionId of sessionIds) {
    if (!activationsBySession.has(sessionId)) {
      activationsBySession.set(sessionId, [])
    }
  }

  return { activationsBySession, error: null }
}

async function sendCoachingActiveSessionNotification(input: {
  adminClient: any
  recipientUserId: string
  title: string
  body: string
  url: string
  tag: string
  data?: Record<string, unknown>
}): Promise<{ sent: boolean; skippedReason: string | null }> {
  const { data: preference } = await input.adminClient
    .from('user_coaching_notification_preferences')
    .select('active_session_enabled')
    .eq('user_id', input.recipientUserId)
    .maybeSingle<{ active_session_enabled: boolean }>()

  if (preference && !preference.active_session_enabled) {
    return { sent: false, skippedReason: 'notifications_disabled' }
  }

  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT')
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return { sent: false, skippedReason: 'vapid_not_configured' }
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

  const { data: subscriptions, error: subscriptionsError } = await input.adminClient
    .from('user_push_subscriptions')
    .select('id, endpoint, p256dh, auth, is_active')
    .eq('user_id', input.recipientUserId)
    .eq('is_active', true)

  if (subscriptionsError) {
    return { sent: false, skippedReason: 'subscriptions_query_failed' }
  }

  const activeSubscriptions = (subscriptions || []) as PushSubscriptionRow[]
  if (activeSubscriptions.length === 0) {
    return { sent: false, skippedReason: 'no_active_subscriptions' }
  }

  const payload = JSON.stringify({
    title: input.title,
    body: input.body,
    url: input.url,
    tag: input.tag,
    data: {
      ...(input.data || {}),
      url: input.url,
    },
  })

  let sentCount = 0
  for (const subscription of activeSubscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        payload,
      )
      sentCount += 1
    } catch {
      await input.adminClient
        .from('user_push_subscriptions')
        .update({ is_active: false, last_seen_at: new Date().toISOString() })
        .eq('id', subscription.id)
    }
  }

  return {
    sent: sentCount > 0,
    skippedReason: sentCount > 0 ? null : 'send_failed',
  }
}

function formatClassScheduleDateInTimezone(
  value: string | null,
  timezone: string | null,
): string {
  if (!value) return 'fecha pendiente'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'fecha pendiente'
  return parsed.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(timezone ? { timeZone: timezone } : {}),
  })
}

async function fetchProfileTimezone(
  adminClient: any,
  userId: string,
): Promise<string | null> {
  const { data } = await adminClient
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .maybeSingle<{ timezone: string | null }>()

  return safeString(data?.timezone) || null
}

async function logAndSendCoachingClassNotification(input: {
  adminClient: any
  sessionId: string
  userId: string
  weekNumber: number
  type: 'scheduled' | 'rescheduled' | 'reminder'
  scheduleSignature: string
  scheduledAt: string | null
  classJoinUrl: string | null
  reminderMinutes: 0 | 10 | 30 | 60
}): Promise<void> {
  const { data: createdLog, error: insertLogError } = await input.adminClient
    .from('coaching_class_schedule_notifications')
    .insert({
      session_id: input.sessionId,
      user_id: input.userId,
      week_number: input.weekNumber,
      notification_type: input.type,
      schedule_signature: input.scheduleSignature,
      reminder_minutes: input.reminderMinutes,
      scheduled_at: input.scheduledAt,
      class_join_url: input.classJoinUrl,
      status: 'pending',
      sent_at: null,
    })
    .select('id')
    .maybeSingle<{ id: number }>()

  if (insertLogError) {
    const duplicateError =
      typeof insertLogError === 'object' &&
      insertLogError &&
      'code' in insertLogError &&
      (insertLogError as { code?: string }).code === '23505'

    if (duplicateError) return
    return
  }

  const logId = createdLog?.id || null
  if (!logId) return

  const recipientTimezone = await fetchProfileTimezone(
    input.adminClient,
    input.userId,
  )

  const title = 'Coaching ICA'
  const body =
    input.type === 'scheduled'
      ? `Tu coach agendó tu clase de Semana ${input.weekNumber} para ${formatClassScheduleDateInTimezone(input.scheduledAt, recipientTimezone)}.`
      : input.type === 'rescheduled'
        ? `Tu coach reprogramó tu clase de Semana ${input.weekNumber} para ${formatClassScheduleDateInTimezone(input.scheduledAt, recipientTimezone)}.`
        : `Tu clase de coaching empieza en ${input.reminderMinutes} minutos.`

  const notificationType =
    input.type === 'scheduled'
      ? 'coaching-class-scheduled'
      : input.type === 'rescheduled'
        ? 'coaching-class-rescheduled'
        : 'coaching-class-reminder'

  const sendResult = await sendCoachingActiveSessionNotification({
    adminClient: input.adminClient,
    recipientUserId: input.userId,
    title,
    body,
    url: '/coaching-personalized',
    tag: `coaching-class-${input.type}-${input.sessionId}-${input.weekNumber}-${input.reminderMinutes}`,
    data: {
      type: notificationType,
      sessionId: input.sessionId,
      weekNumber: input.weekNumber,
      scheduledAt: input.scheduledAt,
      classJoinUrl: input.classJoinUrl,
      reminderMinutes: input.reminderMinutes,
    },
  })

  await input.adminClient
    .from('coaching_class_schedule_notifications')
    .update({
      status: sendResult.sent ? 'sent' : 'skipped',
      error_message: sendResult.sent ? null : sendResult.skippedReason,
      sent_at: sendResult.sent ? new Date().toISOString() : null,
    })
    .eq('id', logId)
}

async function enqueueCoachingClassReminderNotification(input: {
  adminClient: any
  sessionId: string
  userId: string
  weekNumber: number
  scheduleSignature: string
  scheduledAt: string | null
  classJoinUrl: string | null
  reminderMinutes: 10 | 30 | 60
}): Promise<void> {
  const { error } = await input.adminClient
    .from('coaching_class_schedule_notifications')
    .insert({
      session_id: input.sessionId,
      user_id: input.userId,
      week_number: input.weekNumber,
      notification_type: 'reminder',
      schedule_signature: input.scheduleSignature,
      reminder_minutes: input.reminderMinutes,
      scheduled_at: input.scheduledAt,
      class_join_url: input.classJoinUrl,
      status: 'pending',
      sent_at: null,
    })

  if (!error) return

  const isDuplicate =
    typeof error === 'object' &&
    error &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  if (isDuplicate) return
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const auth = await ensureAuthenticated(req)
  if (!auth.ok) return auth.response

  let payload: CoachingCenterPayload
  try {
    payload = (await req.json()) as CoachingCenterPayload
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  const action = safeString(payload.action)
  if (!action) {
    return jsonResponse(400, { error: 'Missing action' })
  }

  if (action === 'my-dashboard') {
    let query = auth.adminClient
      .from('coaching_sessions')
      .select('*')
      .eq('user_id', auth.userId)
      .eq('is_active', true)
      .eq('status', 'active')
      .not('activated_at', 'is', null)
      .order('updated_at', { ascending: false })

    const targetLang = safeString(payload.targetLang)
    if (targetLang) {
      query = query.eq('target_lang', targetLang)
    }

    const { data, error } = await query

    if (error) {
      return jsonResponse(500, { error: error.message })
    }

    const rows = (data || []) as CoachingUserRow[]
    const coachIds = Array.from(
      new Set(rows.map((row) => row.coach_user_id).filter((value): value is string => Boolean(value))),
    )

    let coachesById = new Map<string, string>()
    if (coachIds.length > 0) {
      const { data: coachProfiles } = await auth.adminClient
        .from('profiles')
        .select('id, display_name, username')
        .in('id', coachIds)

      coachesById = new Map(
        (coachProfiles || []).map((row) => {
          const name =
            typeof row.display_name === 'string' && row.display_name.trim().length > 0
              ? row.display_name
              : typeof row.username === 'string' && row.username.trim().length > 0
                ? row.username
                : 'Coach'
          return [String(row.id), name]
        }),
      )
    }

    const sessionIds = rows.map((row) => row.id)
    const programData = await fetchProgramDataBySessionIds(
      auth.adminClient,
      sessionIds,
    )
    if (programData.error) {
      return jsonResponse(500, { error: programData.error })
    }

    const activationsData = await fetchWeekActivationsBySessionIds(
      auth.adminClient,
      sessionIds,
    )
    if (activationsData.error) {
      return jsonResponse(500, { error: activationsData.error })
    }

    const memberships = await Promise.all(
      rows.map(async (row) => {
        const weeklyObjectives = programData.weeklyObjectivesBySession.get(row.id) || {}
        const sessionActivations = activationsData.activationsBySession.get(row.id) || []
        const weekActivation = buildWeekActivationState(
          sessionActivations,
          weeklyObjectives,
        )
        const weekTimeline = buildWeekTimeline(sessionActivations)
        const weekProgress = await fetchWeekProgressForSession(
          auth.adminClient,
          row,
          sessionActivations,
        )
        const closedMasterNotesByWeek = await fetchClosedNotesByWeekForSession(
          auth.adminClient,
          row,
          sessionActivations,
        )
        return {
          id: row.id,
          userId: row.user_id,
          createdAt: row.created_at,
          coachUserId: row.coach_user_id,
          coachDisplayName: row.coach_user_id ? coachesById.get(row.coach_user_id) || 'Coach' : null,
          targetLang: row.target_lang,
          nativeLang: row.native_lang,
          level: row.level,
          classSessions: await withSignedClassReportUrls(
            auth.adminClient as any,
            programData.classSessionsBySession.get(row.id) || [],
          ),
          feedbackNmUrl: row.feedback_nm_url,
          feedbackNmNotes: row.feedback_nm_notes,
          weeklyObjectives,
          notes: row.notes,
          status: row.status,
          activatedAt: row.activated_at,
          durationWeeks: row.duration_weeks,
          weekActivation,
          weekTimeline,
          weekProgress,
          closedMasterNotesByWeek,
          updatedAt: row.updated_at,
        }
      }),
    )

    return jsonResponse(200, { memberships })
  }

  if (action === 'complete-exercise-objective') {
    const sessionId = safeString(payload.sessionId)
    const weekKey = normalizeProgramWeekKey(safeString(payload.weekKey))
    if (!sessionId || !weekKey) {
      return jsonResponse(400, { error: 'sessionId and weekKey are required' })
    }

    const weekNumber = weekNumberFromKey(weekKey)

    const { data: sessionRow, error: sessionError } = await auth.adminClient
      .from('coaching_sessions')
      .select('id, user_id')
      .eq('id', sessionId)
      .eq('user_id', auth.userId)
      .eq('status', 'active')
      .maybeSingle<{
        id: string
        user_id: string
      }>()

    if (sessionError) {
      return jsonResponse(500, { error: sessionError.message })
    }
    if (!sessionRow) {
      return jsonResponse(403, { error: 'Forbidden' })
    }

    const { data: activationRows, error: activationError } = await auth.adminClient
      .from('coaching_session_week_activations')
      .select('session_id, week_number, activated_at, ended_at')
      .eq('session_id', sessionId)
      .order('week_number', { ascending: true })

    if (activationError) {
      return jsonResponse(500, { error: activationError.message })
    }

    const weekActivation = buildWeekActivationState(
      (activationRows || []) as CoachingSessionWeekActivationRow[],
      {},
    )

    if (!weekActivation.currentActiveWeek || weekNumber !== weekActivation.currentActiveWeek) {
      return jsonResponse(400, { error: 'Exercise completion is only allowed during its assigned week' })
    }

    const { data: objectiveRow, error: objectiveError } = await auth.adminClient
      .from('coaching_session_weekly_objectives')
      .select('exercise, report_exercise_url')
      .eq('session_id', sessionId)
      .eq('week_number', weekNumber)
      .maybeSingle<{ exercise: unknown; report_exercise_url: string | null }>()

    if (objectiveError) {
      return jsonResponse(500, { error: objectiveError.message })
    }

    const normalizedExercise = normalizeExerciseObjective(
      objectiveRow?.exercise ||
        (safeString(objectiveRow?.report_exercise_url)
          ? {
              url: safeString(objectiveRow?.report_exercise_url),
              status: 'pending',
              completedAt: null,
            }
          : null),
    )

    if (!normalizedExercise.url) {
      return jsonResponse(400, { error: 'Exercise objective link is missing' })
    }

    const completedExercise: ExerciseObjective = {
      ...normalizedExercise,
      status: 'completed',
      completedAt: new Date().toISOString(),
    }

    const { error: upsertError } = await auth.adminClient
      .from('coaching_session_weekly_objectives')
      .upsert(
        {
          session_id: sessionId,
          week_number: weekNumber,
          report_exercise_url: completedExercise.url,
          exercise: completedExercise,
        },
        { onConflict: 'session_id,week_number' },
      )

    if (upsertError) {
      return jsonResponse(500, { error: upsertError.message })
    }

    return jsonResponse(200, { ok: true })
  }

  const admin = await ensureCoachingAdmin(req)
  if (!admin.ok) return admin.response

  if (action === 'list-users') {
    const { data, error } = await admin.adminClient
      .from('coaching_sessions')
      .select('*')
      .order('updated_at', { ascending: false })

    if (error) {
      return jsonResponse(500, { error: error.message })
    }

    const visibleRows = ((data || []) as CoachingUserRow[]).filter((row) =>
      canManageSession(admin, row.coach_user_id),
    )

    const profileIds = Array.from(
      new Set(
        visibleRows
          .flatMap((row) => [row.user_id, row.coach_user_id])
          .filter((value): value is string => Boolean(value)),
      ),
    )

    const settingsUserIds = Array.from(new Set(visibleRows.map((row) => row.user_id)))
    const [profilesResult, settingsResult] = await Promise.all([
      profileIds.length > 0
        ? admin.adminClient
            .from('profiles')
            .select('id, display_name, username')
            .in('id', profileIds)
        : Promise.resolve({ data: [], error: null }),
      settingsUserIds.length > 0
        ? admin.adminClient
            .from('user_settings')
            .select('user_id, target_lang, native_lang, cefr_level')
            .in('user_id', settingsUserIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    if (profilesResult.error || settingsResult.error) {
      return jsonResponse(500, { error: profilesResult.error?.message || settingsResult.error?.message })
    }

    const profilesById = new Map(
      (profilesResult.data || []).map((row) => {
        const displayName =
          typeof row.display_name === 'string' && row.display_name.trim().length > 0
            ? row.display_name
            : typeof row.username === 'string' && row.username.trim().length > 0
              ? row.username
              : 'Usuario'
        return [String(row.id), displayName]
      }),
    )

    const settingsByUserId = new Map(
      (settingsResult.data || []).map((row) => [String(row.user_id), row]),
    )

    const sessionIds = visibleRows.map((row) => row.id)
    const userIds = Array.from(new Set(visibleRows.map((row) => row.user_id)))
    const programData = await fetchProgramDataBySessionIds(
      admin.adminClient,
      sessionIds,
    )
    if (programData.error) {
      return jsonResponse(500, { error: programData.error })
    }

    const activationsData = await fetchWeekActivationsBySessionIds(
      admin.adminClient,
      sessionIds,
    )
    if (activationsData.error) {
      return jsonResponse(500, { error: activationsData.error })
    }

    const pendingReviewNotes: Array<{
      userId: string
      targetLang: string
      closedAt: string | null
      updatedAt: string | null
      feedbackLoomUrl: string | null
      feedbackNotes: string | null
    }> = []
    if (userIds.length > 0) {
      const { data: notesData, error: notesError } = await admin.adminClient
        .from('master_notes')
        .select('user_id, target_lang, closed_at, updated_at, coaching_feedback_loom_url, coaching_feedback_notes')
        .in('user_id', userIds)
        .eq('state', 'closed')

      if (notesError) {
        return jsonResponse(500, { error: notesError.message })
      }

      for (const note of notesData || []) {
        const userId = String(note.user_id)
        const targetLang = String(note.target_lang || '').trim().toLowerCase()
        if (!targetLang) continue

        pendingReviewNotes.push({
          userId,
          targetLang,
          closedAt: safeString((note as { closed_at?: unknown }).closed_at),
          updatedAt: safeString((note as { updated_at?: unknown }).updated_at),
          feedbackLoomUrl: safeString(note.coaching_feedback_loom_url),
          feedbackNotes: safeString(note.coaching_feedback_notes),
        })
      }
    }

    const rows = await Promise.all(
      visibleRows.map(async (row) => {
        const weeklyObjectives = programData.weeklyObjectivesBySession.get(row.id) || {}
        const sessionActivations = activationsData.activationsBySession.get(row.id) || []
        const weekActivation = buildWeekActivationState(
          sessionActivations,
          weeklyObjectives,
        )
        const weekTimeline = buildWeekTimeline(sessionActivations)
        const activatedWeekWindows = buildWeekWindows(sessionActivations).map((window) => ({
          startAt: window.start.toISOString(),
          endAt: window.end.toISOString(),
        }))
        const activeSettings = settingsByUserId.get(row.user_id)
        const pendingReviewCount = countPendingMasterNotesForSession(
          {
            userId: row.user_id,
            targetLang: row.target_lang,
            activatedAt: row.activated_at,
            durationWeeks: row.duration_weeks || 12,
            activatedWeekWindows,
          },
          pendingReviewNotes,
        )
        return {
          id: row.id,
          userId: row.user_id,
          userDisplayName: profilesById.get(row.user_id) || 'Usuario',
          coachUserId: row.coach_user_id,
          coachDisplayName: row.coach_user_id ? profilesById.get(row.coach_user_id) || 'Coach' : null,
          targetLang: row.target_lang,
          nativeLang: row.native_lang,
          level: row.level,
          classSessions: await withSignedClassReportUrls(
            admin.adminClient as any,
            programData.classSessionsBySession.get(row.id) || [],
          ),
          feedbackNmUrl: row.feedback_nm_url,
          feedbackNmNotes: row.feedback_nm_notes,
          weeklyObjectives,
          notes: row.notes,
          isActive: row.is_active,
          status: row.status,
          activatedAt: row.activated_at,
          durationWeeks: row.duration_weeks,
          weekActivation,
          weekTimeline,
          updatedAt: row.updated_at,
          activeTargetLang: activeSettings?.target_lang || null,
          activeNativeLang: activeSettings?.native_lang || null,
          activeLevel: activeSettings?.cefr_level || null,
          hasPendingMasterNotesReview: pendingReviewCount > 0,
          pendingMasterNotesReviewCount: pendingReviewCount,
        }
      }),
    )

    return jsonResponse(200, { rows })
  }

  if (action === 'list-available-users') {
    if (admin.adminRole !== 'super_admin') {
      return jsonResponse(403, { error: 'Forbidden' })
    }

    const [profilesResult, settingsResult, trackersResult, cardsResult, coachedResult] = await Promise.all([
      admin.adminClient
        .from('profiles')
        .select('id, display_name, username, created_at')
        .order('created_at', { ascending: false })
        .limit(1200),
      admin.adminClient
        .from('user_settings')
        .select('user_id, target_lang, native_lang, cefr_level'),
      admin.adminClient
        .from('user_meta_tracker')
        .select('user_id, target_lang, native_lang'),
      admin.adminClient
        .from('lexicards')
        .select('user_id, target_lang, native_lang')
        .not('target_lang', 'is', null)
        .limit(20000),
      admin.adminClient
        .from('coaching_sessions')
        .select('user_id, target_lang')
        .eq('is_active', true)
        .in('status', ['draft', 'active']),
    ])

    if (
      profilesResult.error ||
      settingsResult.error ||
      trackersResult.error ||
      cardsResult.error ||
      coachedResult.error
    ) {
      return jsonResponse(500, {
        error:
          profilesResult.error?.message ||
          settingsResult.error?.message ||
          trackersResult.error?.message ||
          cardsResult.error?.message ||
          coachedResult.error?.message,
      })
    }

    const settingsByUserId = new Map<string, { targetLang: string; nativeLang: string; level: string }>()
    for (const row of settingsResult.data || []) {
      const userId = String(row.user_id)
      const targetLang = String(row.target_lang || '').trim()
      if (!targetLang) continue

      settingsByUserId.set(userId, {
        targetLang,
        nativeLang: String(row.native_lang || ''),
        level: String(row.cefr_level || 'A2'),
      })
    }

    const languagesByUserId = new Map<string, Map<string, { targetLang: string; nativeLang: string; level: string }>>()

    const ensureLanguage = (
      userId: string,
      targetLangRaw: unknown,
      nativeLangRaw: unknown,
      levelRaw?: unknown,
    ) => {
      const targetLang = String(targetLangRaw || '').trim()
      if (!targetLang) return

      const key = targetLang.toLowerCase()
      const perUser = languagesByUserId.get(userId) || new Map()
      if (perUser.has(key)) {
        const current = perUser.get(key)
        if (!current) return
        if (!current.nativeLang && typeof nativeLangRaw === 'string' && nativeLangRaw.trim().length > 0) {
          current.nativeLang = nativeLangRaw.trim()
          perUser.set(key, current)
        }
        return
      }

      const fallbackSetting = settingsByUserId.get(userId)
      perUser.set(key, {
        targetLang,
        nativeLang:
          typeof nativeLangRaw === 'string' && nativeLangRaw.trim().length > 0
            ? nativeLangRaw.trim()
            : fallbackSetting?.nativeLang || '',
        level:
          typeof levelRaw === 'string' && levelRaw.trim().length > 0
            ? levelRaw.trim()
            : targetLang.toLowerCase() === fallbackSetting?.targetLang.toLowerCase()
              ? fallbackSetting.level
              : 'A2',
      })
      languagesByUserId.set(userId, perUser)
    }

    for (const row of settingsResult.data || []) {
      ensureLanguage(String(row.user_id), row.target_lang, row.native_lang, row.cefr_level)
    }

    for (const row of trackersResult.data || []) {
      ensureLanguage(String(row.user_id), row.target_lang, row.native_lang)
    }

    for (const row of cardsResult.data || []) {
      ensureLanguage(String(row.user_id), row.target_lang, row.native_lang)
    }

    const coachedPairs = new Set(
      (coachedResult.data || []).map((row) => `${String(row.user_id)}::${String(row.target_lang).toLowerCase()}`),
    )

    const rows = (profilesResult.data || []).flatMap((profile) => {
      const userId = String(profile.id)
      const displayName =
        typeof profile.display_name === 'string' && profile.display_name.trim().length > 0
          ? profile.display_name
          : typeof profile.username === 'string' && profile.username.trim().length > 0
            ? profile.username
            : 'Usuario'

      const userLanguages = Array.from((languagesByUserId.get(userId) || new Map()).values())
      if (userLanguages.length === 0) return []

      return userLanguages
        .map((language) => ({
          userId,
          userDisplayName: displayName,
          targetLang: language.targetLang,
          nativeLang: language.nativeLang,
          activeLevel: language.level,
          alreadyInCoaching: coachedPairs.has(`${userId}::${language.targetLang.toLowerCase()}`),
        }))
    })

    return jsonResponse(200, { rows })
  }

  if (action === 'upsert-user') {
    const sessionId = safeString(payload.sessionId)
    const userId = safeString(payload.userId)
    const targetLang = safeString(payload.targetLang)
    const level = safeString(payload.level) || 'A2'
    const hasClassSessions = typeof payload.classSessions !== 'undefined'
    const hasWeeklyObjectives = typeof payload.weeklyObjectives !== 'undefined'
    const classSessions = hasClassSessions
      ? safeClassSessions(payload.classSessions)
      : undefined
    const weeklyObjectives = hasWeeklyObjectives
      ? normalizeWeeklyObjectives(payload.weeklyObjectives)
      : undefined
    const requestedCoachUserId = safeString(payload.coachUserId)

    if (sessionId) {
      const { data: existingRow, error: existingError } = await admin.adminClient
        .from('coaching_sessions')
        .select('id, user_id, target_lang, level, status, coach_user_id')
        .eq('id', sessionId)
        .maybeSingle<{
          id: string
          user_id: string
          target_lang: string
          level: string
          status: string
          coach_user_id: string | null
        }>()

      if (existingError) {
        return jsonResponse(500, { error: existingError.message })
      }
      if (!existingRow) {
        return jsonResponse(404, { error: 'Coaching session not found' })
      }

      if (!canManageSession(admin, existingRow.coach_user_id)) {
        return jsonResponse(403, { error: 'Forbidden for selected session' })
      }

      const coachUserId =
        admin.adminRole === 'super_admin'
          ? requestedCoachUserId || existingRow.coach_user_id
          : admin.userId

      let classScheduleEvent: ClassScheduleNotificationEvent | null = null
      if (hasClassSessions && classSessions && existingRow.status === 'active') {
        const [existingClassesResult, activationRowsResult] = await Promise.all([
          admin.adminClient
            .from('coaching_session_classes')
            .select(
              'week_number, loom_url, report, report_image_path, scheduled_at, class_join_url, created_at',
            )
            .eq('session_id', sessionId)
            .order('created_at', { ascending: false }),
          admin.adminClient
            .from('coaching_session_week_activations')
            .select('session_id, week_number, activated_at, ended_at')
            .eq('session_id', sessionId)
            .order('week_number', { ascending: true }),
        ])

        if (existingClassesResult.error || activationRowsResult.error) {
          return jsonResponse(500, {
            error:
              existingClassesResult.error?.message ||
              activationRowsResult.error?.message ||
              'No se pudo validar notificaciones de clase.',
          })
        }

        const activationState = buildWeekActivationState(
          (activationRowsResult.data || []) as CoachingSessionWeekActivationRow[],
          {},
        )

        classScheduleEvent = resolveClassScheduleNotificationEvent({
          activeWeekNumber: activationState.currentActiveWeek,
          previousRows: (existingClassesResult.data || []) as ClassNotificationRow[],
          nextRows: classRowsFromPayload(
            sessionId,
            classSessions,
          ) as ClassNotificationRow[],
        })
      }

      const updatePayload: Record<string, unknown> = {
        coach_user_id: coachUserId,
        native_lang: safeString(payload.nativeLang),
        level,
        feedback_nm_url: safeString(payload.feedbackNmUrl),
        feedback_nm_notes: safeString(payload.feedbackNmNotes),
        notes: safeString(payload.notes),
        is_active: typeof payload.isActive === 'boolean' ? payload.isActive : true,
      }

      if (hasClassSessions) updatePayload.class_sessions = classSessions
      if (hasWeeklyObjectives) updatePayload.weekly_objectives = weeklyObjectives

      const { data, error } = await admin.adminClient
        .from('coaching_sessions')
        .update(updatePayload)
        .eq('id', sessionId)
        .select('id')
        .maybeSingle<{ id: string }>()

      if (error) {
        return jsonResponse(500, { error: error.message })
      }

      const programWriteError = await replaceSessionProgramData(admin.adminClient, {
        sessionId,
        classSessions: hasClassSessions ? classSessions : undefined,
        weeklyObjectives: hasWeeklyObjectives ? weeklyObjectives : undefined,
      })

      if (programWriteError) {
        return jsonResponse(500, { error: programWriteError })
      }

      if (classScheduleEvent) {
        await logAndSendCoachingClassNotification({
          adminClient: admin.adminClient,
          sessionId,
          userId: existingRow.user_id,
          weekNumber: classScheduleEvent.weekNumber,
          type: classScheduleEvent.type,
          scheduleSignature: classScheduleEvent.scheduleSignature,
          scheduledAt: classScheduleEvent.scheduledAt,
          classJoinUrl: classScheduleEvent.classJoinUrl,
          reminderMinutes: 0,
        })

        const { data: preferences } = await admin.adminClient
          .from('user_coaching_notification_preferences')
          .select('class_schedule_reminder_minutes')
          .eq('user_id', existingRow.user_id)
          .maybeSingle<{
            class_schedule_reminder_minutes: number
          }>()

        const reminderMinutesRaw =
          preferences?.class_schedule_reminder_minutes ?? 30
        const reminderMinutes: 10 | 30 | 60 =
          reminderMinutesRaw === 10 ||
          reminderMinutesRaw === 60 ||
          reminderMinutesRaw === 30
            ? reminderMinutesRaw
            : 30

        await enqueueCoachingClassReminderNotification({
          adminClient: admin.adminClient,
          sessionId,
          userId: existingRow.user_id,
          weekNumber: classScheduleEvent.weekNumber,
          scheduleSignature: classScheduleEvent.scheduleSignature,
          scheduledAt: classScheduleEvent.scheduledAt,
          classJoinUrl: classScheduleEvent.classJoinUrl,
          reminderMinutes,
        })
      }

      return jsonResponse(200, { ok: true, id: data?.id || null })
    }

    if (!userId || !targetLang) {
      return jsonResponse(400, { error: 'userId and targetLang are required' })
    }

    if (admin.adminRole !== 'super_admin') {
      return jsonResponse(403, { error: 'Only super admins can create coaching sessions' })
    }

    if (!requestedCoachUserId) {
      return jsonResponse(400, { error: 'coachUserId is required' })
    }

    const coachUserId = requestedCoachUserId

    const { data, error } = await admin.adminClient
      .from('coaching_sessions')
      .insert({
        user_id: userId,
        coach_user_id: coachUserId,
        target_lang: targetLang,
        native_lang: safeString(payload.nativeLang),
        level,
        ...(hasClassSessions ? { class_sessions: classSessions } : {}),
        feedback_nm_url: safeString(payload.feedbackNmUrl),
        feedback_nm_notes: safeString(payload.feedbackNmNotes),
        ...(hasWeeklyObjectives ? { weekly_objectives: weeklyObjectives } : {}),
        notes: safeString(payload.notes),
        is_active: typeof payload.isActive === 'boolean' ? payload.isActive : true,
        status: 'draft',
        activated_at: null,
        duration_weeks: 12,
      })
      .select('id')
      .maybeSingle<{ id: string }>()

    if (error) {
      return jsonResponse(500, { error: error.message })
    }

    if (data?.id) {
      const programWriteError = await replaceSessionProgramData(admin.adminClient, {
        sessionId: data.id,
        classSessions: hasClassSessions ? classSessions : undefined,
        weeklyObjectives: hasWeeklyObjectives ? weeklyObjectives : undefined,
      })

      if (programWriteError) {
        return jsonResponse(500, { error: programWriteError })
      }
    }

    return jsonResponse(200, { ok: true, id: data?.id || null })
  }

  if (action === 'activate-session') {
    const sessionId = safeString(payload.sessionId)
    if (!sessionId) {
      return jsonResponse(400, { error: 'sessionId is required' })
    }

    const { data: row, error: rowError } = await admin.adminClient
      .from('coaching_sessions')
      .select('id, target_lang, level, status, coach_user_id')
      .eq('id', sessionId)
      .maybeSingle<{ id: string; target_lang: string; level: string; status: string; coach_user_id: string | null }>()

    if (rowError) {
      return jsonResponse(500, { error: rowError.message })
    }
    if (!row) {
      return jsonResponse(404, { error: 'Coaching session not found' })
    }

    if (!canManageSession(admin, row.coach_user_id)) {
      return jsonResponse(403, { error: 'Forbidden' })
    }

    const { error } = await admin.adminClient
      .from('coaching_sessions')
      .update({
        status: 'active',
        activated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)

    if (error) {
      return jsonResponse(500, { error: error.message })
    }

    return jsonResponse(200, { ok: true })
  }

  if (action === 'activate-week') {
    const sessionId = safeString(payload.sessionId)
    const weekKey = normalizeProgramWeekKey(safeString(payload.weekKey))
    if (!sessionId || !weekKey) {
      return jsonResponse(400, { error: 'sessionId and weekKey are required' })
    }

    const weekNumber = weekNumberFromKey(weekKey)

    const { data: sessionRow, error: sessionError } = await admin.adminClient
      .from('coaching_sessions')
      .select('id, user_id, status, coach_user_id')
      .eq('id', sessionId)
      .maybeSingle<{
        id: string
        user_id: string
        status: string
        coach_user_id: string | null
      }>()

    if (sessionError) {
      return jsonResponse(500, { error: sessionError.message })
    }
    if (!sessionRow) {
      return jsonResponse(404, { error: 'Coaching session not found' })
    }
    if (!canManageSession(admin, sessionRow.coach_user_id)) {
      return jsonResponse(403, { error: 'Forbidden' })
    }
    if (sessionRow.status !== 'active') {
      return jsonResponse(400, { error: 'Session is not active' })
    }

    const programData = await fetchProgramDataBySessionIds(admin.adminClient, [sessionId])
    if (programData.error) {
      return jsonResponse(500, { error: programData.error })
    }
    const weeklyObjectives = programData.weeklyObjectivesBySession.get(sessionId) || {}

    const { data: currentActivations, error: currentActivationsError } = await admin.adminClient
      .from('coaching_session_week_activations')
      .select('session_id, week_number, activated_at, ended_at')
      .eq('session_id', sessionId)
      .order('week_number', { ascending: true })

    if (currentActivationsError) {
      return jsonResponse(500, { error: currentActivationsError.message })
    }

    const existingRows = (currentActivations || []) as CoachingSessionWeekActivationRow[]
    const activationDecision = evaluateWeekActivationRequest({
      weekNumber,
      activations: existingRows,
      weeklyObjectives,
    })

    if (!activationDecision.ok && activationDecision.reason === 'missing_objectives') {
      return jsonResponse(400, {
        error: 'Weekly objectives are required before activation',
      })
    }

    if (
      !activationDecision.ok &&
      activationDecision.reason === 'previous_week_not_finished'
    ) {
      return jsonResponse(400, { error: 'Previous week is not finished' })
    }

    if (!activationDecision.ok && activationDecision.reason === 'week_out_of_range') {
      return jsonResponse(400, { error: 'Invalid week number' })
    }

    const didActivateWeek = activationDecision.ok

    if (didActivateWeek) {
      const { error: insertError } = await admin.adminClient
        .from('coaching_session_week_activations')
        .insert({
          session_id: sessionId,
          week_number: weekNumber,
          activated_at: new Date().toISOString(),
          activated_by: admin.userId,
        })

      if (insertError) {
        return jsonResponse(500, { error: insertError.message })
      }

      await sendCoachingActiveSessionNotification({
        adminClient: admin.adminClient,
        recipientUserId: sessionRow.user_id,
        title: 'Coaching ICA',
        body: `Tu coach activó la Semana ${weekNumber} de tu programa.`,
        url: '/coaching-personalized',
        tag: `coaching-week-activated-${sessionId}-${weekNumber}`,
        data: {
          type: 'coaching-week-activated',
          sessionId,
          weekKey,
          weekNumber,
        },
      })
    }

    const { data: latestRows, error: latestError } = await admin.adminClient
      .from('coaching_session_week_activations')
      .select('session_id, week_number, activated_at, ended_at')
      .eq('session_id', sessionId)
      .order('week_number', { ascending: true })

    if (latestError) {
      return jsonResponse(500, { error: latestError.message })
    }

    const latestActivations = (latestRows || []) as CoachingSessionWeekActivationRow[]
    const state = buildWeekActivationState(latestActivations, weeklyObjectives)
    const activatedRow = latestActivations.find((row) => row.week_number === weekNumber)

    return jsonResponse(200, {
      ok: true,
      activatedWeek: weekKeyFromNumber(weekNumber),
      activatedAt: activatedRow?.activated_at || new Date().toISOString(),
      weekActivation: state,
    })
  }

  if (action === 'close-week') {
    const sessionId = safeString(payload.sessionId)
    if (!sessionId) {
      return jsonResponse(400, { error: 'sessionId is required' })
    }

    const { data: sessionRow, error: sessionError } = await admin.adminClient
      .from('coaching_sessions')
      .select('id, status, coach_user_id')
      .eq('id', sessionId)
      .maybeSingle<{ id: string; status: string; coach_user_id: string | null }>()

    if (sessionError) {
      return jsonResponse(500, { error: sessionError.message })
    }
    if (!sessionRow) {
      return jsonResponse(404, { error: 'Coaching session not found' })
    }
    if (!canManageSession(admin, sessionRow.coach_user_id)) {
      return jsonResponse(403, { error: 'Forbidden' })
    }
    if (sessionRow.status !== 'active') {
      return jsonResponse(400, { error: 'Session is not active' })
    }

    const { data: activationRows, error: activationError } = await admin.adminClient
      .from('coaching_session_week_activations')
      .select('session_id, week_number, activated_at, ended_at')
      .eq('session_id', sessionId)
      .order('week_number', { ascending: true })

    if (activationError) {
      return jsonResponse(500, { error: activationError.message })
    }

    const windows = buildWeekWindows(
      (activationRows || []) as CoachingSessionWeekActivationRow[],
    )
    const activeWindow = [...windows].reverse().find((window) => !window.isFinished) || null
    if (!activeWindow) {
      return jsonResponse(400, { error: 'No active week to close' })
    }

    const nowIso = new Date().toISOString()
    const { error: closeWeekError } = await admin.adminClient
      .from('coaching_session_week_activations')
      .update({ ended_at: nowIso })
      .eq('session_id', sessionId)
      .eq('week_number', activeWindow.weekNumber)

    if (closeWeekError) {
      return jsonResponse(500, { error: closeWeekError.message })
    }

    const { data: latestRows, error: latestError } = await admin.adminClient
      .from('coaching_session_week_activations')
      .select('session_id, week_number, activated_at, ended_at')
      .eq('session_id', sessionId)
      .order('week_number', { ascending: true })

    if (latestError) {
      return jsonResponse(500, { error: latestError.message })
    }

    const programData = await fetchProgramDataBySessionIds(admin.adminClient, [sessionId])
    if (programData.error) {
      return jsonResponse(500, { error: programData.error })
    }
    const weeklyObjectives = programData.weeklyObjectivesBySession.get(sessionId) || {}

    return jsonResponse(200, {
      ok: true,
      closedWeek: activeWindow.weekKey,
      closedAt: nowIso,
      weekActivation: buildWeekActivationState(
        (latestRows || []) as CoachingSessionWeekActivationRow[],
        weeklyObjectives,
      ),
    })
  }

  if (action === 'archive-session' || action === 'delete-session') {
    const sessionId = safeString(payload.sessionId)
    if (!sessionId) {
      return jsonResponse(400, { error: 'sessionId is required' })
    }

    const { data: row, error: rowError } = await admin.adminClient
      .from('coaching_sessions')
      .select('id, target_lang, level, coach_user_id')
      .eq('id', sessionId)
      .maybeSingle<{ id: string; target_lang: string; level: string; coach_user_id: string | null }>()

    if (rowError) {
      return jsonResponse(500, { error: rowError.message })
    }
    if (!row) {
      return jsonResponse(404, { error: 'Coaching session not found' })
    }

    if (!canManageSession(admin, row.coach_user_id)) {
      return jsonResponse(403, { error: 'Forbidden' })
    }

    const { error } = await admin.adminClient
      .from('coaching_sessions')
      .update({
        is_active: false,
        status: 'cancelled',
        archived_at: new Date().toISOString(),
      })
      .eq('id', sessionId)

    if (error) {
      return jsonResponse(500, { error: error.message })
    }

    return jsonResponse(200, { ok: true })
  }

  if (action === 'hard-delete-session') {
    const sessionId = safeString(payload.sessionId)
    if (!sessionId) {
      return jsonResponse(400, { error: 'sessionId is required' })
    }

    const { data: row, error: rowError } = await admin.adminClient
      .from('coaching_sessions')
      .select('id, target_lang, level, coach_user_id')
      .eq('id', sessionId)
      .maybeSingle<{ id: string; target_lang: string; level: string; coach_user_id: string | null }>()

    if (rowError) {
      return jsonResponse(500, { error: rowError.message })
    }
    if (!row) {
      return jsonResponse(404, { error: 'Coaching session not found' })
    }

    if (!canManageSession(admin, row.coach_user_id)) {
      return jsonResponse(403, { error: 'Forbidden' })
    }

    const { data: classRows } = await admin.adminClient
      .from('coaching_session_classes')
      .select('report_image_path')
      .eq('session_id', sessionId)

    const reportPaths = (classRows || [])
      .map((item) => safeString((item as { report_image_path?: unknown }).report_image_path))
      .filter((value): value is string => Boolean(value))

    if (reportPaths.length > 0) {
      await admin.adminClient.storage.from('coaching-class-reports').remove(reportPaths)
    }

    const { error } = await admin.adminClient
      .from('coaching_sessions')
      .delete()
      .eq('id', sessionId)

    if (error) {
      return jsonResponse(500, { error: error.message })
    }

    return jsonResponse(200, { ok: true })
  }

  if (action === 'close-session') {
    const sessionId = safeString(payload.sessionId)
    if (!sessionId) {
      return jsonResponse(400, { error: 'sessionId is required' })
    }

    const { data: row, error: rowError } = await admin.adminClient
      .from('coaching_sessions')
      .select('id, user_id, coach_user_id, target_lang, level, activated_at, duration_weeks, status')
      .eq('id', sessionId)
      .maybeSingle<{
        id: string
        user_id: string
        coach_user_id: string | null
        target_lang: string
        level: string
        activated_at: string | null
        duration_weeks: number
        status: string
      }>()

    if (rowError) {
      return jsonResponse(500, { error: rowError.message })
    }
    if (!row) {
      return jsonResponse(404, { error: 'Coaching session not found' })
    }

    if (!canManageSession(admin, row.coach_user_id)) {
      return jsonResponse(403, { error: 'Forbidden' })
    }

    if (row.status === 'draft') {
      return jsonResponse(400, { error: 'Draft session cannot be closed' })
    }

    const nowIso = new Date().toISOString()

    const { data: activationRows, error: activationError } = await admin.adminClient
      .from('coaching_session_week_activations')
      .select('session_id, week_number, activated_at, ended_at')
      .eq('session_id', sessionId)

    if (activationError) {
      return jsonResponse(500, { error: activationError.message })
    }

    const completedWeeks = buildWeekWindows(
      (activationRows || []) as CoachingSessionWeekActivationRow[],
    ).filter((window) => window.isFinished).length

    const [objectiveCount, classCount] = await Promise.all([
      admin.adminClient
        .from('coaching_session_weekly_objectives')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', sessionId),
      admin.adminClient
        .from('coaching_session_classes')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', sessionId),
    ])

    if (objectiveCount.error || classCount.error) {
      return jsonResponse(500, {
        error: objectiveCount.error?.message || classCount.error?.message,
      })
    }

    const summary = {
      objectiveWeeksConfigured: objectiveCount.count || 0,
      classesRecorded: classCount.count || 0,
      closedEarly: completedWeeks < 12,
      closedBy: admin.userId,
    }

    const { error: closureError } = await admin.adminClient
      .from('coaching_session_closures')
      .upsert(
        {
          session_id: row.id,
          user_id: row.user_id,
          coach_user_id: row.coach_user_id,
          target_lang: row.target_lang,
          level: row.level,
          started_at: row.activated_at,
          closed_at: nowIso,
          completed_weeks: completedWeeks,
          total_weeks: 12,
          closure_reason: safeString(payload.closureReason),
          summary,
        },
        { onConflict: 'session_id' },
      )

    if (closureError) {
      return jsonResponse(500, { error: closureError.message })
    }

    const { error } = await admin.adminClient
      .from('coaching_sessions')
      .update({
        status: 'completed',
        closed_at: nowIso,
        is_active: false,
      })
      .eq('id', sessionId)

    if (error) {
      return jsonResponse(500, { error: error.message })
    }

    return jsonResponse(200, { ok: true, completedWeeks })
  }

  if (action === 'upsert-master-note-feedback-loom') {
    const sessionId = safeString(payload.sessionId)
    const masterNoteId = safeString(payload.masterNoteId)
    if (!sessionId || !masterNoteId) {
      return jsonResponse(400, { error: 'sessionId and masterNoteId are required' })
    }

    const { data: sessionRow, error: sessionError } = await admin.adminClient
      .from('coaching_sessions')
      .select('id, user_id, target_lang, level, coach_user_id')
      .eq('id', sessionId)
      .maybeSingle<{ id: string; user_id: string; target_lang: string; level: string; coach_user_id: string | null }>()

    if (sessionError) {
      return jsonResponse(500, { error: sessionError.message })
    }
    if (!sessionRow) {
      return jsonResponse(404, { error: 'Coaching session not found' })
    }
    if (!canManageSession(admin, sessionRow.coach_user_id)) {
      return jsonResponse(403, { error: 'Forbidden' })
    }

    const { data: noteRow, error: noteError } = await admin.adminClient
      .from('master_notes')
      .select('id, user_id, name, coaching_feedback_loom_url, coaching_feedback_notes')
      .eq('id', masterNoteId)
      .maybeSingle<{
        id: string
        user_id: string
        name: string | null
        coaching_feedback_loom_url: string | null
        coaching_feedback_notes: string | null
      }>()

    if (noteError) {
      return jsonResponse(500, { error: noteError.message })
    }
    if (!noteRow) {
      return jsonResponse(404, { error: 'Master note not found' })
    }
    if (noteRow.user_id !== sessionRow.user_id) {
      return jsonResponse(403, { error: 'Master note does not belong to this session user' })
    }

    const nextFeedbackLoomUrl = normalizeUrl(safeString(payload.feedbackLoomUrl))
    const nextFeedbackNotes = safeString(payload.feedbackNotes)
    const hadFeedback =
      Boolean(safeString(noteRow.coaching_feedback_loom_url)) ||
      Boolean(safeString(noteRow.coaching_feedback_notes))
    const hasFeedbackAfter =
      Boolean(nextFeedbackLoomUrl) || Boolean(nextFeedbackNotes)
    const shouldNotifyStudent = !hadFeedback && hasFeedbackAfter

    const { error: updateError } = await admin.adminClient
      .from('master_notes')
      .update({
        coaching_feedback_loom_url: nextFeedbackLoomUrl,
        coaching_feedback_notes: nextFeedbackNotes,
      })
      .eq('id', masterNoteId)

    if (updateError) {
      return jsonResponse(500, { error: updateError.message })
    }

    if (shouldNotifyStudent) {
      await sendCoachingActiveSessionNotification({
        adminClient: admin.adminClient,
        recipientUserId: sessionRow.user_id,
        title: 'Coaching ICA',
        body: `Tu coach dejó feedback en ${noteRow.name || 'tu nota maestra'}.`,
        url: '/coaching-personalized',
        tag: `coaching-feedback-${sessionId}-${masterNoteId}`,
        data: {
          type: 'coaching-master-note-feedback',
          sessionId,
          masterNoteId,
        },
      })
    }

    return jsonResponse(200, { ok: true })
  }

  if (action === 'get-user-insights') {
    const sessionId = safeString(payload.sessionId)
    const userId = safeString(payload.userId)
    if (!userId) {
      return jsonResponse(400, { error: 'userId is required' })
    }

    const requestedTargetLang = safeString(payload.targetLang)
    let coachingQuery = admin.adminClient
      .from('coaching_sessions')
      .select('id, target_lang, level, activated_at, duration_weeks, coach_user_id')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)

    if (admin.adminRole !== 'super_admin') {
      coachingQuery = coachingQuery.eq('coach_user_id', admin.userId)
    }

    if (sessionId) {
      coachingQuery = coachingQuery.eq('id', sessionId)
    } else {
      coachingQuery = coachingQuery.eq('user_id', userId)
      if (requestedTargetLang) {
        coachingQuery = coachingQuery.eq('target_lang', requestedTargetLang)
      }
    }

    const { data: coachingRows, error: coachingError } = await coachingQuery
    if (coachingError) {
      return jsonResponse(500, { error: coachingError.message })
    }

    const coachingRow = (coachingRows || [])[0]
    if (!coachingRow) {
      return jsonResponse(404, { error: 'Coaching user not found' })
    }

    if (!canManageSession(admin, coachingRow.coach_user_id || null)) {
      return jsonResponse(403, { error: 'Forbidden' })
    }

    const programData = await fetchProgramDataBySessionIds(admin.adminClient, [coachingRow.id])
    if (programData.error) {
      return jsonResponse(500, { error: programData.error })
    }

    const activationsData = await fetchWeekActivationsBySessionIds(
      admin.adminClient,
      [coachingRow.id],
    )
    if (activationsData.error) {
      return jsonResponse(500, { error: activationsData.error })
    }

    const sessionActivations = activationsData.activationsBySession.get(coachingRow.id) || []
    const weeklyObjectives = programData.weeklyObjectivesBySession.get(coachingRow.id) || {}
    const weekActivation = buildWeekActivationState(
      sessionActivations,
      weeklyObjectives,
    )
    const weekTimeline = buildWeekTimeline(sessionActivations)

    const weekProgress = await fetchWeekProgressForSession(admin.adminClient, {
      user_id: userId,
      target_lang: String(coachingRow.target_lang),
    }, sessionActivations)
    const closedMasterNotesByWeek = await fetchClosedNotesByWeekForSession(
      admin.adminClient,
      {
        user_id: userId,
        target_lang: String(coachingRow.target_lang),
      },
      sessionActivations,
    )

    const targetLang = requestedTargetLang || String(coachingRow.target_lang)

    const [wordCountResult, wordsResult, notesCountResult, notesResult] = await Promise.all([
      admin.adminClient
        .from('lexicards')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('target_lang', targetLang),
      admin.adminClient
        .from('lexicards')
        .select('id, target, native, importance, created_at')
        .eq('user_id', userId)
        .eq('target_lang', targetLang)
        .order('created_at', { ascending: false })
        .limit(5000),
      admin.adminClient
        .from('master_notes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('target_lang', targetLang),
      admin.adminClient
        .from('master_notes')
        .select('id, name, state, total_duration_ms, created_at, updated_at, closed_at, final_audio_path, coaching_feedback_loom_url, coaching_feedback_notes')
        .eq('user_id', userId)
        .eq('target_lang', targetLang)
        .order('created_at', { ascending: false })
        .limit(1000),
    ])

    const error =
      wordCountResult.error || wordsResult.error || notesCountResult.error || notesResult.error
    if (error) {
      return jsonResponse(500, { error: error.message })
    }

    const noteIds = (notesResult.data || []).map((note) => String(note.id))
    let chunksByNoteId = new Map<string, MasterNoteChunkRow[]>()
    const phraseById = new Map<string, PhraseGenerationRow>()

    if (noteIds.length > 0) {
      const { data: chunksData, error: chunksError } = await admin.adminClient
        .from('master_note_chunks')
        .select('id, master_note_id, phrase_generation_id, storage_path, sort_order, duration_ms')
        .eq('user_id', userId)
        .in('master_note_id', noteIds)
        .order('sort_order', { ascending: true })

      if (chunksError) {
        return jsonResponse(500, { error: chunksError.message })
      }

      for (const chunk of (chunksData || []) as MasterNoteChunkRow[]) {
        const existing = chunksByNoteId.get(chunk.master_note_id) || []
        existing.push(chunk)
        chunksByNoteId.set(chunk.master_note_id, existing)
      }

      const phraseIds = Array.from(new Set(
        ((chunksData || []) as MasterNoteChunkRow[])
          .map((chunk) => safeString(chunk.phrase_generation_id))
          .filter(Boolean),
      ))

      if (phraseIds.length > 0) {
        const { data: phraseRows, error: phraseError } = await admin.adminClient
          .from('phrase_generations')
          .select('id, generated_phrase, translation')
          .in('id', phraseIds)

        if (phraseError) {
          return jsonResponse(500, { error: phraseError.message })
        }

        for (const phrase of (phraseRows || []) as PhraseGenerationRow[]) {
          phraseById.set(phrase.id, phrase)
        }
      }
    }

    const notesWithAudio = await Promise.all(
      (notesResult.data || []).map(async (note) => {
        const path = typeof note.final_audio_path === 'string' ? note.final_audio_path : null
        const noteChunks = chunksByNoteId.get(String(note.id)) || []
        const baseNote = {
          ...note,
          coachingFeedbackLoomUrl: normalizeUrl(
            safeString((note as { coaching_feedback_loom_url?: unknown }).coaching_feedback_loom_url),
          ),
          coachingFeedbackNotes: safeString(
            (note as { coaching_feedback_notes?: unknown }).coaching_feedback_notes,
          ),
        }

        const chunkItems = await Promise.all(
          noteChunks.map(async (chunk) => {
            const { data: signedChunkData, error: signedChunkError } = await admin.adminClient.storage
              .from('master-notes')
              .createSignedUrl(chunk.storage_path, 60 * 60)

            const phraseId = safeString(chunk.phrase_generation_id)
            const phrase = phraseById.get(phraseId)

            return {
              id: chunk.id,
              storage_path: chunk.storage_path,
              phrase_generation_id: phraseId || null,
              generated_phrase: phrase?.generated_phrase || null,
              translation: phrase?.translation || null,
              sort_order: chunk.sort_order,
              duration_ms: chunk.duration_ms,
              audioUrl: signedChunkError || !signedChunkData?.signedUrl ? null : signedChunkData.signedUrl,
            }
          }),
        )

        if (!path) {
          return {
            ...baseNote,
            audioUrl: chunkItems.find((item) => Boolean(item.audioUrl))?.audioUrl || null,
            audioChunks: chunkItems,
          }
        }

        const { data: signedData, error: signedError } = await admin.adminClient.storage
          .from('master-notes')
          .createSignedUrl(path, 60 * 60)

        if (signedError || !signedData?.signedUrl) {
          return {
            ...baseNote,
            audioUrl: chunkItems.find((item) => Boolean(item.audioUrl))?.audioUrl || null,
            audioChunks: chunkItems,
          }
        }

        return {
          ...baseNote,
          audioUrl: signedData.signedUrl,
          audioChunks: chunkItems,
        }
      }),
    )

    return jsonResponse(200, {
      targetLang,
      wordsCount: wordCountResult.count || 0,
      words: wordsResult.data || [],
      masterNotesCount: notesCountResult.count || 0,
      masterNotes: notesWithAudio,
      sessionId: coachingRow.id,
      weeklyObjectives,
      closedMasterNotesByWeek,
      weekActivation,
      weekTimeline,
      weekProgress,
    })
  }

  if (action === 'get-user-memberships') {
    const userId = safeString(payload.userId)
    if (!userId) {
      return jsonResponse(400, { error: 'userId is required' })
    }

    const { data: profileRow } = await admin.adminClient
      .from('profiles')
      .select('display_name, username')
      .eq('id', userId)
      .maybeSingle<{ display_name: string | null; username: string | null }>()

    const userDisplayName =
      (profileRow?.display_name || '').trim() ||
      (profileRow?.username || '').trim() ||
      'Usuario'

    const { data, error } = await admin.adminClient
      .from('coaching_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })

    if (error) {
      return jsonResponse(500, { error: error.message })
    }

    const visibleRows = ((data || []) as CoachingUserRow[]).filter((row) =>
      canManageSession(admin, row.coach_user_id),
    )

    const coachIds = Array.from(
      new Set(
        visibleRows
          .map((row) => row.coach_user_id)
          .filter((value): value is string => Boolean(value)),
      ),
    )

    const coachesById = new Map<string, string>()
    if (coachIds.length > 0) {
      const { data: coachProfiles } = await admin.adminClient
        .from('profiles')
        .select('id, display_name, username')
        .in('id', coachIds)

      for (const row of coachProfiles || []) {
        const displayName =
          typeof row.display_name === 'string' && row.display_name.trim().length > 0
            ? row.display_name
            : typeof row.username === 'string' && row.username.trim().length > 0
              ? row.username
              : 'Coach'
        coachesById.set(String(row.id), displayName)
      }
    }

    const sessionIds = visibleRows.map((row) => row.id)
    const programData = await fetchProgramDataBySessionIds(
      admin.adminClient,
      sessionIds,
    )
    if (programData.error) {
      return jsonResponse(500, { error: programData.error })
    }

    const activationsData = await fetchWeekActivationsBySessionIds(
      admin.adminClient,
      sessionIds,
    )
    if (activationsData.error) {
      return jsonResponse(500, { error: activationsData.error })
    }

    const rows = await Promise.all(
      visibleRows.map(async (row) => ({
        weekTimeline: buildWeekTimeline(
          activationsData.activationsBySession.get(row.id) || [],
        ),
        weekActivation: buildWeekActivationState(
          activationsData.activationsBySession.get(row.id) || [],
          programData.weeklyObjectivesBySession.get(row.id) || {},
        ),
        id: row.id,
        userId: row.user_id,
        userDisplayName,
        coachUserId: row.coach_user_id,
        coachDisplayName: row.coach_user_id ? coachesById.get(row.coach_user_id) || 'Coach' : null,
        createdAt: row.created_at,
        targetLang: row.target_lang,
        nativeLang: row.native_lang,
        level: row.level,
        classSessions: await withSignedClassReportUrls(
          admin.adminClient as any,
          programData.classSessionsBySession.get(row.id) || [],
        ),
        feedbackNmUrl: row.feedback_nm_url,
        feedbackNmNotes: row.feedback_nm_notes,
        weeklyObjectives: programData.weeklyObjectivesBySession.get(row.id) || {},
        notes: row.notes,
        isActive: row.is_active,
        status: row.status,
        activatedAt: row.activated_at,
        durationWeeks: row.duration_weeks,
        updatedAt: row.updated_at,
      })),
    )

    return jsonResponse(200, { rows })
  }

  if (action === 'list-admins') {
    if (admin.adminRole !== 'super_admin') {
      return jsonResponse(403, { error: 'Forbidden' })
    }

    const { data, error } = await admin.adminClient
      .from('admins_coaching')
      .select('user_id, role, coach_scopes, is_active, created_by, created_at, updated_at')
      .order('created_at', { ascending: false })

    if (error) {
      return jsonResponse(500, { error: error.message })
    }

    const profileIds = Array.from(
      new Set(
        (data || [])
          .flatMap((row) => [row.user_id, row.created_by])
          .filter((value): value is string => Boolean(value)),
      ),
    )

    let profilesById = new Map<string, string>()
    if (profileIds.length > 0) {
      const { data: profiles } = await admin.adminClient
        .from('profiles')
        .select('id, display_name, username')
        .in('id', profileIds)

      profilesById = new Map(
        (profiles || []).map((row) => {
          const displayName =
            typeof row.display_name === 'string' && row.display_name.trim().length > 0
              ? row.display_name
              : typeof row.username === 'string' && row.username.trim().length > 0
                ? row.username
                : 'Usuario'
          return [String(row.id), displayName]
        }),
      )
    }

    return jsonResponse(200, {
      rows: (data || []).map((row) => ({
        userId: row.user_id,
        userDisplayName: profilesById.get(row.user_id) || 'Usuario',
        role: row.role,
        scopes: parseCoachScopes(row.coach_scopes),
        isActive: row.is_active,
        createdBy: row.created_by,
        createdByDisplayName: row.created_by ? profilesById.get(row.created_by) || null : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    })
  }

  if (action === 'upsert-admin') {
    if (admin.adminRole !== 'super_admin') {
      return jsonResponse(403, { error: 'Forbidden' })
    }

    const userId = safeString(payload.userId)
    const role = payload.role
    if (!userId || (role !== 'coach_admin' && role !== 'super_admin')) {
      return jsonResponse(400, { error: 'Invalid admin payload' })
    }

    const scopes = parseCoachScopes(payload.scopes)
    const isActive = typeof payload.isActive === 'boolean' ? payload.isActive : true

    const { error } = await admin.adminClient
      .from('admins_coaching')
      .upsert(
        {
          user_id: userId,
          role,
          coach_scopes: scopes,
          is_active: isActive,
          created_by: admin.userId,
        },
        { onConflict: 'user_id' },
      )

    if (error) {
      return jsonResponse(500, { error: error.message })
    }

    return jsonResponse(200, { ok: true })
  }

  return jsonResponse(400, { error: 'Unknown action' })
})

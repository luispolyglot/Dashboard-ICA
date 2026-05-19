import { CORS_HEADERS, jsonResponse } from '../_shared/http.ts'
import {
  ensureAuthenticated,
  ensureCoachingAdmin,
  parseCoachScopes,
  scopeAllows,
} from '../_shared/coaching-auth.ts'

type CoachingCenterPayload = {
  action?: string
  sessionId?: string
  masterNoteId?: string
  feedbackLoomUrl?: string | null
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
  storage_path: string
  sort_order: number
  duration_ms: number | null
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
  closedAt: string
  feedbackLoomUrl: string | null
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
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`

  if (/loom\.com/i.test(withProtocol)) {
    return withProtocol
      .replace('/shared/', '/embed/')
      .replace('/share/', '/embed/')
  }

  return withProtocol
}

function getWeekFromActivatedAt(
  activatedAt: string | null,
  referenceAt: string | null,
  durationWeeks = 12,
): number | null {
  if (!activatedAt || !referenceAt) return null
  const activated = toUtcDate(activatedAt)
  const reference = toUtcDate(referenceAt)
  if (!activated || !reference) return null

  const week =
    Math.floor((reference.getTime() - activated.getTime()) / (7 * 24 * 60 * 60 * 1000)) +
    1
  if (!Number.isFinite(week) || week < 1 || week > durationWeeks) return null
  return week
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
    activatedAt: string | null
    durationWeeks: number
    wordCreatedAt: string[]
    closedNoteAt: string[]
    creationCompletedDays: string[]
    reviewCompletedDays: string[]
  },
): Record<string, WeekProgressItem> {
  const activated = input.activatedAt ? toUtcDate(input.activatedAt) : null
  if (!activated) return {}

  const duration = Math.min(12, Math.max(1, input.durationWeeks || 12))
  const output: Record<string, WeekProgressItem> = {}

  const wordDates = input.wordCreatedAt.map((value) => toUtcDate(value)).filter((value): value is Date => Boolean(value))
  const noteDates = input.closedNoteAt.map((value) => toUtcDate(value)).filter((value): value is Date => Boolean(value))

  for (let week = 1; week <= duration; week += 1) {
    const start = new Date(activated.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000)
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)

    const wordsCreated = wordDates.filter(
      (date) => date.getTime() >= start.getTime() && date.getTime() < end.getTime(),
    ).length

    const closedMasterNotes = noteDates.filter(
      (date) => date.getTime() >= start.getTime() && date.getTime() < end.getTime(),
    ).length

    const daySet = Array.from({ length: 7 }, (_, idx) => {
      const date = new Date(start.getTime() + idx * 24 * 60 * 60 * 1000)
      return date.toISOString().slice(0, 10)
    })

    const icaHits = daySet.filter((day) => input.creationCompletedDays.includes(day)).length
    const flashcardsHits = daySet.filter((day) => input.reviewCompletedDays.includes(day)).length

    output[weekKeyFromNumber(week)] = {
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
  session: { user_id: string; target_lang: string; activated_at: string | null; duration_weeks: number },
): Promise<Record<string, WeekProgressItem>> {
  if (!session.activated_at) return {}

  const activated = toUtcDate(session.activated_at)
  if (!activated) return {}

  const end = new Date(
    activated.getTime() + (Math.min(12, Math.max(1, session.duration_weeks || 12)) * 7 * 24 * 60 * 60 * 1000),
  )

  const startIso = activated.toISOString()
  const endIso = end.toISOString()
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
    activatedAt: session.activated_at,
    durationWeeks: session.duration_weeks,
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
    activated_at: string | null
    duration_weeks: number
  },
): Promise<Record<string, CoachingClosedNoteItem[]>> {
  const output: Record<string, CoachingClosedNoteItem[]> = {}
  if (!session.activated_at) return output

  const activated = toUtcDate(session.activated_at)
  if (!activated) return output

  const duration = Math.min(12, Math.max(1, session.duration_weeks || 12))

  const { data, error } = await adminClient
    .from('master_notes')
    .select('id, name, state, closed_at, updated_at, coaching_feedback_loom_url')
    .eq('user_id', session.user_id)
    .eq('target_lang', session.target_lang)
    .eq('state', 'closed')
    .order('updated_at', { ascending: false })

  if (error) return output

  for (const row of data || []) {
    const closedAt =
      typeof row.closed_at === 'string' && row.closed_at.length > 0
        ? row.closed_at
        : typeof row.updated_at === 'string'
          ? row.updated_at
          : null

    const week = getWeekFromActivatedAt(session.activated_at, closedAt, duration)
    if (!week || !closedAt) continue
    const weekKey = weekKeyFromNumber(week)
    const existing = output[weekKey] || []
    existing.push({
      id: String(row.id),
      name:
        typeof row.name === 'string' && row.name.trim().length > 0
          ? row.name
          : 'Nota Maestra: Sin titulo',
      closedAt,
      feedbackLoomUrl: normalizeUrl(safeString(row.coaching_feedback_loom_url)),
    })
    output[weekKey] = existing
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
        'id, session_id, week_number, title, loom_url, report, report_image_path, created_at, updated_at',
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

    const memberships = await Promise.all(
      rows.map(async (row) => {
        const weekProgress = await fetchWeekProgressForSession(auth.adminClient, row)
        const closedMasterNotesByWeek = await fetchClosedNotesByWeekForSession(
          auth.adminClient,
          row,
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
          weeklyObjectives: programData.weeklyObjectivesBySession.get(row.id) || {},
          notes: row.notes,
          status: row.status,
          activatedAt: row.activated_at,
          durationWeeks: row.duration_weeks,
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
      .select('id, user_id, activated_at, duration_weeks')
      .eq('id', sessionId)
      .eq('user_id', auth.userId)
      .eq('status', 'active')
      .maybeSingle<{
        id: string
        user_id: string
        activated_at: string | null
        duration_weeks: number
      }>()

    if (sessionError) {
      return jsonResponse(500, { error: sessionError.message })
    }
    if (!sessionRow) {
      return jsonResponse(403, { error: 'Forbidden' })
    }

    const durationWeeks = Math.min(12, Math.max(1, sessionRow.duration_weeks || 12))
    const currentProgramWeek = getWeekFromActivatedAt(
      sessionRow.activated_at,
      new Date().toISOString(),
      durationWeeks,
    )

    if (!currentProgramWeek) {
      return jsonResponse(400, { error: 'Exercise completion is only allowed during its assigned week' })
    }

    if (weekNumber !== currentProgramWeek) {
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
      scopeAllows(admin.adminRole, admin.scopes, row.target_lang, row.level),
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
    const programData = await fetchProgramDataBySessionIds(
      admin.adminClient,
      sessionIds,
    )
    if (programData.error) {
      return jsonResponse(500, { error: programData.error })
    }

    const rows = await Promise.all(
      visibleRows.map(async (row) => {
        const activeSettings = settingsByUserId.get(row.user_id)
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
          weeklyObjectives: programData.weeklyObjectivesBySession.get(row.id) || {},
          notes: row.notes,
          isActive: row.is_active,
          status: row.status,
          activatedAt: row.activated_at,
          durationWeeks: row.duration_weeks,
          updatedAt: row.updated_at,
          activeTargetLang: activeSettings?.target_lang || null,
          activeNativeLang: activeSettings?.native_lang || null,
          activeLevel: activeSettings?.cefr_level || null,
        }
      }),
    )

    return jsonResponse(200, { rows })
  }

  if (action === 'list-available-users') {
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
        .filter((language) =>
          scopeAllows(admin.adminRole, admin.scopes, language.targetLang, language.level),
        )
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
    const coachUserId =
      admin.adminRole === 'super_admin'
        ? safeString(payload.coachUserId) || admin.userId
        : admin.userId

    if (sessionId) {
      const { data: existingRow, error: existingError } = await admin.adminClient
        .from('coaching_sessions')
        .select('id, target_lang, level')
        .eq('id', sessionId)
        .maybeSingle<{ id: string; target_lang: string; level: string }>()

      if (existingError) {
        return jsonResponse(500, { error: existingError.message })
      }
      if (!existingRow) {
        return jsonResponse(404, { error: 'Coaching session not found' })
      }

      if (
        !scopeAllows(
          admin.adminRole,
          admin.scopes,
          existingRow.target_lang,
          existingRow.level,
        )
      ) {
        return jsonResponse(403, { error: 'Forbidden for selected language/level scope' })
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

      return jsonResponse(200, { ok: true, id: data?.id || null })
    }

    if (!userId || !targetLang) {
      return jsonResponse(400, { error: 'userId and targetLang are required' })
    }

    if (!scopeAllows(admin.adminRole, admin.scopes, targetLang, level)) {
      return jsonResponse(403, { error: 'Forbidden for selected language/level scope' })
    }

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
      .select('id, target_lang, level, status')
      .eq('id', sessionId)
      .maybeSingle<{ id: string; target_lang: string; level: string; status: string }>()

    if (rowError) {
      return jsonResponse(500, { error: rowError.message })
    }
    if (!row) {
      return jsonResponse(404, { error: 'Coaching session not found' })
    }

    if (!scopeAllows(admin.adminRole, admin.scopes, row.target_lang, row.level)) {
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

  if (action === 'archive-session' || action === 'delete-session') {
    const sessionId = safeString(payload.sessionId)
    if (!sessionId) {
      return jsonResponse(400, { error: 'sessionId is required' })
    }

    const { data: row, error: rowError } = await admin.adminClient
      .from('coaching_sessions')
      .select('id, target_lang, level')
      .eq('id', sessionId)
      .maybeSingle<{ id: string; target_lang: string; level: string }>()

    if (rowError) {
      return jsonResponse(500, { error: rowError.message })
    }
    if (!row) {
      return jsonResponse(404, { error: 'Coaching session not found' })
    }

    if (!scopeAllows(admin.adminRole, admin.scopes, row.target_lang, row.level)) {
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
      .select('id, target_lang, level')
      .eq('id', sessionId)
      .maybeSingle<{ id: string; target_lang: string; level: string }>()

    if (rowError) {
      return jsonResponse(500, { error: rowError.message })
    }
    if (!row) {
      return jsonResponse(404, { error: 'Coaching session not found' })
    }

    if (!scopeAllows(admin.adminRole, admin.scopes, row.target_lang, row.level)) {
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

    if (!scopeAllows(admin.adminRole, admin.scopes, row.target_lang, row.level)) {
      return jsonResponse(403, { error: 'Forbidden' })
    }

    if (row.status === 'draft') {
      return jsonResponse(400, { error: 'Draft session cannot be closed' })
    }

    const nowIso = new Date().toISOString()
    const activated = row.activated_at ? toUtcDate(row.activated_at) : null
    const completedWeeks = activated
      ? Math.min(
          12,
          Math.max(
            0,
            Math.floor((Date.now() - activated.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1,
          ),
        )
      : 0

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
      .select('id, user_id, target_lang, level')
      .eq('id', sessionId)
      .maybeSingle<{ id: string; user_id: string; target_lang: string; level: string }>()

    if (sessionError) {
      return jsonResponse(500, { error: sessionError.message })
    }
    if (!sessionRow) {
      return jsonResponse(404, { error: 'Coaching session not found' })
    }
    if (!scopeAllows(admin.adminRole, admin.scopes, sessionRow.target_lang, sessionRow.level)) {
      return jsonResponse(403, { error: 'Forbidden' })
    }

    const { data: noteRow, error: noteError } = await admin.adminClient
      .from('master_notes')
      .select('id, user_id')
      .eq('id', masterNoteId)
      .maybeSingle<{ id: string; user_id: string }>()

    if (noteError) {
      return jsonResponse(500, { error: noteError.message })
    }
    if (!noteRow) {
      return jsonResponse(404, { error: 'Master note not found' })
    }
    if (noteRow.user_id !== sessionRow.user_id) {
      return jsonResponse(403, { error: 'Master note does not belong to this session user' })
    }

    const { error: updateError } = await admin.adminClient
      .from('master_notes')
      .update({ coaching_feedback_loom_url: normalizeUrl(safeString(payload.feedbackLoomUrl)) })
      .eq('id', masterNoteId)

    if (updateError) {
      return jsonResponse(500, { error: updateError.message })
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
      .select('id, target_lang, level, activated_at, duration_weeks')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)

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

    if (!scopeAllows(admin.adminRole, admin.scopes, coachingRow.target_lang, coachingRow.level)) {
      return jsonResponse(403, { error: 'Forbidden' })
    }

    const programData = await fetchProgramDataBySessionIds(admin.adminClient, [coachingRow.id])
    if (programData.error) {
      return jsonResponse(500, { error: programData.error })
    }

    const weekProgress = await fetchWeekProgressForSession(admin.adminClient, {
      user_id: userId,
      target_lang: String(coachingRow.target_lang),
      activated_at: (coachingRow as { activated_at?: string | null }).activated_at || null,
      duration_weeks: (coachingRow as { duration_weeks?: number }).duration_weeks || 12,
    })

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
        .select('id, name, state, total_duration_ms, created_at, updated_at, closed_at, final_audio_path, coaching_feedback_loom_url')
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

    if (noteIds.length > 0) {
      const { data: chunksData, error: chunksError } = await admin.adminClient
        .from('master_note_chunks')
        .select('id, master_note_id, storage_path, sort_order, duration_ms')
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
        }

        const chunkItems = await Promise.all(
          noteChunks.map(async (chunk) => {
            const { data: signedChunkData, error: signedChunkError } = await admin.adminClient.storage
              .from('master-notes')
              .createSignedUrl(chunk.storage_path, 60 * 60)

            return {
              id: chunk.id,
              storage_path: chunk.storage_path,
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
      weeklyObjectives: programData.weeklyObjectivesBySession.get(coachingRow.id) || {},
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

    const displayName =
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
      scopeAllows(admin.adminRole, admin.scopes, row.target_lang, row.level),
    )

    const sessionIds = visibleRows.map((row) => row.id)
    const programData = await fetchProgramDataBySessionIds(
      admin.adminClient,
      sessionIds,
    )
    if (programData.error) {
      return jsonResponse(500, { error: programData.error })
    }

    const rows = await Promise.all(
      visibleRows.map(async (row) => ({
        id: row.id,
        userId: row.user_id,
        userDisplayName: displayName,
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

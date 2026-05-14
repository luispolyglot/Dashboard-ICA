import { CORS_HEADERS, jsonResponse } from '../_shared/http.ts'
import {
  ensureAuthenticated,
  ensureCoachingAdmin,
  parseCoachScopes,
  scopeAllows,
} from '../_shared/coaching-auth.ts'

type CoachingCenterPayload = {
  action?: string
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
  created_at: string
  updated_at: string
}

type MasterNoteChunkRow = {
  id: string
  master_note_id: string
  storage_path: string
  sort_order: number
}

function safeString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function safeClassSessions(value: unknown): unknown[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => item as Record<string, unknown>)
    .map((item) => ({
      title: safeString(item.title),
      loomUrl: safeString(item.loomUrl ?? item.loom_url),
      report: safeString(item.report),
      week: safeString(item.week),
      createdAt: safeString(item.createdAt ?? item.created_at) || new Date().toISOString(),
    }))
}

function safeJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
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
      .from('users_coaching')
      .select('*')
      .eq('user_id', auth.userId)
      .eq('is_active', true)
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

    return jsonResponse(200, {
      memberships: rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        coachUserId: row.coach_user_id,
        coachDisplayName: row.coach_user_id ? coachesById.get(row.coach_user_id) || 'Coach' : null,
        targetLang: row.target_lang,
        nativeLang: row.native_lang,
        level: row.level,
        classSessions: Array.isArray(row.class_sessions) ? row.class_sessions : [],
        feedbackNmUrl: row.feedback_nm_url,
        feedbackNmNotes: row.feedback_nm_notes,
        weeklyObjectives: safeJsonObject(row.weekly_objectives),
        notes: row.notes,
        updatedAt: row.updated_at,
      })),
    })
  }

  const admin = await ensureCoachingAdmin(req)
  if (!admin.ok) return admin.response

  if (action === 'list-users') {
    const { data, error } = await admin.adminClient
      .from('users_coaching')
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

    return jsonResponse(200, {
      rows: visibleRows.map((row) => {
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
          classSessions: Array.isArray(row.class_sessions) ? row.class_sessions : [],
          feedbackNmUrl: row.feedback_nm_url,
          feedbackNmNotes: row.feedback_nm_notes,
          weeklyObjectives: safeJsonObject(row.weekly_objectives),
          notes: row.notes,
          isActive: row.is_active,
          updatedAt: row.updated_at,
          activeTargetLang: activeSettings?.target_lang || null,
          activeNativeLang: activeSettings?.native_lang || null,
          activeLevel: activeSettings?.cefr_level || null,
        }
      }),
    })
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
        .from('users_coaching')
        .select('user_id, target_lang')
        .eq('is_active', true),
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
    const userId = safeString(payload.userId)
    const targetLang = safeString(payload.targetLang)
    const level = safeString(payload.level) || 'A2'
    if (!userId || !targetLang) {
      return jsonResponse(400, { error: 'userId and targetLang are required' })
    }

    if (!scopeAllows(admin.adminRole, admin.scopes, targetLang, level)) {
      return jsonResponse(403, { error: 'Forbidden for selected language/level scope' })
    }

    const classSessions = safeClassSessions(payload.classSessions)
    const weeklyObjectives = safeJsonObject(payload.weeklyObjectives)
    const coachUserId =
      admin.adminRole === 'super_admin'
        ? safeString(payload.coachUserId) || admin.userId
        : admin.userId

    const { data, error } = await admin.adminClient
      .from('users_coaching')
      .upsert(
        {
          user_id: userId,
          coach_user_id: coachUserId,
          target_lang: targetLang,
          native_lang: safeString(payload.nativeLang),
          level,
          class_sessions: classSessions,
          feedback_nm_url: safeString(payload.feedbackNmUrl),
          feedback_nm_notes: safeString(payload.feedbackNmNotes),
          weekly_objectives: weeklyObjectives,
          notes: safeString(payload.notes),
          is_active: typeof payload.isActive === 'boolean' ? payload.isActive : true,
        },
        { onConflict: 'user_id,target_lang' },
      )
      .select('id')
      .maybeSingle<{ id: string }>()

    if (error) {
      return jsonResponse(500, { error: error.message })
    }

    return jsonResponse(200, { ok: true, id: data?.id || null })
  }

  if (action === 'get-user-insights') {
    const userId = safeString(payload.userId)
    if (!userId) {
      return jsonResponse(400, { error: 'userId is required' })
    }

    const requestedTargetLang = safeString(payload.targetLang)
    let coachingQuery = admin.adminClient
      .from('users_coaching')
      .select('target_lang, level')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1)

    if (requestedTargetLang) {
      coachingQuery = coachingQuery.eq('target_lang', requestedTargetLang)
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

    const targetLang = requestedTargetLang || String(coachingRow.target_lang)

    const { data: coachingMembershipRows, error: membershipError } = await admin.adminClient
      .from('users_coaching')
      .select('weekly_objectives')
      .eq('user_id', userId)
      .eq('target_lang', targetLang)
      .limit(1)

    if (membershipError) {
      return jsonResponse(500, { error: membershipError.message })
    }

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
        .eq('user_id', userId),
      admin.adminClient
        .from('master_notes')
        .select('id, name, state, created_at, closed_at, final_audio_path')
        .eq('user_id', userId)
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
        .select('id, master_note_id, storage_path, sort_order')
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

        const chunkItems = await Promise.all(
          noteChunks.map(async (chunk) => {
            const { data: signedChunkData, error: signedChunkError } = await admin.adminClient.storage
              .from('master-notes')
              .createSignedUrl(chunk.storage_path, 60 * 60)

            return {
              id: chunk.id,
              storage_path: chunk.storage_path,
              sort_order: chunk.sort_order,
              audioUrl: signedChunkError || !signedChunkData?.signedUrl ? null : signedChunkData.signedUrl,
            }
          }),
        )

        if (!path) {
          return {
            ...note,
            audioUrl: chunkItems.find((item) => Boolean(item.audioUrl))?.audioUrl || null,
            audioChunks: chunkItems,
          }
        }

        const { data: signedData, error: signedError } = await admin.adminClient.storage
          .from('master-notes')
          .createSignedUrl(path, 60 * 60)

        if (signedError || !signedData?.signedUrl) {
          return {
            ...note,
            audioUrl: chunkItems.find((item) => Boolean(item.audioUrl))?.audioUrl || null,
            audioChunks: chunkItems,
          }
        }

        return {
          ...note,
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
      weeklyObjectives: safeJsonObject((coachingMembershipRows || [])[0]?.weekly_objectives),
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
      .from('users_coaching')
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

    return jsonResponse(200, {
      rows: visibleRows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        userDisplayName: displayName,
        targetLang: row.target_lang,
        nativeLang: row.native_lang,
        level: row.level,
        classSessions: Array.isArray(row.class_sessions) ? row.class_sessions : [],
        feedbackNmUrl: row.feedback_nm_url,
        feedbackNmNotes: row.feedback_nm_notes,
        weeklyObjectives: safeJsonObject(row.weekly_objectives),
        notes: row.notes,
        isActive: row.is_active,
        updatedAt: row.updated_at,
      })),
    })
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

import { supabase } from '@/lib/supabase'
import type { IcademyTeacher, IcademyTeacherAssignableUser } from '../types'

type IcademyTeacherRow = {
  user_id: string
  display_name: string
  username: string | null
  created_at: string
  updated_at: string
}

type ProfileRow = {
  id: string
  display_name: string | null
  username: string | null
  created_at: string
}

export class IcademyTeacherRequestError extends Error {
  status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'IcademyTeacherRequestError'
    this.status = status
  }
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const value = error as { context?: { status?: number } }
  if (typeof value.context?.status === 'number') return value.context.status
  return null
}

function getErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const value = error as { code?: unknown }
  return typeof value.code === 'string' ? value.code : null
}

function buildDisplayName(input: {
  displayName: string | null
  username: string | null
  fallback?: string
}): string {
  const fromDisplayName = (input.displayName || '').trim()
  if (fromDisplayName) return fromDisplayName

  const fromUsername = (input.username || '').trim()
  if (fromUsername) return fromUsername

  return input.fallback || 'Usuario'
}

function mapTeacherRow(row: IcademyTeacherRow): IcademyTeacher {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    username: row.username,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function fetchIcademyTeachers(): Promise<IcademyTeacher[]> {
  if (!supabase) {
    throw new IcademyTeacherRequestError('Supabase no esta configurado.')
  }

  const { data, error } = await supabase
    .from('icademy_teachers')
    .select('user_id, display_name, username, created_at, updated_at')
    .order('display_name', { ascending: true })

  if (error) {
    throw new IcademyTeacherRequestError(
      'No se pudo cargar la tabla de profesores.',
      getErrorStatus(error),
    )
  }

  return (data || []).map((row) => mapTeacherRow(row as IcademyTeacherRow))
}

export async function fetchIcademyTeacherAssignableUsers(): Promise<
  IcademyTeacherAssignableUser[]
> {
  if (!supabase) {
    throw new IcademyTeacherRequestError('Supabase no esta configurado.')
  }

  const [profilesResult, teachersResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, username, created_at')
      .order('created_at', { ascending: false })
      .limit(1200),
    supabase.from('icademy_teachers').select('user_id'),
  ])

  if (profilesResult.error || teachersResult.error) {
    throw new IcademyTeacherRequestError(
      profilesResult.error?.message ||
        teachersResult.error?.message ||
        'No se pudo cargar la lista de usuarios.',
      getErrorStatus(profilesResult.error || teachersResult.error),
    )
  }

  const teacherIds = new Set(
    (teachersResult.data || []).map((row) => String(row.user_id)),
  )

  return (profilesResult.data || []).map((row) => {
    const profile = row as ProfileRow
    return {
      userId: profile.id,
      displayName: buildDisplayName({
        displayName: profile.display_name,
        username: profile.username,
      }),
      username: profile.username,
      createdAt: profile.created_at,
      isTeacher: teacherIds.has(profile.id),
    }
  })
}

export async function createIcademyTeacher(input: {
  userId: string
  displayName: string
  username?: string | null
}): Promise<void> {
  if (!supabase) {
    throw new IcademyTeacherRequestError('Supabase no esta configurado.')
  }

  const userId = input.userId.trim()
  if (!userId) {
    throw new IcademyTeacherRequestError('Debes seleccionar un usuario valido.', 400)
  }

  const displayName = buildDisplayName({
    displayName: input.displayName,
    username: input.username || null,
  })

  const { error } = await supabase.from('icademy_teachers').insert({
    user_id: userId,
    display_name: displayName,
    username: input.username?.trim() || null,
  })

  if (error) {
    const status = getErrorStatus(error)
    if (status === 403) {
      throw new IcademyTeacherRequestError(
        'No tienes permisos para crear profesores.',
        403,
      )
    }
    throw new IcademyTeacherRequestError(
      'No se pudo crear el profesor.',
      status,
    )
  }
}

export async function deleteIcademyTeacher(userId: string): Promise<void> {
  if (!supabase) {
    throw new IcademyTeacherRequestError('Supabase no esta configurado.')
  }

  const { error } = await supabase
    .from('icademy_teachers')
    .delete()
    .eq('user_id', userId)

  if (error) {
    const status = getErrorStatus(error)
    const code = getErrorCode(error)
    if (code === '23503') {
      throw new IcademyTeacherRequestError(
        'No puedes eliminar este profesor porque tiene clases asignadas en el calendario. Reasigna o elimina esas clases primero.',
        409,
      )
    }
    if (status === 403) {
      throw new IcademyTeacherRequestError(
        'No tienes permisos para eliminar profesores.',
        403,
      )
    }
    throw new IcademyTeacherRequestError(
      'No se pudo eliminar el profesor.',
      status,
    )
  }
}

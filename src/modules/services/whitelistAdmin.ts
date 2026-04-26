import { supabase } from '@/lib/supabase'

type WhitelistDbRow = {
  email: string
  can_register: boolean
  can_login: boolean
  source: string
  last_synced_at: string
  created_at: string
  updated_at: string
}

export type WhitelistEntry = {
  email: string
  canRegister: boolean
  canLogin: boolean
  source: string
  lastSyncedAt: string
  createdAt: string
  updatedAt: string
}

type WhitelistSyncResponse = {
  inserted: number
  disabled: number
  total: number
}

export class WhitelistRequestError extends Error {
  status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'WhitelistRequestError'
    this.status = status
  }
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const value = error as { context?: { status?: number } }
  if (typeof value.context?.status === 'number') return value.context.status
  return null
}

function mapWhitelistRow(row: WhitelistDbRow): WhitelistEntry {
  return {
    email: row.email,
    canRegister: row.can_register,
    canLogin: row.can_login,
    source: row.source,
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function fetchWhitelist(search = ''): Promise<WhitelistEntry[]> {
  if (!supabase) {
    throw new WhitelistRequestError('Supabase no está configurado.')
  }

  const normalizedSearch = search.trim().toLowerCase()
  let query = supabase
    .from('auth_whitelist')
    .select('email, can_register, can_login, source, last_synced_at, created_at, updated_at')
    .order('email', { ascending: true })

  if (normalizedSearch.length > 0) {
    query = query.ilike('email', `%${normalizedSearch}%`)
  }

  const { data, error } = await query

  if (error) {
    throw new WhitelistRequestError('No se pudo cargar la whitelist.', getErrorStatus(error))
  }

  return (data || []).map((row) => mapWhitelistRow(row as WhitelistDbRow))
}

export async function createWhitelistManualUser(email: string): Promise<void> {
  if (!supabase) {
    throw new WhitelistRequestError('Supabase no está configurado.')
  }

  const { error } = await supabase.functions.invoke('whitelist-create', {
    body: { email },
  })

  if (error) {
    const status = getErrorStatus(error)
    if (status === 403) {
      throw new WhitelistRequestError('No tienes permisos para crear usuarios en la whitelist.', 403)
    }
    throw new WhitelistRequestError('No se pudo crear el usuario en la whitelist.', status)
  }
}

export async function updateWhitelistFlags(input: {
  email: string
  canRegister?: boolean
  canLogin?: boolean
}): Promise<void> {
  if (!supabase) {
    throw new WhitelistRequestError('Supabase no está configurado.')
  }

  const { error } = await supabase.functions.invoke('whitelist-update', {
    body: input,
  })

  if (error) {
    const status = getErrorStatus(error)
    if (status === 403) {
      throw new WhitelistRequestError('No tienes permisos para editar la whitelist.', 403)
    }
    throw new WhitelistRequestError('No se pudo actualizar la whitelist.', status)
  }
}

export async function syncWhitelistCsv(file: File): Promise<WhitelistSyncResponse> {
  if (!supabase) {
    throw new WhitelistRequestError('Supabase no está configurado.')
  }

  const formData = new FormData()
  formData.append('file', file)

  const { data, error } = await supabase.functions.invoke<WhitelistSyncResponse>('whitelist-sync-csv', {
    body: formData,
  })

  if (error) {
    const status = getErrorStatus(error)
    if (status === 403) {
      throw new WhitelistRequestError('No tienes permisos para sincronizar la whitelist.', 403)
    }
    throw new WhitelistRequestError('No se pudo sincronizar el CSV de whitelist.', status)
  }

  if (!data || typeof data.total !== 'number') {
    throw new WhitelistRequestError('Respuesta inválida al sincronizar la whitelist.')
  }

  return data
}

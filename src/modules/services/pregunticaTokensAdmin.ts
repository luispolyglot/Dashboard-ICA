import { supabase } from '@/lib/supabase'

type PregunticaTokensAdminRow = {
  user_id: string
  username: string | null
  monthly_tokens: number | string | null
  manual_tokens: number | string | null
}

type PregunticaManualUpdateRow = {
  manual_tokens: number | string
  applied_delta: number | string
  balance_after: number | string
}

export type PregunticaTokensAdminUser = {
  userId: string
  username: string
  monthlyTokens: number
  manualTokens: number
}

export type PregunticaManualTokensUpdateResult = {
  manualTokens: number
  appliedDelta: number
  balanceAfter: number
}

export class PregunticaTokensAdminError extends Error {
  status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'PregunticaTokensAdminError'
    this.status = status
  }
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const value = error as { context?: { status?: number } }
  if (typeof value.context?.status === 'number') return value.context.status
  return null
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export async function fetchPregunticaTokensAdminOverview(): Promise<PregunticaTokensAdminUser[]> {
  if (!supabase) {
    throw new PregunticaTokensAdminError('Supabase no está configurado.')
  }

  const { data, error } = await supabase.rpc('get_preguntica_tokens_admin_overview')

  if (error) {
    const status = getErrorStatus(error)
    if (status === 403) {
      throw new PregunticaTokensAdminError('No tienes permisos para ver esta sección.', 403)
    }
    throw new PregunticaTokensAdminError('No se pudieron cargar las fichas de PreguntICA.', status)
  }

  const rows = (data || []) as PregunticaTokensAdminRow[]
  return rows.map((row) => ({
    userId: row.user_id,
    username: row.username?.trim() || 'sin-username',
    monthlyTokens: toNumber(row.monthly_tokens),
    manualTokens: toNumber(row.manual_tokens),
  }))
}

export async function updatePregunticaManualTokensForUser(
  userId: string,
  manualTokens: number,
): Promise<PregunticaManualTokensUpdateResult> {
  if (!supabase) {
    throw new PregunticaTokensAdminError('Supabase no está configurado.')
  }

  if (!Number.isInteger(manualTokens) || manualTokens < 0) {
    throw new PregunticaTokensAdminError('Las fichas manuales deben ser un entero positivo o cero.')
  }

  const { data, error } = await supabase.rpc('set_preguntica_manual_tokens', {
    p_user_id: userId,
    p_manual_tokens: manualTokens,
  })

  if (error) {
    const status = getErrorStatus(error)
    if (status === 403) {
      throw new PregunticaTokensAdminError('No tienes permisos para editar fichas manuales.', 403)
    }
    throw new PregunticaTokensAdminError('No se pudieron actualizar las fichas manuales.', status)
  }

  const row = (Array.isArray(data)
    ? data[0]
    : data) as PregunticaManualUpdateRow | undefined

  if (!row) {
    throw new PregunticaTokensAdminError('Respuesta inválida al actualizar fichas manuales.')
  }

  return {
    manualTokens: toNumber(row.manual_tokens),
    appliedDelta: toNumber(row.applied_delta),
    balanceAfter: toNumber(row.balance_after),
  }
}

import { supabase } from '../lib/supabase'

type WhitelistCheckResult = {
  allowed: boolean
  reason: string
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

async function runCheck(functionName: 'whitelist_check_registration' | 'whitelist_check_login', email: string): Promise<WhitelistCheckResult> {
  if (!supabase) {
    throw new Error('Falta configurar Supabase')
  }

  const normalized = normalizeEmail(email)
  const { data, error } = await supabase.rpc(functionName, { email_input: normalized })

  if (error) {
    throw error
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) {
    return { allowed: false, reason: 'No se pudo validar el email en la whitelist.' }
  }

  return {
    allowed: Boolean(row.allowed),
    reason: String(row.reason || ''),
  }
}

export async function checkRegistrationEmail(email: string): Promise<WhitelistCheckResult> {
  return runCheck('whitelist_check_registration', email)
}

export async function checkLoginEmail(email: string): Promise<WhitelistCheckResult> {
  return runCheck('whitelist_check_login', email)
}

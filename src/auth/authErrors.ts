import { t } from '@/i18n'

/**
 * Supabase answers in English («Invalid login credentials»…), which looks odd and even shady
 * to someone using the app in Spanish (Luis, 9 Oct). These are the errors people actually see
 * when signing in or changing their password, in the app's language.
 */
export function authErrorMessage(error: unknown, fallback: string): string {
  const value = (error ?? {}) as { code?: string; message?: string; status?: number }
  const code = (value.code || '').toLowerCase()
  const message = (value.message || '').toLowerCase()

  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return t('El correo y la contraseña no coinciden.')
  }
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return t('Antes de entrar, confirma tu correo con el enlace que te enviamos.')
  }
  if (code === 'same_password' || message.includes('should be different from the old password')) {
    return t('La nueva contraseña tiene que ser distinta de la anterior.')
  }
  if (code === 'weak_password' || message.includes('password should be at least')) {
    return t('La contraseña debe tener al menos 6 caracteres.')
  }
  if (code === 'user_already_exists' || message.includes('already registered')) {
    return t('Ya hay una cuenta con este correo.')
  }
  if (
    code === 'over_request_rate_limit' ||
    code === 'over_email_send_rate_limit' ||
    value.status === 429 ||
    message.includes('rate limit')
  ) {
    return t('Demasiados intentos seguidos. Espera un momento y vuelve a probar.')
  }
  if (message.includes('failed to fetch') || message.includes('network')) {
    return t('No hay conexión. Revisa tu internet y vuelve a probar.')
  }
  return fallback
}

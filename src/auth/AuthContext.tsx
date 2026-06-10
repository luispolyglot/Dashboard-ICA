import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { PropsWithChildren } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { hasSupabaseConfig, supabase } from '../lib/supabase'
import { getSessionWithTimeout } from '../lib/supabaseAuthSafe'
import { checkLoginEmail, normalizeEmail } from './whitelist'

type AuthContextValue = {
  user: User | null
  session: Session | null
  loading: boolean
  isPasswordRecovery: boolean
  hasSupabaseConfig: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, nickname: string) => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  changePassword: (currentPassword: string, nextPassword: string) => Promise<void>
  updateDisplayName: (displayName: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function detectUserTimezone(): string {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return timezone && timezone.trim().length > 0 ? timezone : 'UTC'
}

async function checkLoginEmailWithTimeout(email: string, timeoutMs = 2500) {
  return await Promise.race([
    checkLoginEmail(email),
    new Promise<{ allowed: true }>((resolve) => {
      globalThis.setTimeout(() => {
        resolve({ allowed: true })
      }, timeoutMs)
    }),
  ])
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)
  const isSigningOutForWhitelistRef = useRef(false)

  const enforceWhitelistAccess = useCallback(async (activeSession: Session | null) => {
    if (!supabase || !activeSession?.user?.email) return true
    if (typeof navigator !== 'undefined' && !navigator.onLine) return true

    try {
      const whitelist = await checkLoginEmailWithTimeout(activeSession.user.email)
      if (whitelist.allowed) return true

      isSigningOutForWhitelistRef.current = true
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.warn('No se pudo cerrar sesion para usuario fuera de whitelist', error)
        setSession(null)
        setUser(null)
      }
      setIsPasswordRecovery(false)
      return false
    } catch (error) {
      console.warn('No se pudo validar whitelist activa', error)
      return true
    }
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    if (hashParams.get('type') === 'recovery') {
      setIsPasswordRecovery(true)
    }

    void (async () => {
      const initialSession = await getSessionWithTimeout()
      const isAllowed = await enforceWhitelistAccess(initialSession)
      if (isAllowed) {
        setSession(initialSession)
        setUser(initialSession?.user ?? null)
      } else {
        setSession(null)
        setUser(null)
      }
      setLoading(false)
    })()

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true)
      }
      if (event === 'SIGNED_OUT') {
        setIsPasswordRecovery(false)
        isSigningOutForWhitelistRef.current = false
      }
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setLoading(false)

      if (
        nextSession &&
        !isSigningOutForWhitelistRef.current &&
        (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')
      ) {
        void enforceWhitelistAccess(nextSession)
      }
    })

    return () => data.subscription.unsubscribe()
  }, [enforceWhitelistAccess])

  useEffect(() => {
    if (!session) return

    const validateAccess = () => {
      if (isSigningOutForWhitelistRef.current) return
      void enforceWhitelistAccess(session)
    }

    validateAccess()
    const intervalId = window.setInterval(validateAccess, 60_000)
    window.addEventListener('focus', validateAccess)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', validateAccess)
    }
  }, [session, enforceWhitelistAccess])

  useEffect(() => {
    if (!supabase || !user?.id) return

    const timezone = detectUserTimezone()

    void (async () => {
      const { error: rpcError } = await supabase.rpc('set_my_timezone', {
        p_timezone: timezone,
      })

      if (!rpcError) return

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({ id: user.id, timezone }, { onConflict: 'id' })

      if (profileError) {
        console.warn('No se pudo sincronizar timezone de perfil', profileError)
      }
    })()
  }, [user?.id])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      isPasswordRecovery,
      hasSupabaseConfig,
      signIn: async (email, password) => {
        if (!supabase) throw new Error('Falta configurar Supabase')
        const normalizedEmail = normalizeEmail(email)
        const whitelist = await checkLoginEmail(normalizedEmail)
        if (!whitelist.allowed) {
          throw new Error(whitelist.reason || 'Tu email no tiene acceso de login actualmente.')
        }

        const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
        if (error) throw error
        setIsPasswordRecovery(false)

        const postCheck = await checkLoginEmail(normalizedEmail)
        if (!postCheck.allowed) {
          await supabase.auth.signOut()
          throw new Error(postCheck.reason || 'Tu acceso fue deshabilitado.')
        }
      },
      signUp: async (email, password, nickname) => {
        if (!supabase) throw new Error('Falta configurar Supabase')
        const cleanNickname = nickname.trim()
        const { data, error } = await supabase.auth.signUp({
          email: normalizeEmail(email),
          password,
          options: {
            data: cleanNickname ? { display_name: cleanNickname } : undefined,
          },
        })
        if (error) throw error

        const userId = data.user?.id
        const hasActiveSession = Boolean(data.session)
        if (userId && cleanNickname && hasActiveSession) {
          const timezone = detectUserTimezone()
          const { error: profileError } = await supabase
            .from('profiles')
            .upsert({ id: userId, display_name: cleanNickname, timezone }, { onConflict: 'id' })

          if (profileError) throw profileError
        }
      },
      requestPasswordReset: async (email) => {
        if (!supabase) throw new Error('Falta configurar Supabase')
        const normalizedEmail = normalizeEmail(email)
        await supabase.auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
      },
      updatePassword: async (password) => {
        if (!supabase) throw new Error('Falta configurar Supabase')
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        setIsPasswordRecovery(false)
      },
      changePassword: async (currentPassword, nextPassword) => {
        if (!supabase) throw new Error('Falta configurar Supabase')
        const email = session?.user?.email || user?.email
        if (!email) throw new Error('No se pudo verificar tu cuenta actual.')

        const { error: reauthError } = await supabase.auth.signInWithPassword({
          email: normalizeEmail(email),
          password: currentPassword,
        })
        if (reauthError) {
          throw new Error('La contraseña actual no es correcta.')
        }

        const { error: updateError } = await supabase.auth.updateUser({ password: nextPassword })
        if (updateError) throw updateError
      },
      updateDisplayName: async (displayName) => {
        if (!supabase) throw new Error('Falta configurar Supabase')

        const cleanDisplayName = displayName.trim()
        if (cleanDisplayName.length < 3) {
          throw new Error('El nombre debe tener al menos 3 caracteres.')
        }

        const currentUserId = user?.id || session?.user?.id
        if (!currentUserId) throw new Error('No se pudo identificar el usuario actual.')

        const { data, error } = await supabase.auth.updateUser({
          data: { display_name: cleanDisplayName },
        })
        if (error) throw error

        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({ id: currentUserId, display_name: cleanDisplayName }, { onConflict: 'id' })
        if (profileError) throw profileError

        if (data.user) {
          setUser(data.user)
        }
      },
      signOut: async () => {
        if (!supabase) return
        const { error } = await supabase.auth.signOut()
        if (error) throw error
        setIsPasswordRecovery(false)
      },
    }),
    [user, session, loading, isPasswordRecovery],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider')
  }
  return context
}

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { hasSupabaseConfig, supabase } from '../lib/supabase'
import { checkLoginEmail, normalizeEmail } from './whitelist'

type AuthContextValue = {
  user: User | null
  session: Session | null
  loading: boolean
  hasSupabaseConfig: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, nickname: string) => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setLoading(false)
    })

    return () => data.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
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
          const { error: profileError } = await supabase
            .from('profiles')
            .upsert({ id: userId, display_name: cleanNickname }, { onConflict: 'id' })

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
      },
      signOut: async () => {
        if (!supabase) return
        const { error } = await supabase.auth.signOut()
        if (error) throw error
      },
    }),
    [user, session, loading],
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

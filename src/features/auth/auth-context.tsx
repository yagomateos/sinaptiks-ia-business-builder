import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/services/supabase/client'
import { toAppError } from '@/services/supabase/errors'
import type { Profile } from '@/domain/types'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  /** Si cargar el perfil falló (red, RLS...), para no confundirlo con "todavía cargando". */
  profileError: unknown
  signIn(email: string, password: string): Promise<void>
  signUp(email: string, password: string, fullName: string): Promise<{ needsConfirmation: boolean }>
  signOut(): Promise<void>
  resetPassword(email: string): Promise<void>
  updatePassword(newPassword: string): Promise<void>
  refreshProfile(): Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileError, setProfileError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) setProfile(null)
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  const userId = session?.user.id

  useEffect(() => {
    if (!userId) return
    let active = true

    loadProfile(userId)
      .then((next) => {
        if (!active) return
        setProfile(next)
        setProfileError(null)
      })
      .catch((error) => {
        if (!active) return
        console.warn('No se pudo cargar el perfil', error)
        setProfileError(error)
      })

    return () => {
      active = false
    }
  }, [userId])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      profileError,

      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw toAppError(error, 'No hemos podido iniciar sesión.')
      },

      async signUp(email, password, fullName) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        })
        if (error) throw toAppError(error, 'No hemos podido crear tu cuenta.')

        return { needsConfirmation: !data.session }
      },

      async signOut() {
        await supabase.auth.signOut()
        setProfile(null)
      },

      async resetPassword(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (error) throw toAppError(error, 'No hemos podido enviar el correo.')
      },

      async updatePassword(newPassword) {
        const { error } = await supabase.auth.updateUser({ password: newPassword })
        if (error) throw toAppError(error, 'No hemos podido cambiar la contraseña.')
      },

      async refreshProfile() {
        if (!userId) return
        try {
          const next = await loadProfile(userId)
          setProfile(next)
          setProfileError(null)
        } catch (error) {
          setProfileError(error)
          throw error
        }
      },
    }),
    [session, profile, profileError, loading, userId],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) throw toAppError(error, 'No hemos podido cargar tu perfil.')
  return data as Profile | null
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return context
}

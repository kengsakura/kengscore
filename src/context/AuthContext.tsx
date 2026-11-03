import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { getApi, getSupabase } from '@/lib/api'
import { FullScreenLoader } from '@/components/ui/Feedback'
import LoginPage from '@/pages/LoginPage'

interface AuthCtx {
  email: string | null
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx>({ email: null, signOut: async () => {} })
export const useAuth = () => useContext(Ctx)

/** ในโหมด Supabase ต้องเข้าสู่ระบบก่อน; โหมดสาธิตผ่านได้เลย */
export function AuthGate({ children }: { children: ReactNode }) {
  if (getApi().mode === 'local') return <Ctx.Provider value={{ email: null, signOut: async () => {} }}>{children}</Ctx.Provider>
  return <SupabaseAuthGate>{children}</SupabaseAuthGate>
}

function SupabaseAuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const qc = useQueryClient()

  useEffect(() => {
    const sb = getSupabase()
    sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = sb.auth.onAuthStateChange((_event, s) => {
      setSession((prev) => {
        if (prev?.user.id !== s?.user.id) qc.clear()
        return s
      })
    })
    return () => data.subscription.unsubscribe()
  }, [qc])

  if (session === undefined) return <FullScreenLoader />
  if (!session) return <LoginPage />
  return (
    <Ctx.Provider
      value={{
        email: session.user.email ?? null,
        signOut: async () => {
          await getSupabase().auth.signOut()
          qc.clear()
        },
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

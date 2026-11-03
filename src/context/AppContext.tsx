import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Settings, Term } from '@/lib/api/types'
import { getApi } from '@/lib/api'
import { qk, useSettings, useTerms, useUpdateSettings } from '@/hooks/queries'
import { compareTerms } from '@/lib/utils'
import { FullScreenError, FullScreenLoader } from '@/components/ui/Feedback'
import OnboardingPage from '@/pages/OnboardingPage'

interface AppCtx {
  settings: Settings
  terms: Term[]
  term: Term
  demo: boolean
  setActiveTerm: (id: string) => void
}

const Ctx = createContext<AppCtx | null>(null)

export function useApp(): AppCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp must be used inside <AppProvider>')
  return v
}

/** โหลดตั้งค่า + ภาคเรียน แล้วเตรียม context สำหรับทุกหน้า */
export function AppProvider({ children }: { children: ReactNode }) {
  const settingsQ = useSettings()
  const termsQ = useTerms()
  const { mutate: updateSettings, isPending: updating } = useUpdateSettings()
  const qc = useQueryClient()

  const terms = useMemo(() => [...(termsQ.data ?? [])].sort(compareTerms), [termsQ.data])
  const settings = settingsQ.data
  const term = terms.find((t) => t.id === settings?.active_term_id) ?? terms[0]

  // ถ้ายังไม่ได้เลือกภาคเรียน (หรือภาคเดิมถูกลบ) ให้ใช้ภาคล่าสุด
  useEffect(() => {
    if (settings && term && settings.active_term_id !== term.id && !updating) {
      updateSettings({ active_term_id: term.id })
    }
  }, [settings, term, updating, updateSettings])

  const value = useMemo<AppCtx | null>(
    () =>
      settings && term
        ? {
            settings,
            terms,
            term,
            demo: getApi().mode === 'local',
            setActiveTerm: (id) => updateSettings({ active_term_id: id }),
          }
        : null,
    [settings, terms, term, updateSettings],
  )

  if (settingsQ.isPending || termsQ.isPending) return <FullScreenLoader />
  if (settingsQ.isError || termsQ.isError)
    return (
      <FullScreenError
        error={settingsQ.error ?? termsQ.error}
        onRetry={() => {
          qc.invalidateQueries({ queryKey: qk.settings })
          qc.invalidateQueries({ queryKey: qk.terms })
        }}
      />
    )
  if (!value) return <OnboardingPage />
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

import type { Api } from './types'
import { createLocalApi } from './local'
import { createSupabaseApi, hasSupabase } from './supabase'
import { ARTIFACT } from '../env'

export * from './types'
export { hasSupabase, getSupabase } from './supabase'

const MODE_KEY = 'kengscore:mode'

export function isDemoMode(): boolean {
  if (ARTIFACT) return true
  try {
    return localStorage.getItem(MODE_KEY) === 'demo'
  } catch {
    return false
  }
}

export function setDemoMode(on: boolean) {
  try {
    if (on) localStorage.setItem(MODE_KEY, 'demo')
    else localStorage.removeItem(MODE_KEY)
  } catch {
    /* ignore */
  }
  reloadHome()
}

export function reloadHome() {
  if (ARTIFACT) window.location.reload()
  else window.location.assign('/')
}

let instance: Api | null = null

export function getApi(): Api {
  if (!instance) instance = isDemoMode() || !hasSupabase ? createLocalApi() : createSupabaseApi()
  return instance
}

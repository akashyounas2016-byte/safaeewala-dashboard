import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Company details printed on invoices and statements — one source: Settings → `company_settings` (AUD-34).
 * A cached copy is kept in localStorage so documents render instantly and offline.
 */
export interface CompanyInfo {
  company_name: string
  trading_name: string
  trn: string
  phone: string
  email: string
  address: string
  website?: string
}

export const DEFAULT_COMPANY_INFO: CompanyInfo = {
  company_name: 'Safaeewala Cleaning & Technical Services LLC',
  trading_name: 'Safaeewala',
  trn: '',
  phone: '+971 55 628 2374',
  email: 'info@safaeewala.com',
  address: 'Dubai, United Arab Emirates',
  website: 'https://www.safaeewala.com',
}

const CACHE_KEY = 'safaeewala_company_info'
const EVENT = 'safaeewala:company-info'

export function getCompanyInfo(): CompanyInfo {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') as Partial<CompanyInfo> | null
    return { ...DEFAULT_COMPANY_INFO, ...(cached || {}) }
  } catch {
    return DEFAULT_COMPANY_INFO
  }
}

function cache(info: Partial<CompanyInfo>) {
  const merged = { ...getCompanyInfo(), ...info }
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(merged)) } catch { /* quota */ }
  window.dispatchEvent(new Event(EVENT))
  return merged
}

/** Refresh the cache from Supabase (call on app start and after saving Settings) */
export async function loadCompanyInfo(): Promise<CompanyInfo> {
  try {
    const { data } = await supabase.from('company_settings').select('data').eq('id', 1).single()
    const company = (data?.data as { company?: Partial<CompanyInfo> } | undefined)?.company
    if (company) return cache(Object.fromEntries(Object.entries(company).filter(([, v]) => v)) as Partial<CompanyInfo>)
  } catch { /* offline — keep cache */ }
  return getCompanyInfo()
}

/**
 * Update some company fields without wiping the rest of `company_settings.data`
 * (notifications, role permissions, other company fields) — AUD-43.
 */
export async function updateCompanySettings(patch: Partial<CompanyInfo>): Promise<void> {
  cache(patch)
  const { data } = await supabase.from('company_settings').select('data').eq('id', 1).single()
  const current = (data?.data || {}) as Record<string, unknown> & { company?: Record<string, unknown> }
  const { error } = await supabase.from('company_settings').upsert({
    id: 1,
    data: { ...current, company: { ...(current.company || {}), ...patch } },
  })
  if (error) console.error('[companyInfo] save failed:', error.message)
}

/** React hook — re-renders when the company details change */
export function useCompanyInfo(): CompanyInfo {
  const [info, setInfo] = useState(getCompanyInfo)
  useEffect(() => {
    const update = () => setInfo(getCompanyInfo())
    window.addEventListener(EVENT, update)
    void loadCompanyInfo()
    return () => window.removeEventListener(EVENT, update)
  }, [])
  return info
}

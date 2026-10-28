import { supabase } from '@/lib/supabase'

export interface AuditEntry {
  id: string
  created_at: string
  user_name: string | null
  action: string
  entity: string
  entity_id: string
  entity_name: string | null
  details: string | null
}

/** Who changed one record and when (UX-40) — newest first; empty when the audit table is missing */
export async function fetchRecordHistory(entityId: string, limit = 25): Promise<AuditEntry[]> {
  try {
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(limit)
    return error ? [] : ((data ?? []) as AuditEntry[])
  } catch {
    return []
  }
}

const AUDITED_JOB_FIELDS = ['date', 'staff_name', 'start_time', 'end_time', 'duty_hours', 'ot_hours', 'address', 'area', 'charges', 'received', 'payment_mode', 'material', 'service', 'remarks'] as const

/** "charges 200 → 250 · received 0 → 250" for the fields a patch really changes */
export function describeJobChange(before: Record<string, unknown>, patch: Record<string, unknown>): string {
  return AUDITED_JOB_FIELDS
    .filter(k => k in patch && String(before[k] ?? '') !== String(patch[k] ?? ''))
    .map(k => `${k.replace(/_/g, ' ')} ${String(before[k] ?? '') || '—'} → ${String(patch[k] ?? '') || '—'}`)
    .join(' · ')
}

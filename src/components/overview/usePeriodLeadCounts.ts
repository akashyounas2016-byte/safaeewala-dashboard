import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isDummyLead, readDeletedLeadIds } from '@/lib/fluentFormsSync'

/**
 * R-LEAD-15 (2026-11-23, second version): the Overview's Fluent Form and WhatsApp Click cards follow the Overview
 * date filter. Dubai day bounds; '' = open (All Time). Reloads every minute and when the period changes.
 */
export interface PeriodLeadCounts {
  forms: number | null
  formsNew: number | null
  clicks: number | null
  clicksMobile: number | null
}

export function usePeriodLeadCounts(start: string, end: string): PeriodLeadCounts {
  const [c, setC] = useState<PeriodLeadCounts>({ forms: null, formsNew: null, clicks: null, clicksMobile: null })
  useEffect(() => {
    let alive = true
    const load = async () => {
      let f = supabase.from('fluent_form_leads').select('id, status')
      let w = supabase.from('whatsapp_clicks').select('id, device')
      if (start) { f = f.gte('created_at', `${start}T00:00:00+04:00`); w = w.gte('clicked_at', `${start}T00:00:00+04:00`) }
      if (end) { f = f.lte('created_at', `${end}T23:59:59.999+04:00`); w = w.lte('clicked_at', `${end}T23:59:59.999+04:00`) }
      const [fr, wr] = await Promise.all([f.range(0, 9999), w.range(0, 9999)])
      if (!alive) return
      const deleted = readDeletedLeadIds()
      const leads = fr.error ? null : (fr.data || []).filter(l => !isDummyLead(l) && !deleted.has(l.id))
      const clicks = wr.error ? null : wr.data || []
      setC({
        forms: leads ? leads.length : null,
        formsNew: leads ? leads.filter(l => (l.status || 'new') === 'new').length : null,
        clicks: clicks ? clicks.length : null,
        clicksMobile: clicks ? clicks.filter(x => String(x.device || '').toLowerCase() === 'mobile').length : null,
      })
    }
    void load()
    const t = window.setInterval(load, 60_000)
    return () => { alive = false; window.clearInterval(t) }
  }, [start, end])
  return c
}

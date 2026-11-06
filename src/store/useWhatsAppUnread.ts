import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/** Set once the WhatsApp tables are found missing — no more calls this session */
let tablesMissing = false

/** R-WA-01: unread WhatsApp messages for the sidebar badge (0 until the WhatsApp tables exist) */
export function useWhatsAppUnread(enabled = true): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!enabled || tablesMissing) return
    let alive = true
    let channel: ReturnType<typeof supabase.channel> | null = null
    const load = () => {
      void supabase.from('wa_conversations').select('unread_count').gt('unread_count', 0).then(({ data, error }) => {
        if (error) { if (/wa_conversations|schema cache|does not exist/i.test(error.message) || error.code === 'PGRST205') tablesMissing = true; return } // no tables yet: stay at 0
        if (!alive) return
        // a unique name: the sidebar can be on screen twice, and a channel name can only be subscribed once
        if (!channel) channel = supabase.channel(`whatsapp-unread-${Math.random().toString(36).slice(2)}`).on('postgres_changes', { event: '*', schema: 'public', table: 'wa_conversations' }, load).subscribe()
        setCount((data || []).reduce((s, r) => s + (Number((r as { unread_count: number }).unread_count) || 0), 0))
      })
    }
    load()
    return () => { alive = false; if (channel) void supabase.removeChannel(channel) }
  }, [enabled])
  return count
}

import { Database, Settings2 } from 'lucide-react'

/** R-WA-02: shown inside one tab when its table is not created yet — the other tabs keep working */
export function MigrationNote({ file = '2026-11-07_whatsapp_modules.sql' }: { file?: string }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 text-[13px] text-amber-900">
      <Database size={18} className="shrink-0 mt-0.5" />
      <p>This tab needs one database step: Supabase → SQL editor → run <code className="bg-white/70 px-1 rounded">supabase/migrations/{file}</code>. Everything else on this screen keeps working.</p>
    </div>
  )
}

/** Small strip at the top of the WhatsApp screen while the Meta keys are missing — informs, never blocks */
export function SetupStrip({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="bg-white border border-amber-200 rounded-2xl px-4 py-2.5 flex items-center gap-3 text-[12.5px] text-amber-900">
      <Settings2 size={15} className="shrink-0 text-amber-600" />
      <span className="flex-1">Sending is off until the Meta keys are on the server. Every tab can still be opened and set up.</span>
      <button type="button" onClick={onOpenSettings} className="font-bold underline cursor-pointer shrink-0">Settings</button>
    </div>
  )
}

export const inputCls = 'w-full rounded-xl border border-[#E2E5E0] px-3 py-2 text-[13px] outline-none focus:border-emerald-500 bg-white'
export const btnPrimary = 'px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-bold disabled:opacity-40 cursor-pointer flex items-center gap-1.5'
export const btnGhost = 'px-3 py-2 rounded-xl border border-[#E2E5E0] text-[12.5px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5 disabled:opacity-40'
export const aed = (n: number) => `AED ${Math.round(Number(n) || 0).toLocaleString('en-AE')}`

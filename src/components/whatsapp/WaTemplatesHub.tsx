import { useSearchParams } from 'react-router-dom'
import { WaTemplates } from './WaTemplates'
import { WaAutomation, WaKeywords } from './WaAutomation'
import { QuickRepliesSettings, SettingsIcons } from './WaSettingsMore'

/**
 * R-INBOX-05: Templates is its own module in the rail (between Broadcasts and Analytics) with tabs
 * Templates, Quick replies, Automation, Keyword Triggers — everything about what gets sent, in one place.
 */
export const TEMPLATE_TABS = [
  { key: 'templates', label: 'Templates' }, { key: 'replies', label: 'Quick replies' },
  { key: 'automation', label: 'Automation' }, { key: 'keywords', label: 'Keyword Triggers' },
] as const
export type TemplateTab = (typeof TEMPLATE_TABS)[number]['key']

export function WaTemplatesHub({ configured }: { configured: boolean }) {
  const [params, setParams] = useSearchParams()
  const tab: TemplateTab = TEMPLATE_TABS.find(t => t.key === params.get('t'))?.key || 'templates'
  return (
    <div className="space-y-4">
      <nav aria-label="Templates" className="flex gap-1 overflow-x-auto border-b border-[#ECEEEC] -mt-1">
        {TEMPLATE_TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setParams(p => { p.set('t', t.key); return p }, { replace: true })} aria-current={tab === t.key ? 'page' : undefined}
            className={`relative px-3.5 py-2.5 text-[13px] whitespace-nowrap cursor-pointer ${tab === t.key ? 'font-bold text-[#0F1F19]' : 'font-semibold text-slate-500 hover:text-slate-800'}`}>
            {t.label}{tab === t.key && <span className="absolute left-2 right-2 -bottom-px h-[2.5px] rounded-full bg-emerald-600" />}
          </button>
        ))}
      </nav>
      {tab === 'templates' && <WaTemplates key={String(configured)} canSend={configured} />}
      {tab === 'replies' && (
        <section className="bg-white border border-[#E2E5E0] rounded-[22px] p-5 space-y-3">
          <p className="text-[15px] font-bold text-[#111827] flex items-center gap-2"><SettingsIcons.MessageSquareText size={17} className="text-sky-600" /> Quick replies — internal templates</p>
          <p className="text-[12px] text-slate-500">No Meta review. Picked in a chat from the message bar and sent as ordinary text — WhatsApp delivers that only to a client who wrote in the last 24 hours. For anyone else use a Meta-approved template.</p>
          <QuickRepliesSettings />
        </section>
      )}
      {tab === 'automation' && <WaAutomation canSend={configured} />}
      {tab === 'keywords' && <WaKeywords />}
    </div>
  )
}

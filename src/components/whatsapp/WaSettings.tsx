import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, Copy, Link2, Loader2, Phone, PlugZap } from 'lucide-react'
import { notify } from '@/lib/notify'
import { waConnect, waPhone, type WaPhoneInfo } from '@/lib/whatsappModules'
import { btnGhost, btnPrimary, inputCls } from './WaShared'

function Step({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 text-[13px] text-slate-700">
      {done ? <CheckCircle2 size={17} className="text-emerald-600 shrink-0 mt-0.5" /> : <Circle size={17} className="text-slate-300 shrink-0 mt-0.5" />}
      <span>{children}</span>
    </li>
  )
}

/** R-WA-02 Settings: connection checklist, the number as Meta sees it, register + subscribe without a terminal */
export function WaSettings({ configured, tablesReady, modulesReady }: { configured: boolean; tablesReady: boolean; modulesReady: boolean }) {
  const hook = `${window.location.origin}/api/whatsapp/webhook`
  const [info, setInfo] = useState<WaPhoneInfo | null | 'loading'>(configured ? 'loading' : null)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => { if (!configured) return; setInfo('loading'); waPhone().then(setInfo).catch(e => { notify.error((e as Error).message); setInfo(null) }) }
  useEffect(load, [configured]) // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async () => {
    setBusy(true)
    try { const r = await waConnect(pin.trim() || undefined); notify.success(r.done.length ? `Done: ${r.done.join(' + ')}` : 'Nothing to do'); setPin(''); load() }
    catch (e) { notify.error((e as Error).message) } finally { setBusy(false) }
  }
  const p = info && info !== 'loading' ? info.phone : null

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <section className="bg-white border border-[#E2E5E0] rounded-[22px] p-5 space-y-3">
        <p className="text-[15px] font-bold text-[#111827] flex items-center gap-2"><PlugZap size={17} className="text-emerald-600" /> Connection checklist</p>
        <ol className="space-y-2">
          <Step done={tablesReady}>Database: <code className="bg-slate-100 px-1 rounded">2026-11-06_whatsapp_inbox.sql</code> run in Supabase.</Step>
          <Step done={modulesReady}>Database: <code className="bg-slate-100 px-1 rounded">2026-11-07_whatsapp_modules.sql</code> run (Deals, Broadcast, Automation, Keyword Trigger).</Step>
          <Step done={configured}>VPS <code className="bg-slate-100 px-1 rounded">.env</code>: the five <code className="bg-slate-100 px-1 rounded">WHATSAPP_*</code> keys, then restart.</Step>
          <Step done={Boolean(p?.display_phone_number)}>Number added in Meta and visible here.</Step>
          <Step done={info !== 'loading' && Boolean(info?.subscribed)}>WhatsApp account subscribed to the app (button below).</Step>
          <Step done={false}>Meta app → WhatsApp → Configuration → Webhook: the URL below, the same verify token, and <b>messages</b> subscribed. Then write to the number from a phone.</Step>
        </ol>
        <div className="flex items-center gap-2 bg-[#F4F6F3] rounded-xl px-3 py-2">
          <Link2 size={14} className="text-slate-500 shrink-0" />
          <code className="text-[12px] flex-1 break-all">{hook}</code>
          <button type="button" onClick={() => { void navigator.clipboard.writeText(hook); notify.success('Copied') }} className="p-1.5 rounded-lg hover:bg-white cursor-pointer" title="Copy"><Copy size={13} /></button>
        </div>
      </section>

      <section className="bg-white border border-[#E2E5E0] rounded-[22px] p-5 space-y-3">
        <p className="text-[15px] font-bold text-[#111827] flex items-center gap-2"><Phone size={17} className="text-emerald-600" /> Business number</p>
        {!configured ? <p className="text-[12.5px] text-slate-500">Shows once the Meta keys are on the server.</p>
          : info === 'loading' ? <Loader2 className="animate-spin text-slate-400" />
          : !p ? <p className="text-[12.5px] text-red-600">Meta did not answer — check WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID.</p>
          : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
              {[
                ['Number', p.display_phone_number], ['Name', p.verified_name], ['Name review', p.name_status], ['Quality', p.quality_rating],
                ['Verification', p.code_verification_status], ['Platform', p.platform_type], ['App subscribed', info?.subscribed === null ? '—' : info?.subscribed ? 'Yes' : 'No'],
              ].map(([k, v]) => <div key={k}><dt className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">{k}</dt><dd className="font-semibold text-[#111827]">{v || '—'}</dd></div>)}
            </dl>
          )}
        <div className="border-t border-[#E2E5E0] pt-3 space-y-2">
          <p className="text-[12.5px] text-slate-600"><b>Connect the number</b> — registers it on the Cloud API (needs a 6-digit PIN you choose; it becomes the number's two-step PIN) and subscribes the WhatsApp account to this app. Leave the PIN empty to only subscribe. Admins only.</p>
          <div className="flex gap-2">
            <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="6-digit PIN (optional)" className={`${inputCls} w-48`} />
            <button type="button" onClick={() => void connect()} disabled={!configured || busy} className={btnPrimary}>{busy && <Loader2 size={14} className="animate-spin" />} Connect</button>
            <button type="button" onClick={load} disabled={!configured} className={btnGhost}>Refresh</button>
          </div>
        </div>
      </section>
    </div>
  )
}

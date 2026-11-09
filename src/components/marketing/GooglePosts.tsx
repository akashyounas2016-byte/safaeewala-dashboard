import { useEffect, useState } from 'react'
import { ImagePlus, Loader2, RefreshCw, Send, KeyRound, ExternalLink, X, CalendarClock, Store } from 'lucide-react'
import { notify } from '@/lib/notify'
import { fileToBase64 } from '@/lib/inboxSettings'
import { createSocialPost, isGoogleAccount, socialAccounts, socialPosts, type NewPost, type SocialAccount, type SocialPost } from '@/lib/ghlInbox'
import { formatDate } from '@/lib/utils'

const card = 'bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)]'
const input = 'w-full h-10 rounded-xl border border-[#E4E8EC] bg-white px-3 text-[13px] outline-none focus:border-emerald-400'
const STATUS_TONE: Record<string, string> = { published: 'bg-emerald-50 text-emerald-700', scheduled: 'bg-sky-50 text-sky-700', draft: 'bg-slate-100 text-slate-600', failed: 'bg-rose-50 text-rose-700' }
const ACTIONS = [['none', 'No button'], ['book', 'Book'], ['call', 'Call now'], ['learn_more', 'Learn more'], ['order', 'Order'], ['shop', 'Shop'], ['sign_up', 'Sign up']] as const
const blank = (): NewPost => ({ accountIds: [], summary: '', mode: 'now', gmb: { eventType: 'STANDARD', actionType: 'book', url: 'https://safaeewala.com' } })

/**
 * R-GHL-02: Marketing → Google posts. Posts to Google Business Profile (and the other accounts connected in GHL's
 * Social Planner) from the CRM — update, event or offer, with a button and a photo; now, scheduled or as a draft.
 * Needs the GHL key's Social Planner permission; without it the tab says exactly what to tick.
 */
export function GooglePosts() {
  const [accounts, setAccounts] = useState<SocialAccount[] | null>(null)
  const [posts, setPosts] = useState<SocialPost[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [p, setP] = useState<NewPost>(blank)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('all')

  const load = async () => {
    setProblem(null)
    try {
      const acc = await socialAccounts()
      setAccounts(acc)
      setP(x => (x.accountIds.length ? x : { ...x, accountIds: acc.filter(a => isGoogleAccount(a) && !a.expired).map(a => a.id) }))
      setPosts((await socialPosts(filter)).posts)
    } catch (e) { setProblem((e as Error).message); setAccounts([]); setPosts([]) }
  }
  useEffect(() => { void load() }, [filter]) // eslint-disable-line react-hooks/exhaustive-deps

  const g = p.gmb
  const setG = (patch: Partial<NewPost['gmb']>) => setP(x => ({ ...x, gmb: { ...x.gmb, ...patch } }))
  const submit = async () => {
    setBusy(true)
    try {
      const body: NewPost = { ...p, ...(file ? { file: { base64: await fileToBase64(file), mime: file.type, name: file.name } } : {}) }
      const r = await createSocialPost(body)
      notify.success(r.status === 'published' ? 'Posted — Google shows it within a few minutes' : r.status === 'scheduled' ? 'Post scheduled' : 'Draft saved in GHL')
      setP({ ...blank(), accountIds: p.accountIds }); setFile(null); void load()
    } catch (e) { notify.error((e as Error).message) } finally { setBusy(false) }
  }

  if (accounts === null) return <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-slate-300" /></div>
  if (problem) return (
    <section className={`${card} p-6 space-y-3 max-w-3xl`}>
      <p className="text-[15px] font-bold flex items-center gap-2"><KeyRound size={17} className="text-amber-600" /> Google posts need one setting in GHL</p>
      <p className="text-[13px] text-slate-700">{problem}</p>
      <ol className="text-[12.5px] text-slate-600 list-decimal pl-5 space-y-1">
        <li>GHL → sub-account <b>Settings → Private Integrations</b> → the key the CRM uses → <b>Edit</b>.</li>
        <li>Tick <b>View Social Media Accounts</b>, <b>View Social Media Posts</b> and <b>Edit Social Media Posts</b> (socialplanner scopes) and save. The key itself does not change.</li>
        <li>GHL → <b>Marketing → Social Planner</b>: make sure Google Business Profile is connected.</li>
        <li>Come back here and press Try again.</li>
      </ol>
      <button type="button" onClick={() => void load()} className="h-9 px-3 rounded-xl bg-[#0F1F19] text-white text-[12.5px] font-bold flex items-center gap-1.5 cursor-pointer"><RefreshCw size={13} /> Try again</button>
    </section>
  )

  const google = accounts.filter(isGoogleAccount)
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-5 items-start">
      <section className={`${card} p-5 space-y-3`}>
        <p className="text-[15px] font-bold flex items-center gap-2"><Store size={16} className="text-emerald-600" /> New Google post</p>
        {google.length === 0 && <p className="text-[12.5px] text-amber-800 bg-amber-50 rounded-lg px-3 py-2">No Google Business Profile is connected in GHL → Marketing → Social Planner. Other connected accounts can still be picked.</p>}
        <div className="flex flex-wrap gap-1.5">
          {accounts.map(a => {
            const on = p.accountIds.includes(a.id)
            return (
              <button key={a.id} type="button" disabled={a.expired} onClick={() => setP(x => ({ ...x, accountIds: on ? x.accountIds.filter(i => i !== a.id) : [...x.accountIds, a.id] }))}
                title={a.expired ? 'Connection expired — reconnect it in GHL' : a.platform}
                className={`px-3 py-1.5 rounded-full border text-[12px] font-semibold cursor-pointer disabled:opacity-40 ${on ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-[#E4E8EC] text-slate-600'}`}>
                {a.name || a.platform} <span className="text-slate-400 capitalize">· {isGoogleAccount(a) ? 'Google' : a.platform}</span>
              </button>
            )
          })}
        </div>
        <div className="grid grid-cols-3 gap-1 bg-[#F4F5F4] rounded-xl p-1">
          {(['STANDARD', 'EVENT', 'OFFER'] as const).map(t => <button key={t} type="button" onClick={() => setG({ eventType: t })} className={`py-1.5 rounded-lg text-[12.5px] font-semibold cursor-pointer ${g.eventType === t ? 'bg-white shadow-xs' : 'text-slate-500'}`}>{t === 'STANDARD' ? 'Update' : t === 'EVENT' ? 'Event' : 'Offer'}</button>)}
        </div>
        <textarea value={p.summary} onChange={e => setP(x => ({ ...x, summary: e.target.value.slice(0, 1500) }))} rows={5} placeholder="e.g. Deep cleaning this week from AED 25/hour — book on WhatsApp" className="w-full rounded-xl border border-[#E4E8EC] px-3 py-2 text-[13px] outline-none focus:border-emerald-400" />
        <p className="text-[11px] text-slate-400 -mt-2 text-right">{p.summary.length}/1500</p>
        {g.eventType === 'EVENT' && <input value={g.title || ''} onChange={e => setG({ title: e.target.value.slice(0, 58) })} placeholder="Event title (max 58)" className={input} />}
        {g.eventType === 'OFFER' && (
          <div className="grid grid-cols-2 gap-2">
            <input value={g.offerTitle || ''} onChange={e => setG({ offerTitle: e.target.value })} placeholder="Offer title" className={input} />
            <input value={g.couponCode || ''} onChange={e => setG({ couponCode: e.target.value.toUpperCase() })} placeholder="Coupon code" className={input} />
            <input value={g.redeemUrl || ''} onChange={e => setG({ redeemUrl: e.target.value })} placeholder="Booking link https://…" className={input} />
            <input value={g.termsUrl || ''} onChange={e => setG({ termsUrl: e.target.value })} placeholder="Terms link https://…" className={input} />
          </div>
        )}
        {(g.eventType === 'EVENT' || g.eventType === 'OFFER') && (
          <div className="grid grid-cols-4 gap-2">
            <label className="col-span-2 text-[11px] font-bold text-slate-500">Starts<input type="date" value={g.startDate || ''} onChange={e => setG({ startDate: e.target.value })} className={`${input} mt-1`} /></label>
            <label className="col-span-2 text-[11px] font-bold text-slate-500">Ends<input type="date" value={g.endDate || ''} onChange={e => setG({ endDate: e.target.value })} className={`${input} mt-1`} /></label>
          </div>
        )}
        {g.eventType !== 'OFFER' && (
          <div className="grid grid-cols-[150px_1fr] gap-2">
            <select value={g.actionType} onChange={e => setG({ actionType: e.target.value })} className={input} aria-label="Button">{ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            {g.actionType !== 'none' && g.actionType !== 'call' && <input value={g.url || ''} onChange={e => setG({ url: e.target.value })} placeholder="Button link https://…" className={input} />}
          </div>
        )}
        <div className="flex items-center gap-2">
          <label className="h-10 px-3 rounded-xl border border-dashed border-slate-300 text-[12.5px] font-semibold text-slate-600 flex items-center gap-1.5 cursor-pointer hover:border-emerald-400">
            <ImagePlus size={14} /> {file ? file.name : 'Photo (JPG / PNG, max 8 MB)'}
            <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f && f.size > 8 * 1024 * 1024) notify.error('A photo can be at most 8 MB'); else setFile(f || null); e.target.value = '' }} />
          </label>
          {file && <button type="button" onClick={() => setFile(null)} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer" aria-label="Remove photo"><X size={14} /></button>}
        </div>
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <select value={p.mode} onChange={e => setP(x => ({ ...x, mode: e.target.value as NewPost['mode'] }))} className={`${input} w-40`} aria-label="When">
            <option value="now">Post now</option><option value="schedule">Schedule</option><option value="draft">Save as draft</option>
          </select>
          {p.mode === 'schedule' && <input type="datetime-local" value={p.scheduleAt || ''} onChange={e => setP(x => ({ ...x, scheduleAt: e.target.value }))} className={`${input} w-56`} aria-label="Post at" />}
          <button type="button" onClick={() => void submit()} disabled={busy} className="ml-auto h-10 px-4 rounded-xl bg-emerald-600 text-white text-[13px] font-bold flex items-center gap-1.5 disabled:opacity-40 cursor-pointer">
            {busy ? <Loader2 size={14} className="animate-spin" /> : p.mode === 'schedule' ? <CalendarClock size={14} /> : <Send size={14} />} {p.mode === 'now' ? 'Post' : p.mode === 'schedule' ? 'Schedule' : 'Save draft'}
          </button>
        </div>
      </section>

      <section className={`${card} overflow-hidden`}>
        <header className="px-5 py-3 border-b border-[#E4E8EC] flex items-center gap-2">
          <p className="text-[15px] font-bold flex-1">Posts</p>
          <select value={filter} onChange={e => setFilter(e.target.value)} className="h-9 rounded-xl border border-[#E4E8EC] px-2 text-[12.5px]" aria-label="Status">
            {['all', 'scheduled', 'published', 'draft', 'failed'].map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
          <button type="button" onClick={() => void load()} className="h-9 w-9 rounded-xl border border-[#E4E8EC] flex items-center justify-center hover:bg-slate-50 cursor-pointer" aria-label="Refresh"><RefreshCw size={14} /></button>
        </header>
        <ul className="divide-y divide-slate-100 max-h-[620px] overflow-y-auto">
          {posts && posts.length === 0 && <li className="py-10 text-center text-[13px] text-slate-400">No posts yet.</li>}
          {(posts || []).map(post => (
            <li key={post.id} className="px-5 py-3 flex gap-3">
              {post.media[0] ? <img src={post.media[0]} alt="" className="w-14 h-14 rounded-xl object-cover border border-slate-200 shrink-0" /> : <span className="w-14 h-14 rounded-xl bg-slate-100 shrink-0" />}
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] text-slate-800 line-clamp-2">{post.summary || '(photo only)'}</p>
                <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                  <span className={`font-bold px-1.5 rounded capitalize ${STATUS_TONE[post.status] || 'bg-slate-100 text-slate-600'}`}>{post.status || '—'}</span>
                  <span className="capitalize">{/google|gmb/i.test(post.platform) ? 'Google' : post.platform}</span>
                  {post.at && <span>{formatDate(post.at.slice(0, 10))}</span>}
                  {post.link && <a href={post.link} target="_blank" rel="noreferrer" className="text-emerald-700 font-semibold inline-flex items-center gap-0.5">View <ExternalLink size={10} /></a>}
                </p>
                {post.error && <p className="text-[11px] text-rose-600 mt-0.5">{post.error}</p>}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

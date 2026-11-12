import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, CloudUpload, Download, FileSpreadsheet, FolderOpen, HardDrive, Laptop, RefreshCw, Server, ShieldCheck } from 'lucide-react'
import { backupHealth, backupSummary, nextBackupAt, type BackupStatus } from '@/lib/backupStatus'
import { allowBackupFolder, chooseBackupFolder, forgetBackupFolder, getLocalBackupState, sendDriveBackup, writeLocalBackup, KEEP_LOCAL_DAYS, type BackupData, type LocalBackupState } from '@/lib/localBackup'
import { getDriveWebhookUrl } from '@/lib/googleDrive'
import { todayDubai, addDays } from '@/lib/dubaiTime'

const dubai = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' }) : '—')

type Tone = 'ok' | 'warn' | 'off'
const PILL: Record<Tone, string> = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warn: 'bg-rose-50 text-rose-700 border-rose-200',
  off: 'bg-slate-100 text-slate-600 border-slate-200',
}

function Lane({ icon, title, when, tone, status, children, action }: { icon: ReactNode; title: string; when: string; tone: Tone; status: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-5 py-4">
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tone === 'ok' ? 'bg-emerald-100 text-emerald-700' : tone === 'warn' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[13.5px] font-bold text-slate-900">{title}</p>
          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${PILL[tone]}`}>{status}</span>
        </div>
        <p className="text-[11.5px] text-slate-500">{when}</p>
        <div className="text-[12px] text-slate-600 mt-1">{children}</div>
      </div>
      {action && <div className="shrink-0 flex flex-col gap-1.5 items-end">{action}</div>}
    </div>
  )
}
const btn = 'h-8 px-3 rounded-lg text-[12px] font-bold cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50'

/**
 * Settings → Backup (R-OPS-08): one clear answer to "is my data backed up?" and the three places it goes —
 * the server every night, Google Drive, and a folder on this computer — then the manual download.
 */
export function BackupOverview({ data, onExcel, onJson }: { data: BackupData; onExcel: () => void; onJson: () => void }) {
  const [server, setServer] = useState<BackupStatus | null>(null)
  const [serverError, setServerError] = useState('')
  const [local, setLocal] = useState<LocalBackupState | null>(null)
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')

  const loadServer = async () => {
    setServerError('')
    try {
      const res = await fetch('/api/backup-status')
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      setServer(await res.json() as BackupStatus)
    } catch (e) { setServerError(e instanceof Error ? e.message : 'Could not load the backup status') }
  }
  const loadLocal = async () => setLocal(await getLocalBackupState())
  useEffect(() => { void loadServer(); void loadLocal() }, [])

  const run = async (what: string, job: () => Promise<unknown>) => {
    setBusy(what); setNote('')
    try { await job() } catch (e) { setNote(e instanceof Error && e.name !== 'AbortError' ? e.message : '') }
    await loadLocal()
    setBusy('')
  }
  const saveNow = () => run('save', async () => {
    const r = await writeLocalBackup(data, { force: true })
    if (r === 'needs-permission') { if (await allowBackupFolder()) await writeLocalBackup(data, { force: true }) }
  })
  const pickFolder = () => run('pick', async () => { if (await chooseBackupFolder()) await writeLocalBackup(data, { force: true }) })
  const allow = () => run('allow', async () => { if (await allowBackupFolder()) await writeLocalBackup(data) })
  const driveNow = () => run('drive', async () => { await sendDriveBackup(data, { force: true }) })

  const health = server ? backupHealth(server, new Date()) : null
  const webhook = getDriveWebhookUrl()
  const today = todayDubai()
  const sum = backupSummary({
    server: health || 'none', serverOffsite: Boolean(server?.offsite), drive: local?.drive, local: local?.last,
    localReady: local?.permission === 'granted', today, yesterday: addDays(today, -1),
  })
  const head = sum.level === 'good'
    ? { tone: 'bg-emerald-600', icon: <ShieldCheck size={22} />, title: 'Backups are running', text: `Your data is copied every day — on the server${sum.drive ? ', in Google Drive' : ''}${sum.local ? ' and on this computer' : ''}.` }
    : sum.level === 'partial'
      ? { tone: 'bg-amber-500', icon: <AlertTriangle size={22} />, title: 'Server backup is running — add a second copy', text: 'The server saves everything every night. Turn on "This computer" below (one click) so a copy is also kept off the server.' }
      : { tone: 'bg-rose-600', icon: <AlertTriangle size={22} />, title: server || serverError ? 'The nightly server backup is NOT running' : 'Checking backups…', text: server || serverError ? 'Your data is still safe in the database (Supabase), but no new copy was made. Tell the developer.' : '' }

  return (
    <div className="space-y-4">
      {/* The answer */}
      <div className={`${head.tone} text-white rounded-[22px] p-5 flex items-start gap-4 shadow-[0_4px_20px_rgba(15,23,42,0.10)]`}>
        <span className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">{head.icon}</span>
        <div className="flex-1 min-w-0">
          <h2 className="text-[18px] font-black">{head.title}</h2>
          <p className="text-[13px] text-white/90 mt-0.5">{head.text}</p>
        </div>
        <button type="button" onClick={() => { void loadServer(); void loadLocal() }} className="h-8 px-3 rounded-lg bg-white/15 hover:bg-white/25 text-[12px] font-bold cursor-pointer inline-flex items-center gap-1.5"><RefreshCw size={12} /> Check</button>
      </div>

      {/* The three copies */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] divide-y divide-slate-100 overflow-hidden">
        <Lane icon={<Server size={18} />} title="Server copy" when="Automatic · every night at 2:00 AM (Dubai)"
          tone={health === 'ok' ? 'ok' : health === null && !serverError ? 'off' : 'warn'}
          status={serverError ? 'Not reachable' : health === 'ok' ? 'Working' : health === 'failed' ? 'Last run failed' : health === 'stale' ? 'Stopped' : health === 'none' ? 'Not set up' : 'Checking…'}>
          {serverError ? <span className="text-rose-600">{serverError}</span>
            : server?.at ? <>Last copy <b>{dubai(server.at)}</b> · {server.daily_count ?? 0} daily + {server.monthly_count ?? 0} monthly copies kept ({server.total_size || '—'}) · next {dubai(nextBackupAt(new Date()).toISOString())}. Daily copies are kept {server.keep_days || 30} days, the 1st of each month for good.</>
            : 'The full database, sign-ins and leads are saved on the server.'}
        </Lane>

        <Lane icon={<CloudUpload size={18} />} title="Google Drive copy" when={server?.offsite ? 'Automatic · with the nightly server copy' : webhook ? 'Automatic · daily, when an admin opens the CRM' : 'Not set up yet'}
          tone={sum.drive ? 'ok' : (local?.drive?.error ? 'warn' : 'off')}
          status={sum.drive ? 'Working' : local?.drive?.error ? 'Last send failed' : 'Off'}
          action={webhook ? <button type="button" onClick={driveNow} disabled={busy === 'drive'} className={`${btn} border border-slate-200 text-slate-700 hover:bg-slate-50`}><CloudUpload size={12} /> {busy === 'drive' ? 'Sending…' : 'Send now'}</button> : undefined}>
          {server?.offsite ? 'Every server copy also goes to the company Google Drive.'
            : local?.drive?.date ? <>{local.drive.error ? <span className="text-rose-600">Last try {dubai(local.drive.at)}: {local.drive.error}</span> : <>Last copy sent <b>{dubai(local.drive.at)}</b>.</>}</>
            : webhook ? 'The first copy is sent the next time an admin opens the CRM.'
            : <>Needs a one-time Google sign-in on the server (owner step — the developer sets it up with you). Or paste a Drive webhook under <i>Advanced</i> below.</>}
        </Lane>

        <Lane icon={<Laptop size={18} />} title="This computer" when={`Automatic · daily, the first time an admin opens the CRM · last ${KEEP_LOCAL_DAYS} days kept`}
          tone={!local?.supported ? 'off' : sum.local ? 'ok' : local?.last?.error || local?.permission === 'prompt' ? 'warn' : 'off'}
          status={!local ? 'Checking…' : !local.supported ? 'Not available here' : !local.folder ? 'Off' : local.permission !== 'granted' ? 'Needs your OK' : sum.local ? 'Working' : local.last?.error ? 'Last save failed' : 'On'}
          action={local?.supported ? (
            !local.folder ? <button type="button" onClick={pickFolder} disabled={!!busy} className={`${btn} bg-emerald-700 text-white hover:bg-emerald-800`}><FolderOpen size={12} /> {busy === 'pick' ? 'Saving…' : 'Choose folder'}</button>
            : local.permission !== 'granted' ? <button type="button" onClick={allow} disabled={!!busy} className={`${btn} bg-amber-500 text-white hover:bg-amber-600`}><CheckCircle2 size={12} /> Allow</button>
            : <>
                <button type="button" onClick={saveNow} disabled={!!busy} className={`${btn} border border-slate-200 text-slate-700 hover:bg-slate-50`}><HardDrive size={12} /> {busy === 'save' ? 'Saving…' : 'Save now'}</button>
                <button type="button" onClick={() => run('forget', forgetBackupFolder)} disabled={!!busy} className="text-[11px] text-slate-400 hover:text-rose-600 cursor-pointer">Turn off</button>
              </>
          ) : undefined}>
          {!local ? '' : !local.supported ? 'Use Chrome or Edge on a computer to keep a daily copy in a folder. You can always download a copy below.'
            : !local.folder ? 'Pick a folder once (for example Documents → Safaeewala Backups). A JSON (restorable) and an Excel copy are saved there every day.'
            : local.permission !== 'granted' ? <>The browser needs your OK for the folder <b>{local.folder}</b> again. Press Allow and choose “Allow on every visit”.</>
            : local.last?.error ? <span className="text-rose-600">Last try {dubai(local.last.at)}: {local.last.error}</span>
            : local.last ? <>Last copy <b>{dubai(local.last.at)}</b> in <b>{local.folder}</b>.</>
            : <>Folder <b>{local.folder}</b> — the first copy is saved in a moment.</>}
        </Lane>
      </div>
      {note && <p className="text-[12px] text-rose-600 px-1">{note}</p>}

      {/* Manual */}
      <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[14px] font-bold text-slate-900">Download a copy now</h3>
          <p className="text-[12px] text-slate-500">Excel to read, JSON to restore. Everything: bookings, clients, employees, invoices, inventory, job sheet, expenses.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onExcel} className={`${btn} bg-emerald-700 text-white hover:bg-emerald-800`}><FileSpreadsheet size={13} /> Excel</button>
          <button type="button" onClick={onJson} className={`${btn} border border-slate-200 text-slate-700 hover:bg-slate-50`}><Download size={13} /> JSON</button>
        </div>
      </div>
    </div>
  )
}

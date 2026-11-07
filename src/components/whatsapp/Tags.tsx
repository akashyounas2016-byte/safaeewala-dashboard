import { useEffect, useState, useSyncExternalStore } from 'react'
import { Plus, X, Check, Tag as TagIcon } from 'lucide-react'
import { notify } from '@/lib/notify'
import { DEFAULT_TAGS, TAG_COLORS, TAG_TONE, loadTagDefs, saveTagDefs, tagTone, type TagDef } from '@/lib/inboxSettings'

/**
 * R-INBOX-03: chat tags — a shared list of tag names with colours (Settings → Tags, or "New tag" in any chat),
 * used on WhatsApp, Facebook and Instagram chats alike.
 */
let defs: TagDef[] = DEFAULT_TAGS
let loaded = false
const subs = new Set<() => void>()
const emit = () => subs.forEach(f => f())
export function useTagDefs(): TagDef[] {
  useEffect(() => {
    if (loaded) return
    loaded = true
    void loadTagDefs().then(v => { if (v && v.length) { defs = v; emit() } }).catch(() => {})
  }, [])
  return useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f) } }, () => defs)
}
export async function setTagDefs(next: TagDef[]) {
  const before = defs
  defs = next; emit()
  try { await saveTagDefs(next) } catch (e) { defs = before; emit(); throw e }
}

export function TagChip({ name, defsList, onRemove }: { name: string; defsList: TagDef[]; onRemove?: () => void }) {
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold border pl-1.5 ${onRemove ? 'pr-0.5' : 'pr-1.5'} py-px rounded-md ${tagTone(defsList, name)}`}>
      {name}{onRemove && <button type="button" onClick={onRemove} className="p-0.5 cursor-pointer opacity-70 hover:opacity-100" aria-label={`Remove ${name}`}><X size={10} /></button>}
    </span>
  )
}

/** Tags of one chat + a picker (existing tags, or a new one with a colour) */
export function TagPicker({ tags, onChange, disabled }: { tags: string[]; onChange: (next: string[]) => void; disabled?: boolean }) {
  const list = useTagDefs()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>('sky')
  const has = (n: string) => tags.some(t => t.toLowerCase() === n.toLowerCase())
  const toggle = (n: string) => onChange(has(n) ? tags.filter(t => t.toLowerCase() !== n.toLowerCase()) : [...tags, n])
  const create = async () => {
    const n = name.trim().replace(/\s+/g, ' ').slice(0, 30)
    if (!n) return
    if (!list.some(d => d.name.toLowerCase() === n.toLowerCase())) {
      try { await setTagDefs([...list, { name: n, color }]) } catch (e) { notify.error((e as Error).message); return }
    }
    if (!has(n)) onChange([...tags, n])
    setName('')
  }
  return (
    <span className="relative inline-flex items-center gap-1 flex-wrap">
      {tags.map(t => <TagChip key={t} name={t} defsList={list} onRemove={disabled ? undefined : () => toggle(t)} />)}
      {!disabled && (
        <button type="button" onClick={() => setOpen(o => !o)} className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-1.5 py-px rounded-md border border-dashed border-slate-300 cursor-pointer">
          <TagIcon size={10} /> Tag
        </button>
      )}
      {open && (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-20 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-7 z-30 w-60 bg-white border border-[#E6E8E6] rounded-xl shadow-xl p-1.5">
            {list.map(d => (
              <button key={d.name} type="button" onClick={() => toggle(d.name)} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                <span className={`w-2.5 h-2.5 rounded-full border ${TAG_TONE[d.color] || ''}`} /><span className="flex-1 text-left text-[12.5px]">{d.name}</span>{has(d.name) && <Check size={13} className="text-emerald-600" />}
              </button>
            ))}
            <div className="border-t border-[#ECEEEC] mt-1 pt-1.5 px-1 space-y-1.5">
              <div className="flex gap-1">
                <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void create() }} placeholder="New tag" className="flex-1 min-w-0 rounded-lg bg-[#F4F5F4] px-2 py-1 text-[12px] outline-none" />
                <button type="button" onClick={() => void create()} disabled={!name.trim()} className="p-1.5 rounded-lg bg-emerald-600 text-white disabled:opacity-30 cursor-pointer" aria-label="Add tag"><Plus size={12} /></button>
              </div>
              <div className="flex gap-1">
                {TAG_COLORS.map(c => <button key={c} type="button" onClick={() => setColor(c)} aria-label={c} className={`w-5 h-5 rounded-full border-2 cursor-pointer ${TAG_TONE[c]} ${color === c ? 'ring-2 ring-offset-1 ring-slate-400' : ''}`} />)}
              </div>
            </div>
          </div>
        </>
      )}
    </span>
  )
}

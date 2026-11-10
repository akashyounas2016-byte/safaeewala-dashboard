import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react'

/**
 * UX-133: one white dropdown for forms, styled like the Booking screen's Location / Area picker.
 * Replaces native <select>, whose option list turns black on Windows dark mode.
 * - Search box at the top; `allowCustom` adds a "Use “…”" row so a value not in the list can be typed.
 * - `name` writes a hidden <input> so plain FormData forms keep working.
 */
export interface SearchSelectOption {
  value: string
  label: string
  hint?: string
}

interface Props {
  label?: string
  name?: string
  value: string
  onChange: (value: string) => void
  options: Array<SearchSelectOption | string>
  placeholder?: string
  allowCustom?: boolean
  /** Shown as the first row; picking it sets '' */
  emptyLabel?: string
  required?: boolean
  id?: string
  className?: string
  size?: 'sm' | 'md'
}

export function SearchSelect({ label, name, value, onChange, options, placeholder = 'Select…', allowCustom, emptyLabel, required, id, className = '', size = 'md' }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const opts = useMemo(() => options.map(o => (typeof o === 'string' ? { value: o, label: o } : o)), [options])
  const current = opts.find(o => o.value === value)
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? opts.filter(o => o.label.toLowerCase().includes(t) || (o.hint || '').toLowerCase().includes(t)) : opts
  }, [opts, q])
  const exact = opts.some(o => o.label.toLowerCase() === q.trim().toLowerCase())

  useEffect(() => {
    if (!open) return
    setQ('')
    setTimeout(() => searchRef.current?.focus(), 0)
    const away = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  const pick = (v: string) => { onChange(v); setOpen(false) }
  const pad = size === 'sm' ? 'px-2.5 py-1.5 text-[11.5px] min-h-[36px]' : 'px-3 py-2 text-[12.5px] min-h-[40px]'

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      {label && <label htmlFor={id} className="text-[11.5px] font-bold text-slate-700 block mb-1">{label}</label>}
      {name && <input type="hidden" name={name} value={value} />}
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true) } }}
        className={`w-full flex items-center justify-between gap-2 bg-white border rounded-xl shadow-2xs cursor-pointer text-left transition-all ${pad} ${
          open ? 'border-teal-600 ring-2 ring-teal-500/15' : 'border-slate-200 hover:border-slate-300'
        } ${required && !value ? 'border-amber-300' : ''}`}
      >
        <span className={`truncate font-semibold ${value ? 'text-slate-800' : 'text-slate-400 font-medium'}`}>
          {current?.label || value || emptyLabel || placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {value && !required && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear"
              onClick={e => { e.stopPropagation(); onChange('') }}
              className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X size={12} />
            </span>
          )}
          <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-180 text-teal-600' : ''}`} />
        </span>
      </button>

      {open && (
        <div role="listbox" className="absolute z-50 left-0 right-0 min-w-[200px] mt-1.5 bg-white text-slate-800 border border-slate-200 rounded-xl shadow-xl p-2 max-h-64 flex flex-col">
          {(opts.length > 6 || allowCustom) && (
            <div className="relative mb-2 shrink-0">
              <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input
                ref={searchRef}
                type="text"
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) }
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (shown[0]) pick(shown[0].value)
                    else if (allowCustom && q.trim()) pick(q.trim())
                  }
                }}
                placeholder={allowCustom ? 'Search or type a new value…' : 'Search…'}
                className="w-full text-[12px] pl-7 pr-2 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:border-teal-500 focus:bg-white font-medium"
              />
            </div>
          )}
          {allowCustom && q.trim() && !exact && (
            <div
              onClick={() => pick(q.trim())}
              className="px-3 py-2 rounded-lg bg-teal-50 text-teal-900 hover:bg-teal-100 text-[12px] font-bold flex items-center gap-2 cursor-pointer mb-1 shrink-0"
            >
              <Plus size={13} className="text-teal-700" />
              <span className="truncate">Use “{q.trim()}”</span>
            </div>
          )}
          <div className="overflow-y-auto flex-1 space-y-0.5">
            {emptyLabel && !q.trim() && (
              <div onClick={() => pick('')} className={`px-3 py-1.5 rounded-lg cursor-pointer text-[12px] ${!value ? 'bg-teal-50 font-bold text-teal-950' : 'hover:bg-slate-50 text-slate-500'}`}>
                {emptyLabel}
              </div>
            )}
            {shown.map(o => {
              const sel = o.value === value
              return (
                <div
                  key={o.value}
                  role="option"
                  aria-selected={sel}
                  onClick={() => pick(o.value)}
                  className={`px-3 py-1.5 rounded-lg cursor-pointer flex items-center justify-between gap-2 text-[12px] ${sel ? 'bg-teal-50 text-teal-950 font-bold' : 'hover:bg-slate-50 text-slate-700 font-medium'}`}
                >
                  <span className="truncate">
                    {o.label}
                    {o.hint && <span className="text-slate-400 font-normal"> · {o.hint}</span>}
                  </span>
                  {sel && <Check size={13} className="text-teal-600 stroke-[3] shrink-0" />}
                </div>
              )
            })}
            {shown.length === 0 && !(allowCustom && q.trim()) && <p className="px-3 py-2 text-[11.5px] text-slate-400">No match</p>}
          </div>
        </div>
      )}
    </div>
  )
}

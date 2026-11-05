import { AlertCircle } from 'lucide-react'
import { focusField, type RequiredRule } from '@/lib/requiredFields'

/** UX-84: top-of-form message naming the required fields still empty; a click jumps to the field */
export function RequiredBanner({ missing, className = '' }: { missing: RequiredRule[]; className?: string }) {
  if (missing.length === 0) return null
  return (
    <div role="alert" data-required-banner className={`mb-3 px-3.5 py-2.5 rounded-xl border border-rose-300 bg-rose-50 text-rose-800 text-[12.5px] ${className}`}>
      <p className="font-bold flex items-center gap-1.5">
        <AlertCircle size={15} className="shrink-0" />
        Not saved: {missing.length === 1 ? 'this field is required' : `${missing.length} required fields are empty`}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {missing.map(r => (
          <button key={r.key} type="button" onClick={() => focusField(r.key)}
            className="px-2 py-0.5 rounded-lg bg-white border border-rose-300 text-rose-700 font-semibold text-[11.5px] hover:bg-rose-100 cursor-pointer">
            {r.label}
          </button>
        ))}
      </div>
    </div>
  )
}

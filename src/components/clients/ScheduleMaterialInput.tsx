import { useId } from 'react'
import { safeLocalStorageGet } from '@/lib/storageUtils'

const DEFAULTS = ['No', 'Yes', 'Chemicals Only', 'Machines Only', 'Sofa Kit', 'Ladder']

/**
 * R-SCHED-27: Material of a schedule day — a dropdown of the shared materials list (Add Job / Excel) that also takes
 * any text typed (custom editable dropdown).
 */
export function ScheduleMaterialInput({ value, onChange, disabled, className }: { value: string; onChange: (v: string) => void; disabled?: boolean; className?: string }) {
  const id = useId().replace(/:/g, '')
  const gone = new Set(safeLocalStorageGet<string[]>('safaeewala_deleted_materials', []).map(m => m.toLowerCase()))
  const list = Array.from(new Set(safeLocalStorageGet<string[]>('safaeewala_job_materials', DEFAULTS))).filter(m => !gone.has(m.toLowerCase()))
  return (
    <>
      <input list={`mat-${id}`} value={value} disabled={disabled} onChange={e => onChange(e.target.value)} placeholder="No"
        aria-label="Material" className={className} />
      <datalist id={`mat-${id}`}>{list.map(m => <option key={m} value={m} />)}</datalist>
    </>
  )
}

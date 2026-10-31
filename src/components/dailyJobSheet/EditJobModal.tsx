import React from 'react'
import { Modal } from '@/components/ui/Modal'
import { AddJobForm } from './AddJobModal'
import { useData } from '@/store/DataContext'
import type { DailyJob, Employee } from '@/types'
import { Check } from 'lucide-react'

export interface EditJobModalProps {
  open: boolean
  job: DailyJob | null
  onClose: () => void
  onSave: (id: string, patch: Partial<DailyJob>) => void
  employees: Employee[]
  existingJobsForDate?: DailyJob[]
}

/**
 * EditJobModal — Standardized to render the exact same 5-Card Layout as AddJobModal
 * with pre-populated values and clash prevention.
 */
export function EditJobModal({
  open,
  job,
  onClose,
  onSave,
  employees,
  existingJobsForDate = [],
}: EditJobModalProps) {
  const { clients } = useData()

  if (!open || !job) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit Job Entry"
      size="5xl"
      footer={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-[12.5px] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-job-entry-form"
            className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-[12.5px] shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Check size={15} className="stroke-[3]" />
            <span>Save Changes</span>
          </button>
        </div>
      }
    >
      <AddJobForm
        key={job.id}
        employees={employees}
        clients={clients}
        onClose={onClose}
        initial={job}
        existingJobsForDate={existingJobsForDate}
        onSave={updatedJobData => {
          onSave(job.id, updatedJobData)
          onClose()
        }}
      />
    </Modal>
  )
}

import { useState } from 'react'
import { Star, Send, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

export function CrewRatingModal({
  open,
  onClose,
  crewName,
  jobDetails,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  crewName: string
  jobDetails: { clientName: string; serviceType: string; date: string }
  onSubmit: (rating: number, feedback: string) => void
}) {
  const [rating, setRating] = useState(5)
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      await onSubmit(rating, feedback)
      setRating(5)
      setFeedback('')
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Rate ${crewName}'s Performance`} size="md">
      <div className="space-y-5">
        {/* Job Context */}
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <p className="text-[12px] font-semibold text-slate-600 mb-2">JOB DETAILS</p>
          <p className="text-[13px] text-slate-800 font-medium">{jobDetails.clientName}</p>
          <p className="text-[12px] text-slate-600">{jobDetails.serviceType} • {jobDetails.date}</p>
        </div>

        {/* Star Rating */}
        <div>
          <p className="text-[12px] font-semibold text-slate-600 mb-3">OVERALL RATING</p>
          <div className="flex gap-2 justify-center">
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                onClick={() => setRating(star)}
                className="transition-transform hover:scale-110"
              >
                <Star
                  size={32}
                  className={star <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300 text-slate-300'}
                />
              </button>
            ))}
          </div>
          <p className="text-center text-[13px] font-bold text-amber-600 mt-2">
            {['Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][rating - 1]}
          </p>
        </div>

        {/* Feedback */}
        <div>
          <label className="text-[12px] font-semibold text-slate-600 block mb-2">FEEDBACK (OPTIONAL)</label>
          <Textarea
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            placeholder="Mention what went well, areas for improvement, or special notes…"
            rows={3}
            maxLength={500}
          />
          <p className="text-[10px] text-slate-400 mt-1">{feedback.length}/500</p>
        </div>

        {/* Pre-filled Common Feedback */}
        <div>
          <p className="text-[11px] font-semibold text-slate-600 mb-2">QUICK TAGS</p>
          <div className="flex flex-wrap gap-2">
            {[
              '✓ Professional',
              '✓ On time',
              '✓ Quality work',
              '⚠️ Late',
              '⚠️ Quality issues',
            ].map(tag => (
              <button
                key={tag}
                onClick={() =>
                  setFeedback(prev =>
                    prev.includes(tag) ? prev.replace(`${tag} `, '') : `${prev}${tag} `.trim()
                  )
                }
                className={`text-[11px] px-3 py-1.5 rounded-lg transition-colors ${
                  feedback.includes(tag)
                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 pt-3 border-t border-slate-200">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Skip
          </Button>
          <Button className="flex-1 flex items-center justify-center gap-2" onClick={handleSubmit} disabled={submitting}>
            <Send size={14} />
            {submitting ? 'Submitting...' : 'Submit Rating'}
          </Button>
        </div>

        <p className="text-[11px] text-slate-500 italic flex items-start gap-2">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          This feedback helps us maintain service quality and reward excellent team members.
        </p>
      </div>
    </Modal>
  )
}

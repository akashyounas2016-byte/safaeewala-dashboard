import { cn } from '@/lib/utils'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const variants: Record<BadgeVariant, string> = {
  default: 'bg-line text-ink-soft',
  success: 'bg-teal-soft text-teal',
  warning: 'bg-amber-soft text-amber-deep',
  danger:  'bg-coral-soft text-coral',
  info:    'bg-sky-soft text-sky',
  neutral: 'bg-line text-ink-mute',
}

interface BadgeProps {
  label: string
  variant?: BadgeVariant
  className?: string
}

export function Badge({ label, variant = 'default', className }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', variants[variant], className)}>
      {label}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    pending:     { label: 'Pending',     variant: 'warning' },
    confirmed:   { label: 'Confirmed',   variant: 'info'    },
    in_progress: { label: 'In Progress', variant: 'success' },
    completed:   { label: 'Completed',   variant: 'neutral' },
    cancelled:   { label: 'Cancelled',   variant: 'danger'  },
    active:      { label: 'Active',      variant: 'success' },
    on_leave:    { label: 'On Leave',    variant: 'warning' },
    inactive:    { label: 'Inactive',    variant: 'danger'  },
    draft:       { label: 'Draft',       variant: 'neutral' },
    sent:        { label: 'Sent',        variant: 'info'    },
    paid:        { label: 'Paid',        variant: 'success' },
    overdue:     { label: 'Overdue',     variant: 'danger'  },
  }
  const config = map[status] ?? { label: status, variant: 'default' as BadgeVariant }
  return <Badge label={config.label} variant={config.variant} />
}

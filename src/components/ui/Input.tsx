import { cn } from '@/lib/utils'
import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
}

export function Input({ label, error, icon, className, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-medium text-ink-soft">{label}</label>}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute">
            {icon}
          </span>
        )}
        <input
          className={cn(
            'w-full rounded-lg border border-line bg-elevated px-3 py-2 text-sm text-ink placeholder:text-ink-mute',
            'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent',
            'transition-colors duration-150',
            icon && 'pl-9',
            error && 'border-coral focus:border-coral focus:ring-coral/20',
            className
          )}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-coral">{error}</p>}
    </div>
  )
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
}

export function Select({ label, error, className, children, ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-medium text-ink-soft">{label}</label>}
      <select
        className={cn(
          'w-full rounded-lg border border-line bg-elevated px-3 py-2 text-sm text-ink',
          'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent',
          'transition-colors duration-150 cursor-pointer',
          error && 'border-coral',
          className
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-coral">{error}</p>}
    </div>
  )
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export function Textarea({ label, error, className, ...props }: TextareaProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-medium text-ink-soft">{label}</label>}
      <textarea
        className={cn(
          'w-full rounded-lg border border-line bg-elevated px-3 py-2 text-sm text-ink placeholder:text-ink-mute resize-none',
          'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent',
          'transition-colors duration-150',
          error && 'border-coral',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-coral">{error}</p>}
    </div>
  )
}

import { cn } from '@/lib/utils'
import { getInitials } from '@/lib/utils'

const colors = [
  'bg-teal-soft text-teal',
  'bg-sky-soft text-sky',
  'bg-[#e4dff5] text-[#6b5bb5]',
  'bg-amber-soft text-amber-deep',
  'bg-coral-soft text-coral',
  'bg-accent-soft text-accent',
]

function colorFor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

interface AvatarProps {
  name: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-12 h-12 text-base' }

export function Avatar({ name, size = 'md', className }: AvatarProps) {
  return (
    <div className={cn('rounded-full flex items-center justify-center font-semibold shrink-0', sizes[size], colorFor(name), className)}>
      {getInitials(name)}
    </div>
  )
}

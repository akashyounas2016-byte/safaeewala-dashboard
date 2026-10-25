import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import { useEffect } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  lockScroll?: boolean
}

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export function Modal({ open, onClose, title, children, size = 'md', lockScroll = false }: ModalProps) {
  useEffect(() => {
    if (lockScroll && open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open, lockScroll])

  // Ensure scroll is unlocked when component unmounts
  useEffect(() => {
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  if (!open) return null

  // When scrolling on the backdrop (outside modal dialog), smoothly scroll the background page
  const handleBackdropWheel = (e: React.WheelEvent) => {
    const mainEl = document.querySelector('main')
    if (mainEl) {
      mainEl.scrollTop += e.deltaY
      mainEl.scrollLeft += e.deltaX
    } else {
      window.scrollBy({ top: e.deltaY, left: e.deltaX, behavior: 'auto' })
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      onWheel={handleBackdropWheel}
    >
      <div
        className="absolute inset-0 bg-black/35 transition-opacity"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative bg-elevated rounded-2xl shadow-2xl w-full flex flex-col',
          'max-h-[88vh]',
          sizes[size]
        )}
        onWheel={(e) => {
          // Keep scrolling contained within the modal card when cursor is over it
          e.stopPropagation()
        }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-line shrink-0">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-ink-mute hover:text-ink-soft hover:bg-line transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 overscroll-contain">
          <div className="px-6 py-5 pb-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

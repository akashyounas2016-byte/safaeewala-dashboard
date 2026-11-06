import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '5xl'
  lockScroll?: boolean
  className?: string
  bodyClassName?: string
  headerActions?: React.ReactNode
  /** Buttons pinned under the scrolling body (e.g. Cancel / Save) */
  footer?: React.ReactNode
}

// UX-105: Esc closes only the popup on top (a popup opened from another popup)
const openStack: symbol[] = []

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-5xl',
  '5xl': 'max-w-7xl', // full Add / Edit Job form
}

export function Modal({ open, onClose, title, children, size = 'md', lockScroll = false, className, bodyClassName, headerActions, footer }: ModalProps) {
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

  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })
  useEffect(() => {
    if (!open) return
    const me = Symbol('modal')
    openStack.push(me)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || openStack[openStack.length - 1] !== me) return
      e.stopPropagation()
      closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); openStack.splice(openStack.indexOf(me), 1) }
  }, [open])

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

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      onWheel={handleBackdropWheel}
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative bg-elevated rounded-2xl shadow-2xl w-full flex flex-col',
          'max-h-[88vh]',
          sizes[size],
          className
        )}
        role="dialog"
        aria-modal="true"
        onWheel={(e) => {
          // Keep scrolling contained within the modal card when cursor is over it
          e.stopPropagation()
        }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-line shrink-0 gap-3">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <div className="flex items-center gap-2">
            {headerActions}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-ink-mute hover:text-ink-soft hover:bg-line transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 overscroll-contain">
          <div className={cn("px-6 py-5 pb-6", bodyClassName)} data-modal-body>
            {children}
          </div>
        </div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-line shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent
}


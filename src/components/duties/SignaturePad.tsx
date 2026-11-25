import { useEffect, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'

/** R-APP-04: the client signs with a finger at End job; gives a PNG (or null while empty) */
export function SignaturePad({ onChange }: { onChange: (png: Blob | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [empty, setEmpty] = useState(true)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ratio = window.devicePixelRatio || 1
    c.width = c.offsetWidth * ratio; c.height = c.offsetHeight * ratio
    const ctx = c.getContext('2d')!
    ctx.scale(ratio, ratio); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0f172a'
  }, [])

  const at = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const }
  const done = () => {
    if (!drawing.current) return
    drawing.current = false
    ref.current?.toBlob(b => onChange(b), 'image/png')
  }
  const clear = () => {
    const c = ref.current
    if (!c) return
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    setEmpty(true); onChange(null)
  }
  return (
    <div>
      <div className="relative">
        <canvas ref={ref} aria-label="Client signature" className="w-full h-28 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 touch-none"
          onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; setEmpty(false); const [x, y] = at(e); const ctx = e.currentTarget.getContext('2d')!; ctx.beginPath(); ctx.moveTo(x, y) }}
          onPointerMove={e => { if (!drawing.current) return; const [x, y] = at(e); const ctx = e.currentTarget.getContext('2d')!; ctx.lineTo(x, y); ctx.stroke() }}
          onPointerUp={done} onPointerCancel={done} onPointerLeave={done} />
        {empty && <span className="absolute inset-0 flex items-center justify-center text-[12px] text-slate-400 pointer-events-none">Client signs here (optional)</span>}
      </div>
      {!empty && <button type="button" onClick={clear} className="mt-1 text-[11.5px] font-bold text-slate-500 flex items-center gap-1 cursor-pointer"><Eraser size={12} /> Clear</button>}
    </div>
  )
}

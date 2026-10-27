import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/** Client-side paging for long lists (UX-03). Resets to page 1 when the list changes length. */
export function usePagination<T>(items: T[], pageSize = 25) {
  const [page, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(items.length / pageSize))
  useEffect(() => { setPage(1) }, [items.length, pageSize])
  const safePage = Math.min(page, pages)
  const pageItems = useMemo(() => items.slice((safePage - 1) * pageSize, safePage * pageSize), [items, safePage, pageSize])
  return { page: safePage, pages, setPage, pageItems, total: items.length, pageSize }
}

export function Pager({ page, pages, setPage, total, pageSize }: {
  page: number; pages: number; setPage: (p: number) => void; total: number; pageSize: number
}) {
  if (total <= pageSize) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 text-[12px] text-slate-500">
      <span>
        Showing <strong className="text-slate-800">{from}–{to}</strong> of <strong className="text-slate-800">{total}</strong>
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setPage(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-default cursor-pointer"
          title="Previous page"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="px-2 font-semibold text-slate-700">{page} / {pages}</span>
        <button
          type="button"
          onClick={() => setPage(page + 1)}
          disabled={page >= pages}
          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-default cursor-pointer"
          title="Next page"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

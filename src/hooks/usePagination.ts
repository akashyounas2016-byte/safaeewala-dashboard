import { useMemo, useState } from 'react'

/** Client-side paging for long lists (UX-03). Goes back to page 1 when the list length changes. */
export function usePagination<T>(items: T[], pageSize = 25) {
  const [state, setState] = useState({ page: 1, len: items.length })
  // Reset during render (not in an effect) when the list changes
  if (state.len !== items.length) setState({ page: 1, len: items.length })
  const pages = Math.max(1, Math.ceil(items.length / pageSize))
  const page = Math.min(state.len === items.length ? state.page : 1, pages)
  const pageItems = useMemo(() => items.slice((page - 1) * pageSize, page * pageSize), [items, page, pageSize])
  const setPage = (p: number) => setState(s => ({ ...s, page: p }))
  return { page, pages, setPage, pageItems, total: items.length, pageSize }
}

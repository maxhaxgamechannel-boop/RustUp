import { useCallback, useEffect, useRef, useState } from 'react'
import type { Item } from '../types'
import { CatalogError, fetchSkins, type Query } from './catalog'

interface S { items: Item[]; page: number; pages: number; total: number; loading: boolean; more: boolean; capped: boolean; error: CatalogError | null }
const init: S = { items: [], page: 0, pages: 0, total: 0, loading: true, more: false, capped: false, error: null }

export function useCatalog(q: Query, perPage = 48, enabled = true) {
  const [st, setSt] = useState<S>(init)
  const ctl = useRef<AbortController | null>(null)
  const key = `${q.item}|${q.search}|${q.sort}|${q.category}|${enabled}`
  const load = useCallback(async (page: number, reset: boolean) => {
    ctl.current?.abort()
    if (!enabled) { setSt(s => ({ ...s, loading: false, more: false, error: null })); return }
    const c = new AbortController(); ctl.current = c
    setSt(s => reset ? { ...init } : { ...s, more: true, error: null })
    try {
      const r = await fetchSkins(q, page, perPage, c.signal)
      if (c.signal.aborted) return
      setSt(s => ({ items: reset ? r.results : [...s.items, ...r.results.filter(n => !s.items.some(o => o.id === n.id))], page: r.page, pages: r.pages, total: r.total, loading: false, more: false, capped: r.capped, error: null }))
    } catch (e) {
      if (c.signal.aborted) return
      setSt(s => ({ ...s, loading: false, more: false, error: e instanceof CatalogError ? e : new CatalogError('UNKNOWN', 'Неизвестная ошибка каталога') }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, perPage])
  useEffect(() => { void load(1, true); return () => ctl.current?.abort() }, [load])
  return { ...st, hasMore: st.page > 0 && st.page < st.pages, loadMore: () => { if (!st.more && !st.loading) void load(st.page + 1, false) }, retry: () => void load(st.page > 0 && st.items.length ? st.page + 1 : 1, !st.items.length) }
}
export type Catalog = ReturnType<typeof useCatalog>

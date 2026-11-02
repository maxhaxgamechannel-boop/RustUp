import { useCallback, useEffect, useState } from 'react'
import { CatalogError, fetchTargets } from './catalog'
import { idealPrice, pickTargets, type Pick } from './targets'

export function useTargets(total: number, pct: number | null, item: string, search: string, category: string) {
  const [st, setSt] = useState<{ picks: Pick[]; loading: boolean; error: CatalogError | null }>({ picks: [], loading: false, error: null })
  const [tick, setTick] = useState(0)
  const key = `${Math.round(total)}|${pct}|${item}|${search}|${category}|${tick}`
  useEffect(() => {
    if (!pct || !(total > 0)) { setSt({ picks: [], loading: false, error: null }); return }
    const c = new AbortController()
    setSt(s => ({ ...s, loading: true, error: null }))
    const t = setTimeout(async () => {
      try {
        const cands = await fetchTargets(idealPrice(total, pct), { item, search, category }, c.signal)
        if (!c.signal.aborted) setSt({ picks: pickTargets(cands, total, pct), loading: false, error: null })
      } catch (e) {
        if (!c.signal.aborted) setSt({ picks: [], loading: false, error: e instanceof CatalogError ? e : new CatalogError('UNKNOWN', 'Неизвестная ошибка подбора целей') })
      }
    }, 250)
    return () => { clearTimeout(t); c.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return { ...st, retry: useCallback(() => setTick(x => x + 1), []) }
}

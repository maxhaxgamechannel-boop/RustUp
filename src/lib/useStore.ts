import { useCallback, useEffect, useRef, useState } from 'react'
import type { Attempt, Item, Owned } from '../types'
import { START_BALANCE } from '../data/config'
import { uid } from './id'
import { buy as buyFn, sellMany as sellFn, type State } from './economy'
import { runUpgrade, type RunOut } from './engine'

// Ключи v2: прежние данные (с выдуманными ценами) не переносятся.
const K = { bal: 'rustup2.balance', inv: 'rustup2.inv', hist: 'rustup2.history' }
function read<T>(k: string): T | null { try { const s = localStorage.getItem(k); return s ? (JSON.parse(s) as T) : null } catch { return null } }
const okItem = (i: unknown): i is Item => { const x = i as Item; return !!x && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.icon === 'string' && Number.isFinite(x.price) && x.price > 0 && typeof x.defId === 'number' }

function load(): State {
  const bal = read<number>(K.bal), seen = new Set<string>()
  const inv = (read<Owned[]>(K.inv) ?? []).filter(o => o && typeof o.uid === 'string' && okItem(o.item) && !seen.has(o.uid) && !!seen.add(o.uid))
  const history = (read<Attempt[]>(K.hist) ?? []).filter(h => h && Array.isArray(h.from) && h.from.every(okItem) && okItem(h.to))
  return { balance: typeof bal === 'number' && Number.isFinite(bal) && bal >= 0 ? bal : START_BALANCE, inv, history }
}

export function useStore() {
  const [st, setSt] = useState<State>(load)
  const ref = useRef(st)  // синхронное зеркало: защита от двойных кликов
  const lock = useRef(false)
  const apply = <T extends { ok: boolean }>(o: T & { state?: State }) => { if (o.ok && o.state) { ref.current = o.state; setSt(o.state) } return o }
  useEffect(() => { try { localStorage.setItem(K.bal, JSON.stringify(st.balance)); localStorage.setItem(K.inv, JSON.stringify(st.inv)); localStorage.setItem(K.hist, JSON.stringify(st.history)) } catch { /* ignore */ } }, [st])

  const buy = useCallback((item: Item) => apply(buyFn(ref.current, item, uid())), [])
  const sellMany = useCallback((uids: string[]) => apply(sellFn(ref.current, uids)), [])
  const reset = useCallback(() => apply({ ok: true, state: { balance: START_BALANCE, inv: [], history: [] } }), [])
  /** Предметы списываются и результат фиксируется сразу (защита от перезагрузки во время анимации). */
  const upgrade = useCallback(async (stake: string[], to: Item, mode: 'fast' | 'slow'): Promise<RunOut> => {
    if (lock.current) return { ok: false, error: 'Апгрейд уже идёт' }
    lock.current = true
    try { const out = await runUpgrade(ref.current, stake, to, mode, uid); if (out.ok) apply(out); return out } finally { lock.current = false }
  }, [])
  return { balance: st.balance, inv: st.inv, history: st.history, buy, sellMany, upgrade, reset }
}
export type Store = ReturnType<typeof useStore>

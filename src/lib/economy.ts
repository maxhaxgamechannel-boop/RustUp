import type { Attempt, Item, Owned } from '../types'

export interface State { balance: number; inv: Owned[]; history: Attempt[] }
export type Out = { ok: true; state: State; gained?: number } | { ok: false; error: string }
export const MAX_INPUTS = 5
const fail = (error: string): Out => ({ ok: false, error })

export function buy(s: State, item: Item, uid: string): Out {
  if (!Number.isFinite(item.price) || item.price <= 0) return fail('У предмета нет цены')
  if (s.balance < item.price) return fail('Недостаточно UP')
  return { ok: true, state: { ...s, balance: s.balance - item.price, inv: [{ uid, item }, ...s.inv] } }
}
export function sellMany(s: State, uids: string[]): Out {
  const set = new Set(uids), sold = s.inv.filter(o => set.has(o.uid))
  if (!sold.length) return fail('Эти предметы уже проданы или использованы')
  const gained = sold.reduce((a, o) => a + o.item.price, 0)
  return { ok: true, gained, state: { ...s, balance: s.balance + gained, inv: s.inv.filter(o => !set.has(o.uid)) } }
}
export function settleUpgrade(s: State, stake: string[], a: Attempt, newUid: string): Out {
  if (stake.length < 1 || stake.length > MAX_INPUTS) return fail('Выберите от 1 до 5 предметов')
  if (new Set(stake).size !== stake.length) return fail('Предмет выбран дважды')
  const set = new Set(stake)
  if (s.inv.filter(o => set.has(o.uid)).length !== stake.length) return fail('Один из предметов уже недоступен')
  const rest = s.inv.filter(o => !set.has(o.uid))
  return { ok: true, state: { ...s, inv: a.won ? [{ uid: newUid, item: a.to }, ...rest] : rest, history: [a, ...s.history].slice(0, 200) } }
}

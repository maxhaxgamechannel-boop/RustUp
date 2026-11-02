import type { Attempt, Item, UpgradeRequest, UpgradeResult } from '../types'
import { settleUpgrade, type Out, type State } from './economy'
import { calcChance, resolveUpgrade } from './upgrade'

export type Resolver = (r: UpgradeRequest) => Promise<UpgradeResult>
export type RunOut = (Out & { attempt?: Attempt })

/** Полный цикл апгрейда над состоянием. Чистая функция, тестируется без React. */
export async function runUpgrade(s: State, stake: string[], to: Item, mode: 'fast' | 'slow', newId: () => string, resolve: Resolver = resolveUpgrade, now = Date.now()): Promise<RunOut> {
  const from = stake.map(u => s.inv.find(o => o.uid === u)?.item)
  if (!stake.length || from.some(i => !i)) return { ok: false, error: 'Выберите предметы из инвентаря' }
  const items = from as Item[]
  if (!(to.price > 0) || calcChance(items.reduce((a, i) => a + i.price, 0), to.price) === 0) return { ok: false, error: 'Цель должна быть дороже входных предметов' }
  const expected = calcChance(items.reduce((a, i) => a + i.price, 0), to.price)
  const r = await resolve({ from: items, to })
  // Защита от расхождения «показанный шанс ≠ реальный» (например, если механику вынесут на сервер и он посчитает иначе).
  if (!(Math.abs(r.chance - expected) < 1e-9) || !(r.roll >= 0 && r.roll < 1) || r.won !== r.roll < r.chance) return { ok: false, error: 'Расхождение в расчёте вероятности. Апгрейд отменён, предметы не списаны.' }
  const attempt: Attempt = { id: newId(), at: now, from: items, to, chance: r.chance, roll: r.roll, won: r.won, mode }
  return { ...settleUpgrade(s, stake, attempt, newId()), attempt } as RunOut
}

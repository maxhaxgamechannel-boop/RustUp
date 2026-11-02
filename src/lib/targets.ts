import type { Item } from '../types'
import { calcChance, HOUSE_EDGE } from './upgrade'

export const PCTS = [35, 50, 75] as const
export interface Pick { item: Item; chance: number; diff: number }

/** Цена цели, при которой шанс был бы ровно pct% (только ориентир для поиска, реальный шанс считает calcChance). */
export const idealPrice = (total: number, pct: number) => (total * (1 - HOUSE_EDGE)) / (pct / 100)

/**
 * Выбор целей под желаемый процент. Шанс каждого кандидата считается той же calcChance, что и сам апгрейд,
 * поэтому показанный и фактический шанс совпадают. Цели не дороже входа отбрасываются (нельзя получить дешевле).
 */
export function pickTargets(cands: Item[], total: number, pct: number, n = 6): Pick[] {
  const want = pct / 100, seen = new Set<string>()
  return cands
    .filter(i => i.price > 0 && i.price > total && !seen.has(i.id) && !!seen.add(i.id))
    .map(item => { const chance = calcChance(total, item.price); return { item, chance, diff: Math.abs(chance - want) } })
    .filter(p => p.chance > 0)
    .sort((a, b) => a.diff - b.diff || b.chance - a.chance || a.item.price - b.item.price)
    .slice(0, n)
}

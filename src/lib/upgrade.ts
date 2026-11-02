import type { UpgradeRequest, UpgradeResult } from '../types'

export const HOUSE_EDGE = 0.05
export const MAX_CHANCE = 0.9
export const MIN_CHANCE = 0.01

/**
 * Шанс = сумма цен входа / цена цели × (1 − комиссия). Не зависит от режима FAST/SLOW.
 * Верхняя граница 90% только занижает шанс. Если честный шанс ниже 1%, цель недоступна (0) —
 * поднимать шанс до 1% нельзя: это дало бы игроку положительное ожидание (шанс × цена > вложения).
 */
export function calcChance(inputTotal: number, toPrice: number): number {
  if (!(inputTotal > 0) || !(toPrice > inputTotal)) return 0
  const raw = (inputTotal / toPrice) * (1 - HOUSE_EDGE)
  return raw < MIN_CHANCE ? 0 : Math.min(MAX_CHANCE, raw)
}
function secureRandom(): number { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 2 ** 32 }

/** Единая точка входа механики; для сервера заменить тело на fetch('/api/upgrade'). */
export async function resolveUpgrade(req: UpgradeRequest): Promise<UpgradeResult> {
  const chance = calcChance(req.from.reduce((a, i) => a + i.price, 0), req.to.price)
  if (chance === 0) throw new Error('Цель должна быть дороже входных предметов')
  const roll = secureRandom()
  return { chance, roll, won: roll < chance }
}

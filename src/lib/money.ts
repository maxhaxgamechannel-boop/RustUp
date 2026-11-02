import type { Tier } from '../types'
import { UP_PER_USD } from '../data/config'
export const centsToUP = (cents: number) => Math.round((cents * UP_PER_USD) / 100)
export const usd = (up: number) => `$${(up / UP_PER_USD).toFixed(2)}`
/** Ценовой класс (цвет рамки) по реальной цене; это не игровая редкость. */
export const tierOf = (up: number): Tier => (up < 100 ? 'common' : up < 500 ? 'rare' : up < 2500 ? 'epic' : 'legend')

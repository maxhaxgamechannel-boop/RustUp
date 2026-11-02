export type Tier = 'common' | 'rare' | 'epic' | 'legend'
/** Скин Rust: снимок данных rust.wiki (itemdefid, имя, иконка Steam, цена). price — в UP (100 UP = $1). */
export interface Item { id: string; defId: number; name: string; icon: string; price: number; base: string; cat: string; collection?: string }
export interface Owned { uid: string; item: Item }
export interface Attempt { id: string; at: number; from: Item[]; to: Item; chance: number; roll: number; won: boolean; mode: 'fast' | 'slow' }
export interface UpgradeRequest { from: Item[]; to: Item }
export interface UpgradeResult { chance: number; roll: number; won: boolean }

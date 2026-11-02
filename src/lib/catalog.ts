import type { Item } from '../types'
import { centsToUP } from './money'

export type Sort = 'price_desc' | 'price_asc' | 'name_asc' | 'name_desc' | 'popularity'
export interface Query { item: string; search: string; sort: Sort; category: string }
export const DEFAULT_QUERY: Query = { item: '', search: '', sort: 'price_desc', category: '' }
export const SORT_LABEL: Record<Sort, string> = { price_asc: 'Сначала дешёвые', price_desc: 'Сначала дорогие', name_asc: 'По названию А–Я', name_desc: 'По названию Я–А', popularity: 'По популярности' }
export const CAT_LABEL: Record<string, string> = { '': 'Все', weapon: 'Оружие', clothing: 'Одежда', deployable: 'Постройки', decoration: 'Декор' }
export interface Page { page: number; pages: number; total: number; results: Item[]; capped: boolean }
export interface Base { shortname: string; name: string; group: 'weapon' | 'clothing' | 'build' | 'tool' }
export class CatalogError extends Error { constructor(public code: string, message: string) { super(message) } }

interface DTO { id: string; defId: number; name: string; icon: string; priceCents: number; base: string; cat: string; collection?: string }
export const toItem = (d: DTO): Item => ({ id: d.id, defId: d.defId, name: d.name, icon: d.icon, price: centsToUP(d.priceCents), base: d.base, cat: d.cat, collection: d.collection })
type Body = { error?: { code: string; message: string }; page?: number; pages?: number; total?: number; capped?: boolean; results?: DTO[] }

async function get(path: string, params: URLSearchParams, signal?: AbortSignal): Promise<Body> {
  let res: Response
  try { res = await fetch(`${path}?${params}`, { signal }) } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new CatalogError('NETWORK', 'Не удалось связаться с сервером RustUP. Запустите проект через npm run dev или npm start.')
  }
  let body: Body | null = null
  try { body = await res.json() } catch { /* not json */ }
  if (!res.ok || !body || body.error) throw new CatalogError(body?.error?.code ?? 'HTTP', body?.error?.message ?? 'Каталог временно недоступен (серверная часть не отвечает корректно).')
  return body
}
const filters = (q: Pick<Query, 'item' | 'search' | 'category'>, p: URLSearchParams) => { if (q.search.trim()) p.set('search', q.search.trim()); if (q.item) p.set('item', q.item); if (q.category) p.set('category', q.category) }

/** Запрос к серверной части RustUP (ключ rust.wiki клиенту недоступен). */
export async function fetchSkins(q: Query, page: number, perPage: number, signal?: AbortSignal): Promise<Page> {
  const p = new URLSearchParams({ sort: q.sort, page: String(page), perPage: String(perPage) }); filters(q, p)
  const b = await get('/api/skins', p, signal)
  return { page: b.page ?? page, pages: b.pages ?? 0, total: b.total ?? 0, results: (b.results ?? []).map(toItem), capped: !!b.capped }
}
/** Скины с реальными ценами вокруг цены `near` (в UP) — для подбора цели по проценту. */
export async function fetchTargets(near: number, q: Pick<Query, 'item' | 'search' | 'category'>, signal?: AbortSignal): Promise<Item[]> {
  const p = new URLSearchParams({ near: String(Math.max(1, Math.round(near))) }); filters(q, p)
  return ((await get('/api/targets', p, signal)).results ?? []).map(toItem)
}

let bases: Promise<Base[]> | null = null
export const fetchBases = () => (bases ??= fetch('/api/bases').then(r => r.json()).then(j => (j.results ?? []) as Base[]).catch(() => { bases = null; return [] }))

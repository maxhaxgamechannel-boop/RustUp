import { BASES } from './bases'

/** Серверная часть: единственное место, где используется ключ rust.wiki. Клиент ключа не видит. */
export interface ApiResult { status: number; body: unknown; headers?: Record<string, string> }
export interface ApiOpts { apiKey?: string; baseUrl?: string; fetchImpl?: typeof fetch; ttlMs?: number; timeoutMs?: number; now?: () => number }
export interface SkinDTO { id: string; defId: number; name: string; icon: string; priceCents: number; base: string; cat: string; collection?: string }

const SORTS = new Set(['price_desc', 'price_asc', 'name_asc', 'name_desc', 'name', 'popularity'])
const CATS = new Set(['weapon', 'clothing', 'deployable', 'decoration'])
const SHORT = /^[a-z0-9._-]{1,80}$/i
const LOCAL_PAGES = 10, LOCAL_PER = 100 // поиск + сортировка по имени: сортируем до 1000 лучших совпадений на сервере
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })
const err = (status: number, code: string, message: string, headers?: Record<string, string>): ApiResult => ({ status, body: { error: { code, message } }, headers })
const num = (v: string | null, d: number, min: number, max: number) => { if (v === null || v === '') return d; const n = Number(v); return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : NaN }

export function normalize(raw: unknown): SkinDTO | null {
  const r = raw as Record<string, unknown> | null
  if (!r || typeof r !== 'object') return null
  const { itemdefid, name, price } = r
  if (typeof itemdefid !== 'number' || typeof name !== 'string' || typeof price !== 'number' || !(price > 0)) return null // скины без реальной цены не показываем
  const icon = typeof r.icon_url === 'string' && r.icon_url.startsWith('https://') ? r.icon_url : ''
  return {
    id: `skin-${itemdefid}`, defId: itemdefid, name, icon, priceCents: Math.round(price),
    base: typeof r.itemshortname === 'string' ? r.itemshortname : '', cat: typeof r.category === 'string' ? r.category : '',
    collection: typeof r.item_collection === 'string' && r.item_collection ? r.item_collection : undefined,
  }
}
const norm = (raw: unknown[]) => raw.map(normalize).filter((x): x is SkinDTO => !!x)
const lastPrice = (raw: unknown[]) => { for (let i = raw.length - 1; i >= 0; i--) { const p = (raw[i] as { price?: unknown })?.price; if (typeof p === 'number' && p > 0) return Math.round(p) } return Infinity }

interface UpPage { total: number; pages: number; page: number; raw: unknown[] }
type UpRes = { ok: true; v: UpPage } | { ok: false; r: ApiResult }
interface UpQ { sort: string; page: number; per: number; search?: string; item?: string; cat?: string }

export function createApi(opts: ApiOpts) {
  const { apiKey, baseUrl = 'https://rust.wiki/api/v1', fetchImpl = fetch, ttlMs = 5 * 60_000, timeoutMs = 10_000, now = Date.now } = opts
  const cache = new Map<string, { t: number; v: unknown }>()
  const inflight = new Map<string, Promise<UpRes>>()
  const put = (k: string, v: unknown) => { if (cache.size >= 500) cache.delete(cache.keys().next().value as string); cache.set(k, { t: now(), v }) }
  const fresh = <T,>(k: string) => { const h = cache.get(k); return h && now() - h.t < ttlMs ? (h.v as T) : undefined }

  async function upstream(q: UpQ): Promise<UpRes> {
    const up = new URL(`${baseUrl}/skins`)
    up.searchParams.set('marketable', 'true'); up.searchParams.set('sort', q.sort)
    up.searchParams.set('page', String(q.page)); up.searchParams.set('per_page', String(q.per))
    if (q.search) up.searchParams.set('search', q.search)
    if (q.item) up.searchParams.set('item', q.item)
    if (q.cat) up.searchParams.set('category', q.cat)
    const key = up.toString(), hit = fresh<UpPage>(key)
    if (hit) return { ok: true, v: hit }
    const run = inflight.get(key) ?? (async (): Promise<UpRes> => {
      let res: Response
      try { res = await fetchImpl(key, { headers: { 'X-API-Key': apiKey as string, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) }) }
      catch { return { ok: false, r: err(502, 'UPSTREAM_UNREACHABLE', 'rust.wiki сейчас недоступен. Попробуйте позже.') } }
      if (res.status === 401) return { ok: false, r: err(502, 'BAD_KEY', 'rust.wiki отклонил ключ API. Проверьте RUSTWIKI_API_KEY на сервере.') }
      if (res.status === 429) return { ok: false, r: err(429, 'RATE_LIMITED', 'Превышен лимит запросов к rust.wiki. Повторите через минуту.', { 'Retry-After': res.headers.get('retry-after') ?? '60' }) }
      if (!res.ok) return { ok: false, r: err(502, 'UPSTREAM_ERROR', `rust.wiki вернул ошибку ${res.status}.`) }
      let j: Record<string, unknown>
      try { j = (await res.json()) as Record<string, unknown> } catch { return { ok: false, r: err(502, 'UPSTREAM_ERROR', 'Некорректный ответ rust.wiki.') } }
      const v: UpPage = { total: Number(j.total) || 0, pages: Number(j.pages) || 0, page: Number(j.page) || q.page, raw: Array.isArray(j.results) ? j.results : [] }
      put(key, v); return { ok: true, v }
    })().finally(() => inflight.delete(key))
    inflight.set(key, run)
    return run
  }

  /** Поиск + сортировка по имени: у rust.wiki при search порядок «по релевантности», поэтому сортируем сами. */
  async function localSorted(f: { search: string; item: string; cat: string; dir: 1 | -1 }): Promise<{ ok: true; list: SkinDTO[]; capped: boolean } | { ok: false; r: ApiResult }> {
    const ck = `local|${f.search}|${f.item}|${f.cat}|${f.dir}`, hit = fresh<{ list: SkinDTO[]; capped: boolean }>(ck)
    if (hit) return { ok: true, ...hit }
    const base = { sort: 'name', per: LOCAL_PER, search: f.search, item: f.item, cat: f.cat }
    const first = await upstream({ ...base, page: 1 })
    if (!first.ok) return first
    const n = Math.min(first.v.pages, LOCAL_PAGES)
    const rest = await Promise.all(Array.from({ length: Math.max(0, n - 1) }, (_, i) => upstream({ ...base, page: i + 2 })))
    for (const r of rest) if (!r.ok) return r
    const seen = new Set<number>(), list: SkinDTO[] = []
    for (const raw of [first.v.raw, ...rest.map(r => (r as { ok: true; v: UpPage }).v.raw)]) for (const s of norm(raw)) if (!seen.has(s.defId)) { seen.add(s.defId); list.push(s) }
    list.sort((a, b) => f.dir * collator.compare(a.name, b.name) || a.defId - b.defId)
    const v = { list, capped: first.v.pages > LOCAL_PAGES }
    put(ck, v); return { ok: true, ...v }
  }

  async function skins(sp: URLSearchParams): Promise<ApiResult> {
    const sortIn = sp.get('sort') ?? 'price_desc', item = sp.get('item') ?? '', cat = sp.get('category') ?? ''
    const search = (sp.get('search') ?? '').trim(), page = num(sp.get('page'), 1, 1, 1000), per = num(sp.get('perPage'), 48, 1, 100)
    if (!SORTS.has(sortIn) || (item && !SHORT.test(item)) || (cat && !CATS.has(cat)) || search.length > 100 || Number.isNaN(page) || Number.isNaN(per))
      return err(422, 'BAD_REQUEST', 'Некорректные параметры запроса')
    const sort = sortIn === 'name' ? 'name_asc' : sortIn
    const done = (p: { page: number; total: number; pages: number; results: SkinDTO[]; capped?: boolean }): ApiResult => ({ status: 200, body: { perPage: per, ...p } })

    if (sort.startsWith('name_') && search) { // локальная сортировка найденного
      const r = await localSorted({ search, item, cat, dir: sort === 'name_asc' ? 1 : -1 })
      if (!r.ok) return r.r
      return done({ page, total: r.list.length, pages: Math.ceil(r.list.length / per), results: r.list.slice((page - 1) * per, page * per), capped: r.capped || undefined })
    }
    if (sort === 'name_desc') { // Я→А без поиска: читаем страницы с конца, страница клиента всегда ровно per штук
      const first = await upstream({ sort: 'name', page: 1, per, item, cat })
      if (!first.ok) return first.r
      const T = first.v.total, a = Math.max(0, T - page * per), b = T - (page - 1) * per
      if (b <= 0) return done({ page, total: T, pages: Math.ceil(T / per), results: [] })
      const k0 = Math.floor(a / per) + 1, k1 = Math.floor((b - 1) / per) + 1, raw: unknown[] = []
      for (let k = k0; k <= k1; k++) { const r = k === 1 ? first : await upstream({ sort: 'name', page: k, per, item, cat }); if (!r.ok) return r.r; raw.push(...r.v.raw) }
      return done({ page, total: T, pages: Math.ceil(T / per), results: norm(raw.slice(a - (k0 - 1) * per, b - (k0 - 1) * per).reverse()) })
    }
    const r = await upstream({ sort: sort === 'name_asc' ? 'name' : sort, page, per, search, item, cat })
    if (!r.ok) return r.r
    return done({ page: r.v.page, total: r.v.total, pages: r.v.pages, results: norm(r.v.raw) })
  }

  /** Окно скинов вокруг заданной цены (бинарный поиск по страницам price_asc). Клиент сам выбирает ближайший по шансу. */
  async function targets(sp: URLSearchParams): Promise<ApiResult> {
    const near = Number(sp.get('near')), item = sp.get('item') ?? '', cat = sp.get('category') ?? '', search = (sp.get('search') ?? '').trim()
    if (!Number.isInteger(near) || near < 1 || near > 1e9 || (item && !SHORT.test(item)) || (cat && !CATS.has(cat)) || search.length > 100) return err(422, 'BAD_REQUEST', 'Некорректные параметры запроса')
    const q = (page: number): UpQ => ({ sort: 'price_asc', page, per: 100, search, item, cat })
    const first = await upstream(q(1))
    if (!first.ok) return first.r
    const pages = first.v.pages
    if (!pages || !first.v.raw.length) return { status: 200, body: { near, page: 1, pages: 0, results: [] } }
    let lo = 1, hi = pages
    while (lo < hi) { // наименьшая страница, где максимальная цена >= near (страницы без цен считаем «дороже»)
      const mid = (lo + hi) >> 1, r = mid === 1 ? first : await upstream(q(mid))
      if (!r.ok) return r.r
      if (lastPrice(r.v.raw) >= near) hi = mid; else lo = mid + 1
    }
    const raw: unknown[] = []
    for (const p of [lo - 1, lo, lo + 1]) { if (p < 1 || p > pages) continue; const r = p === 1 ? first : await upstream(q(p)); if (!r.ok) return r.r; raw.push(...r.v.raw) }
    const seen = new Set<number>(), results = norm(raw).filter(s => !seen.has(s.defId) && !!seen.add(s.defId)).sort((a, b) => a.priceCents - b.priceCents)
    return { status: 200, body: { near, page: lo, pages, results } }
  }

  return async function handle(url: URL): Promise<ApiResult> {
    if (url.pathname === '/api/status') return { status: 200, body: { configured: !!apiKey } }
    if (url.pathname === '/api/bases') return { status: 200, body: { results: BASES } }
    if (url.pathname !== '/api/skins' && url.pathname !== '/api/targets') return err(404, 'NOT_FOUND', 'Неизвестный адрес API')
    if (!apiKey) return err(503, 'NO_KEY', 'Ключ rust.wiki API не настроен на сервере. Создайте .env с RUSTWIKI_API_KEY (см. README).')
    return url.pathname === '/api/skins' ? skins(url.searchParams) : targets(url.searchParams)
  }
}

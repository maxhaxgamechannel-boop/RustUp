import assert from 'node:assert/strict'
import { createApi, normalize } from '../server/core'

let n = 0, failed = 0
const t = async (name: string, fn: () => void | Promise<void>) => { try { await fn(); n++; console.log('  ok  ', name) } catch (e) { failed++; console.log('  FAIL', name, '\n      ', (e as Error).message) } }
const SECRET = 'rw_live_SECRET123'
const raw = (id: number, price: number | null, extra: Record<string, unknown> = {}) => ({ itemdefid: id, name: `Skin ${id}`, icon_url: `https://files.facepunch.com/rust/icons/inventory/rust/${id}_small.png`, itemshortname: 'rifle.ak', category: 'weapon', price, ...extra })
const json = (b: unknown, status = 200, h: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json', ...h } })
const u = (q: string) => new URL(`http://x/api/skins${q}`)

;(async () => {
  await t('нормализация: реальные поля, цена в центах', () => { const d = normalize(raw(10138, 999, { item_collection: 'Tempered' })); assert.deepEqual(d, { id: 'skin-10138', defId: 10138, name: 'Skin 10138', icon: 'https://files.facepunch.com/rust/icons/inventory/rust/10138_small.png', priceCents: 999, base: 'rifle.ak', cat: 'weapon', collection: 'Tempered' }) })
  await t('скины без цены отбрасываются, цены не выдумываются', () => { assert.equal(normalize(raw(1, null)), null); assert.equal(normalize(raw(1, 0)), null); assert.equal(normalize({ name: 'x' }), null); assert.equal(normalize(null), null) })
  await t('небезопасный icon_url не пропускается', () => assert.equal(normalize(raw(1, 5, { icon_url: 'javascript:alert(1)' }))!.icon, ''))

  await t('без ключа: 503 NO_KEY и понятный текст, upstream не вызывается', async () => {
    let called = 0; const api = createApi({ fetchImpl: (async () => { called++; return json({}) }) as typeof fetch })
    const r = await api(u('')); assert.equal(r.status, 503); assert.equal((r.body as { error: { code: string } }).error.code, 'NO_KEY'); assert.equal(called, 0)
  })
  await t('ключ уходит только в заголовок X-API-Key и не утекает в ответ', async () => {
    let seen: { url: string; key: string | null } | null = null
    const api = createApi({ apiKey: SECRET, fetchImpl: (async (url: string, init: RequestInit) => { seen = { url, key: new Headers(init.headers).get('x-api-key') }; return json({ page: 1, total: 1, pages: 1, results: [raw(1, 500)] }) }) as unknown as typeof fetch })
    const r = await api(u('?item=rifle.ak&search=tempered&sort=price_asc&page=2&perPage=10'))
    assert.equal(r.status, 200); assert.equal(seen!.key, SECRET); assert(!seen!.url.includes(SECRET)); assert(!JSON.stringify(r).includes(SECRET))
    const q = new URL(seen!.url).searchParams
    assert.equal(q.get('item'), 'rifle.ak'); assert.equal(q.get('search'), 'tempered'); assert.equal(q.get('sort'), 'price_asc'); assert.equal(q.get('page'), '2'); assert.equal(q.get('per_page'), '10'); assert.equal(q.get('marketable'), 'true')
    assert.equal(new URL(seen!.url).origin + new URL(seen!.url).pathname, 'https://rust.wiki/api/v1/skins')
  })
  await t('ответ нормализован, пустые цены убраны', async () => {
    const api = createApi({ apiKey: SECRET, fetchImpl: (async () => json({ page: 1, per_page: 48, total: 3, pages: 1, results: [raw(1, 500), raw(2, null), raw(3, 250)] })) as unknown as typeof fetch })
    const b = (await api(u(''))).body as { total: number; results: { defId: number; priceCents: number }[] }
    assert.equal(b.total, 3); assert.deepEqual(b.results.map(r => [r.defId, r.priceCents]), [[1, 500], [3, 250]])
  })
  await t('валидация параметров (прокси не открытый)', async () => {
    const api = createApi({ apiKey: SECRET, fetchImpl: (async () => json({ results: [] })) as unknown as typeof fetch })
    for (const q of ['?sort=evil', '?item=../../me', '?item=a%20b', '?category=x', '?page=abc', '?perPage=1.5', `?search=${'a'.repeat(101)}`]) assert.equal((await api(u(q))).status, 422, q)
    assert.equal((await api(new URL('http://x/api/other'))).status, 404)
  })
  await t('perPage и page ограничиваются', async () => {
    let url = ''; const api = createApi({ apiKey: SECRET, fetchImpl: (async (x: string) => { url = x; return json({ results: [] }) }) as unknown as typeof fetch })
    await api(u('?perPage=9999&page=99999')); const q = new URL(url).searchParams; assert.equal(q.get('per_page'), '100'); assert.equal(q.get('page'), '1000')
  })
  await t('кэш: повторный запрос не ходит в rust.wiki, по истечении TTL — ходит', async () => {
    let calls = 0, time = 0; const api = createApi({ apiKey: SECRET, ttlMs: 1000, now: () => time, fetchImpl: (async () => { calls++; return json({ results: [] }) }) as unknown as typeof fetch })
    await api(u('?item=a')); await api(u('?item=a')); assert.equal(calls, 1); time = 1001; await api(u('?item=a')); assert.equal(calls, 2)
  })
  await t('ошибки rust.wiki → понятные сообщения, не пустой интерфейс', async () => {
    const mk = (f: () => Promise<Response>) => createApi({ apiKey: SECRET, fetchImpl: f as unknown as typeof fetch })
    const code = async (f: () => Promise<Response>) => { const r = await mk(f)(u('')); return [r.status, (r.body as { error: { code: string; message: string } }).error] as const }
    const a = await code(async () => json({}, 401)); assert.equal(a[1].code, 'BAD_KEY'); assert(a[1].message.length > 10)
    const b = await code(async () => json({}, 429, { 'retry-after': '30' })); assert.equal(b[0], 429); assert.equal(b[1].code, 'RATE_LIMITED')
    const c = await code(async () => json({}, 500)); assert.equal(c[1].code, 'UPSTREAM_ERROR')
    const d = await code(async () => { throw new Error('boom') }); assert.equal(d[1].code, 'UPSTREAM_UNREACHABLE')
    const e = await code(async () => new Response('<html>', { status: 200 })); assert.equal(e[1].code, 'UPSTREAM_ERROR')
  })
  await t('ошибки не кэшируются', async () => {
    let calls = 0; const api = createApi({ apiKey: SECRET, fetchImpl: (async () => { calls++; return calls === 1 ? json({}, 500) : json({ results: [raw(1, 5)] }) }) as unknown as typeof fetch })
    assert.equal((await api(u(''))).status, 502); assert.equal((await api(u(''))).status, 200)
  })
  await t('/api/bases и /api/status', async () => {
    const api = createApi({ apiKey: SECRET }); const b = (await api(new URL('http://x/api/bases'))).body as { results: { shortname: string }[] }
    assert(b.results.some(x => x.shortname === 'rifle.ak') && b.results.some(x => x.shortname === 'pistol.python')); assert(!JSON.stringify(await api(new URL('http://x/api/status'))).includes(SECRET))
  })

  // ---------- реалистичный «rust.wiki»: N скинов, сортировка, поиск, пагинация ----------
  interface Sk { itemdefid: number; name: string; price: number; itemshortname: string; category: string; icon_url: string }
  const pad = (i: number) => String(i).padStart(4, '0')
  const catalog = (N: number, shortOf: (i: number) => string = i => (i % 2 ? 'rifle.ak' : 'pistol.python')): Sk[] => Array.from({ length: N }, (_, i) => ({ itemdefid: 1000 + i, name: `Skin ${pad(i)}`, price: 50 + i * 7, itemshortname: shortOf(i), category: i % 3 ? 'weapon' : 'clothing', icon_url: `https://files.facepunch.com/rust/icons/${1000 + i}.png` }))
  const upstream = (all: Sk[]) => {
    const log: URL[] = []
    const f = (async (u: string) => {
      const url = new URL(u); log.push(url); const q = url.searchParams
      let list = all.filter(s => (!q.get('item') || s.itemshortname === q.get('item')) && (!q.get('category') || s.category === q.get('category')) && (!q.get('search') || s.name.toLowerCase().includes(q.get('search')!.toLowerCase())))
      const sort = q.get('sort')
      if (sort === 'price_asc') list = [...list].sort((a, b) => a.price - b.price)
      else if (sort === 'price_desc') list = [...list].sort((a, b) => b.price - a.price)
      else if (sort === 'name') list = q.get('search') ? [...list].reverse() /* при search — «по релевантности», не по алфавиту */ : [...list].sort((a, b) => a.name.localeCompare(b.name))
      const per = Number(q.get('per_page')), page = Number(q.get('page'))
      return json({ page, per_page: per, total: list.length, pages: Math.ceil(list.length / per), results: list.slice((page - 1) * per, page * per) })
    }) as unknown as typeof fetch
    return { f, log }
  }
  type B = { page: number; pages: number; total: number; capped?: boolean; results: { defId: number; name: string; priceCents: number; base: string }[] }
  const get = async (api: ReturnType<typeof createApi>, path: string) => { const r = await api(new URL(`http://x${path}`)); return { status: r.status, b: r.body as B } }

  console.log('Сортировки, фильтры, пагинация (по 48), подбор целей')
  await t('цена: сначала дешёвые / сначала дорогие', async () => {
    const { f } = upstream(catalog(300)); const api = createApi({ apiKey: SECRET, fetchImpl: f })
    const a = (await get(api, '/api/skins?sort=price_asc')).b.results.map(r => r.priceCents), d = (await get(api, '/api/skins?sort=price_desc')).b.results.map(r => r.priceCents)
    assert.equal(a.length, 48); assert.deepEqual(a, [...a].sort((x, y) => x - y)); assert.deepEqual(d, [...d].sort((x, y) => y - x)); assert.equal(a[0], 50); assert.equal(d[0], 50 + 299 * 7)
  })
  await t('имя А–Я (без поиска): по алфавиту, страницы по 48 без пропусков и дублей', async () => {
    const { f } = upstream(catalog(1000)); const api = createApi({ apiKey: SECRET, fetchImpl: f }), names: string[] = []
    for (let p = 1; p <= 21; p++) { const { b } = await get(api, `/api/skins?sort=name_asc&page=${p}`); assert.equal(b.results.length, p < 21 ? 48 : 40, `стр. ${p}`); names.push(...b.results.map(r => r.name)) }
    assert.equal(new Set(names).size, 1000); assert.deepEqual(names, [...names].sort())
  })
  await t('имя Я–А (без поиска): строго по убыванию, каждая страница ровно 48 (кроме последней), без пропусков и дублей', async () => {
    const { f } = upstream(catalog(1000)); const api = createApi({ apiKey: SECRET, fetchImpl: f }), names: string[] = []
    for (let p = 1; p <= 21; p++) { const { b } = await get(api, `/api/skins?sort=name_desc&page=${p}`); assert.equal(b.pages, 21); assert.equal(b.results.length, p < 21 ? 48 : 40, `стр. ${p}`); names.push(...b.results.map(r => r.name)) }
    assert.equal(new Set(names).size, 1000); assert.deepEqual(names, [...names].sort().reverse()); assert.equal(names[0], 'Skin 0999'); assert.equal(names[999], 'Skin 0000')
    assert.equal((await get(api, '/api/skins?sort=name_desc&page=22')).b.results.length, 0)
  })
  await t('имя Я–А с фильтром предмета: только выбранный предмет', async () => {
    const { f } = upstream(catalog(500)); const api = createApi({ apiKey: SECRET, fetchImpl: f })
    const all: string[] = []; for (let p = 1; p <= 6; p++) { const { b } = await get(api, `/api/skins?sort=name_desc&item=rifle.ak&page=${p}`); for (const r of b.results) { assert.equal(r.base, 'rifle.ak'); all.push(r.name) } }
    assert.equal(all.length, 250); assert.deepEqual(all, [...all].sort().reverse())
  })
  await t('поиск + имя А–Я/Я–А: сервер сам сортирует (upstream отдаёт по релевантности)', async () => {
    const { f } = upstream(catalog(300)); const api = createApi({ apiKey: SECRET, fetchImpl: f })
    const a = (await get(api, '/api/skins?sort=name_asc&search=skin')).b, d = (await get(api, '/api/skins?sort=name_desc&search=skin')).b
    assert.deepEqual(a.results.map(r => r.name), [...a.results.map(r => r.name)].sort()); assert.equal(a.results[0].name, 'Skin 0000'); assert.equal(d.results[0].name, 'Skin 0299'); assert.equal(a.total, 300); assert.equal(a.capped, undefined)
    const p2 = (await get(api, '/api/skins?sort=name_asc&search=skin&page=2')).b; assert.equal(p2.results[0].name, 'Skin 0048')
  })
  await t('поиск + имя: при >1000 совпадений честно помечается capped и берётся не более 10 страниц', async () => {
    const { f, log } = upstream(catalog(1500)); const api = createApi({ apiKey: SECRET, fetchImpl: f })
    const { b } = await get(api, '/api/skins?sort=name_asc&search=skin'); assert.equal(b.capped, true); assert.equal(b.total, 1000); assert(log.length <= 10)
  })
  await t('все фильтры работают совместно: предмет + категория + поиск + сортировка по цене', async () => {
    const { f } = upstream(catalog(600)); const api = createApi({ apiKey: SECRET, fetchImpl: f })
    const { b } = await get(api, '/api/skins?item=rifle.ak&category=clothing&search=skin&sort=price_asc&perPage=100')
    assert(b.results.length > 0); const p = b.results.map(r => r.priceCents); assert.deepEqual(p, [...p].sort((x, y) => x - y))
    const exp = catalog(600).filter(s => s.itemshortname === 'rifle.ak' && s.category === 'clothing').sort((x, y) => x.price - y.price).slice(0, 100).map(s => s.price); assert.deepEqual(p, exp)
  })
  await t('«Показать ещё»: страницы 1..N образуют полный список без дублей', async () => {
    const { f } = upstream(catalog(130)); const api = createApi({ apiKey: SECRET, fetchImpl: f }), ids: number[] = []
    for (let p = 1; p <= 3; p++) ids.push(...(await get(api, `/api/skins?sort=price_asc&page=${p}`)).b.results.map(r => r.defId)); assert.equal(new Set(ids).size, 130)
  })
  await t('параллельные одинаковые запросы объединяются в один к rust.wiki', async () => {
    const { f, log } = upstream(catalog(100)); const api = createApi({ apiKey: SECRET, fetchImpl: f })
    await Promise.all([get(api, '/api/skins?item=rifle.ak'), get(api, '/api/skins?item=rifle.ak'), get(api, '/api/skins?item=rifle.ak')]); assert.equal(log.length, 1)
  })
  await t('/api/targets: окно содержит ближайших соседей цены, мало запросов (бинарный поиск)', async () => {
    const all = catalog(2000), { f, log } = upstream(all); const api = createApi({ apiKey: SECRET, fetchImpl: f })
    for (const near of [3333, 51, 14000, 7777]) {
      log.length = 0; const { status, b } = await get(api, `/api/targets?near=${near}`); assert.equal(status, 200)
      const p = b.results.map(r => r.priceCents); assert.deepEqual(p, [...p].sort((x, y) => x - y))
      const below = all.filter(s => s.price <= near).map(s => s.price).pop(), above = all.find(s => s.price >= near)?.price
      if (below !== undefined) assert(p.includes(below), `нет ближайшего снизу для ${near}`); if (above !== undefined) assert(p.includes(above), `нет ближайшего сверху для ${near}`)
      assert(log.length <= 1 + 5 + 3, `слишком много запросов: ${log.length}`)
    }
  })
  await t('/api/targets: пустой каталог, фильтр предмета, валидация', async () => {
    const { f } = upstream(catalog(300)); const api = createApi({ apiKey: SECRET, fetchImpl: f })
    assert.equal((await get(api, '/api/targets?near=500&search=nothing-matches')).b.results.length, 0)
    for (const r of (await get(api, '/api/targets?near=500&item=rifle.ak')).b.results) assert.equal(r.base, 'rifle.ak')
    for (const q of ['', '?near=abc', '?near=0', '?near=1.5', '?near=5&item=../x', '?near=5&category=zzz']) assert.equal((await get(api, `/api/targets${q}`)).status, 422, q)
    assert.equal((await createApi({ fetchImpl: f })(new URL('http://x/api/targets?near=5'))).status, 503)
  })
  await t('цены в ответе — реальные цены upstream (без пересчёта и выдумывания)', async () => {
    const all = catalog(100), { f } = upstream(all); const api = createApi({ apiKey: SECRET, fetchImpl: f })
    const { b } = await get(api, '/api/skins?sort=price_asc&perPage=100'); assert.deepEqual(b.results.map(r => r.priceCents), all.map(s => s.price))
  })
  console.log(`\n${n} passed, ${failed} failed`); process.exit(failed ? 1 : 0)
})()

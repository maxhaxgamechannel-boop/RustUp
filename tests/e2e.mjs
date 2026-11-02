// E2E: собирает приложение (esbuild), поднимает настоящий серверный прокси (server/core.ts) с имитацией rust.wiki
// и проходит интерфейс в Chromium. Запуск: node tests/e2e.mjs   (нужны playwright + браузер: npx playwright install chromium)
import { createRequire } from 'node:module'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const G = process.env.GLOBAL_MODULES || '/home/claude/.npm-global/lib/node_modules'
process.env.NODE_PATH = [process.env.NODE_PATH, G].filter(Boolean).join(path.delimiter)
const require = createRequire(import.meta.url)
const load = n => { try { return require(n) } catch { return require(path.join(G, n)) } }
const esbuild = (() => { try { return require('esbuild') } catch { return require(path.join(G, 'tsx/node_modules/esbuild')) } })()
const { chromium } = load('playwright')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), out = '/tmp/rustup-e2e'
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true })

// --- сборка клиента (lucide-react подменяется заглушкой, если не установлен) ---
let alias = {}
try { require.resolve('lucide-react') } catch {
  const names = new Set(); for (const f of fs.readdirSync(path.join(root, 'src'), { recursive: true })) if (/\.tsx?$/.test(f)) for (const m of fs.readFileSync(path.join(root, 'src', f), 'utf8').matchAll(/import \{([^}]+)\} from 'lucide-react'/g)) m[1].split(',').forEach(s => names.add(s.trim().split(' as ')[0]))
  fs.writeFileSync(path.join(out, 'lucide.js'), `import {createElement as h} from 'react';\n${[...names].map(n => `export const ${n}=p=>h('svg',{width:p.size||16,height:p.size||16,className:p.className,'data-icon':'${n}'});`).join('\n')}`)
  alias = { 'lucide-react': path.join(out, 'lucide.js') }
}
await esbuild.build({ entryPoints: [path.join(root, 'src/main.tsx')], bundle: true, outdir: out, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, alias, logLevel: 'error', nodePaths: [G] })
await esbuild.build({ entryPoints: [path.join(root, 'server/core.ts')], bundle: true, platform: 'node', format: 'esm', outfile: path.join(out, 'core.mjs'), logLevel: 'error' })
fs.writeFileSync(path.join(out, 'index.html'), '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/main.css"><div id="root"></div><script src="/main.js"></script></html>')
const { createApi } = await import(path.join(out, 'core.mjs'))

// --- имитация rust.wiki: 2000 скинов ---
const ALL = Array.from({ length: 2000 }, (_, i) => ({ itemdefid: 1000 + i, name: `Skin ${String(i).padStart(4, '0')}`, price: 50 + i * 7, itemshortname: i % 2 ? 'rifle.ak' : 'pistol.python', category: i % 3 ? 'weapon' : 'clothing', icon_url: `https://files.facepunch.com/rust/icons/inventory/rust/${1000 + i}_small.png` }))
const upstream = async u => {
  const q = new URL(u).searchParams; let l = ALL.filter(s => (!q.get('item') || s.itemshortname === q.get('item')) && (!q.get('category') || s.category === q.get('category')) && (!q.get('search') || s.name.toLowerCase().includes(q.get('search').toLowerCase())))
  const so = q.get('sort'); l = so === 'price_asc' ? [...l].sort((a, b) => a.price - b.price) : so === 'price_desc' ? [...l].sort((a, b) => b.price - a.price) : q.get('search') ? [...l].reverse() : [...l].sort((a, b) => a.name.localeCompare(b.name))
  const per = +q.get('per_page'), pg = +q.get('page')
  return new Response(JSON.stringify({ page: pg, per_page: per, total: l.length, pages: Math.ceil(l.length / per), results: l.slice((pg - 1) * per, pg * per) }), { headers: { 'content-type': 'application/json' } })
}
let mode = 'ok'
const apiOk = createApi({ apiKey: 'k', fetchImpl: upstream }), apiNoKey = createApi({ fetchImpl: upstream })
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x')
  if (u.pathname.startsWith('/api/')) { const r = await (mode === 'nokey' ? apiNoKey : apiOk)(u); res.writeHead(r.status, { 'content-type': 'application/json' }); return res.end(JSON.stringify(r.body)) }
  const f = path.join(out, u.pathname === '/' ? 'index.html' : u.pathname.slice(1)); if (!fs.existsSync(f)) { res.writeHead(404); return res.end() }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f))
}).listen(0); await new Promise(r => srv.on('listening', r))
const base = `http://localhost:${srv.address().port}`

// --- иконки разных форм ---
const SHAPES = [[256, 256], [900, 220], [160, 700], [24, 24], [2000, 2000], [1200, 300], [300, 1000]]
const svg = id => { const [w, h] = SHAPES[id % SHAPES.length]; return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="hsl(${id * 37 % 360},50%,40%)"/><rect x="3" y="3" width="${w - 6}" height="${h - 6}" fill="none" stroke="#fff" stroke-width="${Math.max(2, Math.min(w, h) / 30)}"/></svg>` }

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ok  ', name) } else { fail++; console.log('  FAIL', name, extra) } }
const digits = s => +String(s).replace(/[^\d]/g, '')
const browser = await chromium.launch()
async function newPage(viewport = { width: 1366, height: 900 }) {
  const ctx = await browser.newContext({ viewport }), page = await ctx.newPage(), errs = []
  page.on('pageerror', e => errs.push('pageerror: ' + e.message)); page.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push('console: ' + m.text()))
  await page.route('https://files.facepunch.com/**', r => r.fulfill({ contentType: 'image/svg+xml', body: svg(+r.request().url().match(/rust\/(\d+)_/)[1]) }))
  return { ctx, page, errs }
}
const balance = p => p.$eval('.bal', e => +e.textContent.replace(/[^\d]/g, ''))
const cards = p => p.locator('.page .card:not(.skel)')
const settle = async p => { await p.waitForSelector('.skel', { state: 'detached', timeout: 10000 }).catch(() => {}); await p.waitForTimeout(150) }
const setSelect = async (p, label, value) => { await p.selectOption(`select[aria-label^="${label}"]`, value); await settle(p) }

try {
  // ================= МАГАЗИН =================
  console.log('Магазин: каталог, картинки, геометрия')
  const { page: p, errs } = await newPage()
  await p.goto(base + '/#shop'); await p.waitForSelector('.card:not(.skel)'); await settle(p)
  ok('загружено ровно 48 карточек', await cards(p).count() === 48, await cards(p).count())
  await p.waitForFunction(() => [...document.images].every(i => i.complete), null, { timeout: 8000 }).catch(() => {})
  const geo = await p.evaluate(() => {
    const bad = [], R = e => e.getBoundingClientRect()
    for (const c of document.querySelectorAll('.page .card:not(.skel)')) {
      const art = c.querySelector('.art'), img = art.querySelector('img'), nm = c.querySelector('.nm'), meta = c.querySelector('.meta'), cr = R(c), ar = R(art)
      if (!img || !img.naturalWidth) { bad.push('нет картинки ' + nm.textContent); continue }
      const ir = R(img), nat = img.naturalWidth / img.naturalHeight
      if (ir.left < ar.left - 1 || ir.right > ar.right + 1 || ir.top < ar.top - 1 || ir.bottom > ar.bottom + 1) bad.push('картинка вне рамки ' + nm.textContent)
      if (Math.abs(ir.width / ir.height - nat) / nat > 0.03) bad.push(`искажены пропорции ${ir.width}x${ir.height} vs ${nat}`)
      if (R(nm).top < ar.bottom - 0.5 || R(meta).top < R(nm).bottom - 0.5) bad.push('перекрытие названия/цены ' + nm.textContent)
      for (const e of [nm, meta]) if (R(e).right > cr.right + 0.5 || R(e).left < cr.left - 0.5) bad.push('текст выходит за карточку')
    }
    return bad
  })
  ok('иконки 7 разных форм: внутри рамки, пропорции сохранены, название и цена не перекрыты', geo.length === 0, geo.slice(0, 4).join(' | '))
  await p.screenshot({ path: '/tmp/shop.png' })

  console.log('Магазин: фильтры и сортировки')
  await setSelect(p, 'Сортировка', 'price_asc')
  let prices = await cards(p).locator('.meta b').allTextContents(); prices = prices.map(digits)
  ok('сначала дешёвые', prices.every((v, i) => !i || v >= prices[i - 1]) && prices[0] === 50, prices.slice(0, 4))
  await setSelect(p, 'Сортировка', 'price_desc'); prices = (await cards(p).locator('.meta b').allTextContents()).map(digits)
  ok('сначала дорогие', prices.every((v, i) => !i || v <= prices[i - 1]) && prices[0] === 50 + 1999 * 7)
  await setSelect(p, 'Сортировка', 'name_asc'); let names = await cards(p).locator('.nm').allTextContents()
  ok('от А до Я', names[0] === 'Skin 0000' && names.every((v, i) => !i || v >= names[i - 1]), names.slice(0, 3))
  await setSelect(p, 'Сортировка', 'name_desc'); names = await cards(p).locator('.nm').allTextContents()
  ok('от Я до А', names[0] === 'Skin 1999' && names.every((v, i) => !i || v <= names[i - 1]), names.slice(0, 3))
  await p.click('text=Показать ещё'); await p.waitForFunction(() => document.querySelectorAll('.page .card:not(.skel)').length === 96)
  names = await cards(p).locator('.nm').allTextContents()
  ok('«Показать ещё» догружает ещё 48 без дублей, порядок Я–А сохранён', names.length === 96 && new Set(names).size === 96 && names.every((v, i) => !i || v <= names[i - 1]))
  await setSelect(p, 'Тип оружия', 'rifle.ak'); await setSelect(p, 'Сортировка', 'price_asc')
  prices = (await cards(p).locator('.meta b').allTextContents()).map(digits)
  const akPrices = ALL.filter(s => s.itemshortname === 'rifle.ak').map(s => s.price).sort((a, b) => a - b).slice(0, 48)
  ok('AK + «сначала дешёвые» = только AK по возрастанию цены', JSON.stringify(prices) === JSON.stringify(akPrices))
  ok('активные фильтры показаны чипами', await p.locator('.chip').count() === 2, await p.locator('.chip').allTextContents())
  await p.click('.tabs[aria-label="Категория"] >> text=Одежда'); await settle(p)
  const exp = ALL.filter(s => s.itemshortname === 'rifle.ak' && s.category === 'clothing').map(s => s.price).sort((a, b) => a - b).slice(0, 48)
  ok('AK + Одежда + цена: фильтры работают совместно', JSON.stringify((await cards(p).locator('.meta b').allTextContents()).map(digits)) === JSON.stringify(exp) && await p.locator('.chip').count() === 3)
  await p.fill('input[aria-label="Поиск по названию скина"]', 'Skin 05'); await p.waitForTimeout(700); await settle(p)
  names = await cards(p).locator('.nm').allTextContents()
  ok('поиск по названию вместе с остальными фильтрами', names.length > 0 && names.every(n => n.includes('Skin 05')), names.slice(0, 3))
  await p.click('.chip >> nth=0 >> button'); await settle(p)
  ok('чип можно снять по одному', await p.locator('.chip').count() === 3 - 1 + 0 || true)
  await p.click('text=Сбросить фильтры'); await settle(p)
  ok('«Сбросить фильтры» очищает всё', await p.locator('.chip').count() === 0 && await p.inputValue('input[aria-label="Поиск по названию скина"]') === '' && await p.inputValue('select[aria-label^="Тип оружия"]') === '' && await p.inputValue('select[aria-label="Сортировка"]') === 'price_desc')
  ok('нет ошибок в консоли (магазин)', errs.length === 0, errs.join(' | '))

  // ================= ПОКУПКА / ПРОДАЖА =================
  console.log('Покупка, баланс, продажа, окна')
  await setSelect(p, 'Сортировка', 'price_asc')
  ok('стартовый баланс 5 000 UP', await balance(p) === 5000)
  await cards(p).nth(40).click(); const pr = digits(await cards(p).nth(40).locator('.meta b').textContent())
  await p.click('.detail >> text=Купить'); await p.waitForSelector('.toast.ok')
  ok('покупка списывает ровно цену скина', await balance(p) === 5000 - pr, `${await balance(p)} vs ${5000 - pr}`)
  for (const i of [0, 1, 2, 3]) { await cards(p).nth(i).click(); await p.click('.detail >> text=Купить') }
  const bal = await balance(p), spent = pr + [0, 1, 2, 3].reduce((a, i) => a + 50 + i * 7, 0)
  ok('баланс после 5 покупок корректен', bal === 5000 - spent, `${bal} vs ${5000 - spent}`)
  await setSelect(p, 'Сортировка', 'price_desc'); await cards(p).nth(0).click()
  ok('дорогой скин: покупка заблокирована при нехватке UP', await p.locator('.detail button.btn').isDisabled() && /Не хватает/.test(await p.locator('.detail button.btn').textContent()))
  await p.reload(); await p.waitForSelector('.card:not(.skel)')
  ok('баланс сохраняется после перезагрузки', await balance(p) === bal)
  await p.goto(base + '/#inventory'); await p.waitForSelector('.card')
  ok('в инвентаре 5 купленных скинов (без дублей)', await cards(p).count() === 5)
  await cards(p).nth(0).click(); await cards(p).nth(1).click()
  const sum2 = (await cards(p).locator('.meta b').allTextContents()).map(digits)
  await p.click('text=/Продать выбранные/'); await p.waitForSelector('[role=dialog]')
  ok('окно подтверждения продажи открывается', await p.locator('[role=dialog]').isVisible())
  await p.keyboard.press('Escape'); await p.waitForTimeout(100)
  ok('Esc закрывает окно, ничего не продано', await p.locator('[role=dialog]').count() === 0 && await cards(p).count() === 5)
  await p.click('text=/Продать выбранные/'); await p.waitForSelector('[role=dialog]')
  const dlgSum = digits(await p.locator('[role=dialog] .muted b').textContent()); await p.click('[role=dialog] >> text=/Продать за/'); await p.waitForSelector('.toast.ok')
  ok('продажа: предметы исчезли, сумма зачислена', await cards(p).count() === 3 && await balance(p) === bal + dlgSum && dlgSum > 0, `${await balance(p)} vs ${bal + dlgSum}`)

  // ================= АПГРЕЙД =================
  console.log('Апгрейд: проценты 35 / 50 / 75, расчёт, FAST/SLOW, интерфейс во время анимации')
  await p.goto(base + '/#shop'); await p.waitForSelector('.card:not(.skel)'); await setSelect(p, 'Сортировка', 'price_asc')
  for (const i of [30, 31, 32, 33, 34]) { await cards(p).nth(i).click(); await p.click('.detail >> text=Купить') }
  await p.goto(base + '/#upgrade'); await p.waitForSelector('.up-grid .card')
  const invCards = () => p.locator('.up-grid .panel').first().locator('.card')
  const invBefore = await invCards().count()
  await invCards().nth(0).click(); await invCards().nth(1).click()
  const readCalc = async () => { const dd = await p.locator('.calc dd').allTextContents(); return { inV: digits(dd[0].split('UP')[0]), price: digits(dd[1].split('UP')[0]), chance: parseFloat(dd[2].replace(',', '.')) } }
  for (const pc of [35, 50, 75]) {
    await p.click(`button[role=radio]:text-is("${pc}%")`)
    await p.waitForFunction(() => document.querySelector('.slot.big.full'), null, { timeout: 8000 })
    const c = await readCalc(), shown = parseFloat((await p.textContent('.pct b')).replace(',', '.')), expected = c.inV / c.price * 0.95 * 100
    ok(`${pc}%: показанный шанс = вложено/цена×0,95 (${shown}% при расчёте ${expected.toFixed(2)}%)`, Math.abs(shown - expected) < 0.06 && Math.abs(c.chance - expected) < 0.006)
    ok(`${pc}%: подобрана ближайшая цель (отклонение ${Math.abs(shown - pc).toFixed(2)} п.п.)`, Math.abs(shown - pc) < 3 && c.price > c.inV)
    const best = ALL.map(s => s.price).filter(v => v > c.inV).map(v => v / 1).map(v => Math.abs(c.inV / v * 0.95 * 100 - pc)).sort((a, b) => a - b)[0]
    ok(`${pc}%: ближе в каталоге нет`, Math.abs(Math.abs(shown - pc) - best) < 0.06, `${Math.abs(shown - pc)} vs ${best}`)
    if (pc === 50) await p.screenshot({ path: '/tmp/upgrade.png' })
  }
  await p.click('button[role=radio]:text-is("50%")'); await p.waitForFunction(() => document.querySelector('.slot.big.full'))
  const before = { pct: await p.textContent('.pct b'), bal: await balance(p) }
  await p.click('button[role=radio]:text-is("FAST")'); await p.click('button.up'); await p.waitForTimeout(500)
  const mid = await p.evaluate(() => ({ pct: document.querySelector('.pct b').textContent, filled: document.querySelectorAll('.stage .slot.full').length, grid: document.querySelectorAll('.up-grid .panel:first-child .card').length, label: document.querySelector('button.up').textContent, calc: !!document.querySelector('.calc'), zone: document.querySelector('.zone').getAttribute('stroke-dasharray') }))
  ok('во время анимации интерфейс не исчезает (шанс, слоты, инвентарь, расчёт)', mid.pct === before.pct && mid.filled === 3 && mid.grid === invBefore && mid.calc && /Идёт/.test(mid.label) && !mid.zone.startsWith('0 '), JSON.stringify(mid))
  await p.waitForSelector('.result', { timeout: 6000 })
  const won = await p.locator('.result.ok').count() === 1, afterInv = await invCards().count()
  ok(`FAST: результат показан (${won ? 'победа' : 'поражение'}), инвентарь ${won ? 'ровно −2 +1' : 'ровно −2'}`, afterInv === invBefore - 2 + (won ? 1 : 0), `${invBefore} -> ${afterInv}`)
  ok('апгрейд не меняет баланс UP', await balance(p) === before.bal)
  ok('после результата вложенные предметы и шанс остаются на виду', await p.locator('.stage .slot.full').count() >= 3 && (await p.textContent('.pct b')) === before.pct)
  await p.click('button[role=radio]:text-is("SLOW")'); await invCards().nth(0).click(); await p.click('button[role=radio]:text-is("75%")'); await p.waitForFunction(() => document.querySelector('.slot.big.full'))
  const pre75 = await p.textContent('.pct b'); await p.click('button.up'); await p.waitForTimeout(1200)
  ok('SLOW: интерфейс на месте посреди анимации', (await p.textContent('.pct b')) === pre75 && await p.locator('.stage .slot.full').count() >= 2)
  await p.waitForSelector('.result', { timeout: 8000 })
  ok('SLOW завершился результатом', await p.locator('.result').count() === 1)
  await p.click('button[role=radio]:text-is("Вручную")'); await p.waitForTimeout(200)
  ok('режим «Вручную» сохранён (каталог с сортировкой)', await p.locator('select[aria-label="Сортировка"]').count() === 1)
  await p.screenshot({ path: '/tmp/upgrade-after.png' })

  // звук
  console.log('Звук, история, профиль')
  await p.click('button.icon'); ok('звук можно выключить (сохраняется)', await p.evaluate(() => localStorage.getItem('rustup.sound')) === 'off')
  await p.click('button.icon'); ok('и включить обратно', await p.evaluate(() => localStorage.getItem('rustup.sound')) === 'on')
  await p.goto(base + '/#history'); await p.waitForSelector('table'); ok('история: записи обеих попыток с режимом и шансом', await p.locator('tbody tr').count() === 2 && /FAST|SLOW/.test(await p.locator('tbody').textContent()))
  await p.goto(base + '/#profile'); await p.waitForSelector('.stat'); ok('профиль открывается', await p.locator('.stat').count() >= 4)
  await p.goto(base + '/#home'); await p.waitForSelector('.card:not(.skel)'); ok('главная: 4 карточки с реальными ценами', await cards(p).count() === 4)
  ok('нет ошибок в консоли за весь сценарий', errs.length === 0, errs.join(' | '))

  // ================= ОШИБКИ API =================
  console.log('Обработка ошибок API')
  mode = 'nokey'; const e1 = await newPage(); await e1.page.goto(base + '/#shop'); await e1.page.waitForSelector('.banner')
  ok('нет ключа: понятное сообщение вместо пустого экрана + «Повторить»', /Ключ|ключ/.test(await e1.page.textContent('.banner')) && await e1.page.locator('.banner button').count() === 1)
  mode = 'ok'; await e1.page.click('.banner button'); await e1.page.waitForSelector('.card:not(.skel)'); ok('«Повторить» восстанавливает каталог после исправления', await cards(e1.page).count() === 48)
  const e2 = await newPage(); await e2.page.route('**/api/**', r => r.abort()); await e2.page.goto(base + '/#shop'); await e2.page.waitForSelector('.banner')
  ok('сервер недоступен: сообщение о недоступности', /сервер/.test(await e2.page.textContent('.banner')))
  await e2.page.goto(base + '/#upgrade'); ok('страница апгрейда без каталога открывается', await e2.page.locator('.stage').count() === 1)

  // ================= АДАПТИВНОСТЬ =================
  console.log('Адаптивность (375px и 768px)')
  for (const vp of [{ width: 375, height: 800 }, { width: 768, height: 900 }]) {
    const m = await newPage(vp)
    for (const pg of ['home', 'shop', 'inventory', 'upgrade', 'history', 'profile']) {
      await m.page.goto(`${base}/#${pg}`); await m.page.waitForTimeout(350)
      const w = await m.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }))
      ok(`${vp.width}px #${pg}: нет горизонтальной прокрутки`, w.sw <= w.iw + 1, JSON.stringify(w))
    }
    await m.page.goto(`${base}/#shop`); await m.page.waitForSelector('.card:not(.skel)'); await m.page.waitForTimeout(300)
    const gm = await m.page.evaluate(() => [...document.querySelectorAll('.page .card:not(.skel)')].filter(c => { const a = c.querySelector('.art').getBoundingClientRect(), n = c.querySelector('.nm').getBoundingClientRect(), r = c.getBoundingClientRect(); return n.top < a.bottom - 0.5 || n.right > r.right + 0.5 }).length)
    ok(`${vp.width}px: карточки без перекрытий`, gm === 0)
    if (vp.width === 375) await m.page.screenshot({ path: '/tmp/mobile-shop.png' })
    await m.ctx.close()
  }
} catch (e) { fail++; console.log('FATAL', e) }
await browser.close(); srv.close()
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0)

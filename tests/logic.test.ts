import assert from 'node:assert/strict'
import { buy, sellMany, settleUpgrade, type State } from '../src/lib/economy'
import { runUpgrade } from '../src/lib/engine'
import { calcChance, resolveUpgrade, HOUSE_EDGE } from '../src/lib/upgrade'
import { idealPrice, pickTargets, PCTS } from '../src/lib/targets'
import { centsToUP, tierOf, usd } from '../src/lib/money'
import type { Attempt, Item } from '../src/types'

let n = 0, failed = 0
const t = async (name: string, fn: () => void | Promise<void>) => { try { await fn(); n++; console.log('  ok  ', name) } catch (e) { failed++; console.log('  FAIL', name, '\n      ', (e as Error).message) } }
const mk = (defId: number, name: string, price: number): Item => ({ id: `skin-${defId}`, defId, name, icon: 'https://x/i.png', price, base: 'rifle.ak', cat: 'weapon' })
const cheap = mk(1, 'Cheap Skin', 150), mid = mk(2, 'Mid Skin', 400), top = mk(3, 'Top Skin', 3200)
let k = 0; const id = () => `u${++k}`
const base = (): State => ({ balance: 1000, inv: [{ uid: 'a', item: cheap }, { uid: 'b', item: mid }, { uid: 'c', item: cheap }], history: [] })
const sum = (r: { from: Item[]; to: Item }) => calcChance(r.from.reduce((a, i) => a + i.price, 0), r.to.price)
const win = async (r: { from: Item[]; to: Item }) => ({ chance: sum(r), roll: 0, won: true })
const lose = async (r: { from: Item[]; to: Item }) => ({ chance: sum(r), roll: .99, won: false })
const att = (won: boolean): Attempt => ({ id: 'x', at: 0, from: [cheap], to: top, chance: .1, roll: .5, won, mode: 'fast' })

;(async () => {
  console.log('Деньги и классы')
  await t('100 UP = $1: цена в центах = цена в UP', () => { assert.equal(centsToUP(999), 999); assert.equal(usd(999), '$9.99') })
  await t('ценовые классы', () => { assert.equal(tierOf(99), 'common'); assert.equal(tierOf(100), 'rare'); assert.equal(tierOf(500), 'epic'); assert.equal(tierOf(2500), 'legend') })

  console.log('Вероятность')
  await t('нет шанса, если цель не дороже входа / вход пуст / NaN', () => { assert.equal(calcChance(100, 100), 0); assert.equal(calcChance(120, 100), 0); assert.equal(calcChance(0, 100), 0); assert.equal(calcChance(NaN, 100), 0) })
  await t('формула: сумма / цель × 0.95', () => assert(Math.abs(calcChance(550, 3200) - (550 / 3200) * 0.95) < 1e-12))
  await t('объединение двух предметов суммирует цены', () => assert(Math.abs(calcChance(cheap.price + mid.price, top.price) - (550 / 3200) * 0.95) < 1e-12))
  await t('верхняя граница 90%; шанс ниже 1% = цель недоступна (не поднимается до 1%)', () => { assert.equal(calcChance(99, 100), 0.9); assert.equal(calcChance(1, 1e6), 0); assert.equal(calcChance(100, 9600), 0); assert(calcChance(100, 9000) > 0.0105) })
  await t('нет положительного ожидания: шанс × цена ≤ вложение × (1 − комиссия)', () => { for (let i = 0; i < 20000; i++) { const tot = 1 + Math.floor(Math.random() * 50000), pr = tot + 1 + Math.floor(Math.random() * 400000), c = calcChance(tot, pr); if (c > 0) assert(c * pr <= tot * (1 - HOUSE_EDGE) + 1e-6, `${tot} ${pr} ${c}`) } })
  await t('шанс монотонно растёт с суммой входа', () => { let p = 0; for (let v = 10; v < 3200; v += 50) { const c = calcChance(v, 3200); assert(c >= p); p = c } })
  await t('resolveUpgrade: частота побед ≈ шансу (20 000 бросков)', async () => {
    let w = 0; const N = 20000, want = calcChance(550, 3200)
    for (let i = 0; i < N; i++) if ((await resolveUpgrade({ from: [cheap, mid], to: top })).won) w++
    assert(Math.abs(w / N - want) < 0.015, `${w / N} vs ${want}`)
  })

  console.log('Подбор цели по проценту (35 / 50 / 75)')
  const catalog = Array.from({ length: 400 }, (_, i) => mk(1000 + i, `Cat ${i}`, 20 + i * 13 + (i % 7)))
  await t('идеальная цена при шансе pct% даёт ровно pct%', () => { for (const p of PCTS) for (const tot of [100, 777, 5000, 123456]) assert(Math.abs(calcChance(tot, idealPrice(tot, p)) - p / 100) < 1e-12) })
  await t('идеальная цена всегда дороже вложения (нельзя получить дешевле)', () => { for (const p of PCTS) for (let tot = 1; tot < 1e6; tot = tot * 3 + 1) assert(idealPrice(tot, p) > tot) })
  await t('точное совпадение находится первым с нулевым отклонением', () => { const items = [mk(1, 'a', 1800), mk(2, 'b', 1900), mk(3, 'c', 2000)]; const r = pickTargets(items, 1000, 50); assert.equal(r[0].item.defId, 2); assert(r[0].diff < 1e-12) })
  await t('ближайший по реальному шансу, а не по цене', () => { const r = pickTargets([mk(1, 'a', 1850), mk(2, 'b', 1950), mk(3, 'c', 2500)], 1000, 50); assert.equal(r[0].item.defId, 2) /* .4872 ближе к .5, чем .5135 */ })
  await t('свойство: первый вариант минимизирует |шанс − pct| среди всех допустимых', () => {
    for (const p of PCTS) for (const tot of [60, 400, 1500, 4000, 9000]) {
      const r = pickTargets(catalog, tot, p), valid = catalog.filter(i => calcChance(tot, i.price) > 0)
      if (!valid.length) { assert.equal(r.length, 0); continue }
      const best = Math.min(...valid.map(i => Math.abs(calcChance(tot, i.price) - p / 100)))
      assert(Math.abs(r[0].diff - best) < 1e-12, `${p} ${tot}`)
      for (let k = 1; k < r.length; k++) assert(r[k].diff >= r[k - 1].diff - 1e-15)
    }
  })
  await t('показанный шанс == шанс апгрейда; цели не дешевле входа; нет дублей', () => {
    for (const p of PCTS) for (const tot of [60, 400, 1500, 4000]) { const r = pickTargets([...catalog, ...catalog], tot, p, 6); assert.equal(new Set(r.map(x => x.item.id)).size, r.length); for (const x of r) { assert(x.item.price > tot); assert.equal(x.chance, calcChance(tot, x.item.price)); assert(x.chance > 0 && x.chance <= 0.9) } }
  })
  await t('если точного нет — берётся ближайший и показывается фактический процент', () => { const r = pickTargets([mk(1, 'a', 5000)], 1000, 75); assert.equal(r.length, 1); assert(Math.abs(r[0].chance - 0.19) < 1e-12); assert(r[0].diff > 0.5) })
  await t('нет подходящих (все дешевле или слишком дорогие) → пустой список', () => { assert.equal(pickTargets([mk(1, 'a', 100)], 1000, 50).length, 0); assert.equal(pickTargets([mk(1, 'a', 1e7)], 1000, 50).length, 0); assert.equal(pickTargets([], 1000, 50).length, 0) })
  await t('частота побед выбранной цели ≈ показанному шансу (30 000 бросков)', async () => {
    const pk = pickTargets(catalog, 1500, 50)[0]; let w = 0; const N = 30000
    for (let i = 0; i < N; i++) if ((await resolveUpgrade({ from: [mk(1, 'in', 1500)], to: pk.item })).won) w++
    assert(Math.abs(w / N - pk.chance) < 0.012, `${w / N} vs ${pk.chance}`)
  })
  await t('FAST и SLOW с подобранной целью: одинаковый шанс, баланс и инвентарь корректны', async () => {
    const pk = pickTargets(catalog, 150, 35)[0]; assert(pk)
    for (const mode of ['fast', 'slow'] as const) {
      const r = await runUpgrade(base(), ['a'], pk.item, mode, id, win); assert(r.ok && r.attempt)
      assert.equal(r.attempt!.chance, pk.chance); assert.equal(r.attempt!.to.defId, pk.item.defId)
      if (r.ok) { assert.equal(r.state.balance, 1000); assert.equal(r.state.inv[0].item.price, pk.item.price); assert(r.state.inv[0].item.price > 150) }
    }
  })

  console.log('Продажа / покупка / баланс')
  await t('продажа зачисляет цену', () => { const r = sellMany(base(), ['a']); assert(r.ok && r.state.balance === 1150 && r.state.inv.length === 2) })
  await t('нельзя продать дважды', () => { const r = sellMany(base(), ['a']); assert(r.ok && !sellMany(r.state, ['a']).ok) })
  await t('дубли uid в одной продаже считаются один раз', () => { const r = sellMany(base(), ['a', 'a']); assert(r.ok && r.gained === 150) })
  await t('нельзя купить без денег; баланс не уходит в минус', () => { assert(!buy({ ...base(), balance: 3199 }, top, id()).ok); const r = buy({ ...base(), balance: 3200 }, top, id()); assert(r.ok && r.state.balance === 0) })
  await t('покупка добавляет ровно один предмет', () => { const r = buy(base(), cheap, id()); assert(r.ok && r.state.inv.length === 4 && r.state.balance === 850) })
  await t('предмет без цены купить нельзя', () => { assert(!buy(base(), { ...cheap, price: 0 }, id()).ok); assert(!buy(base(), { ...cheap, price: NaN }, id()).ok) })

  console.log('Апгрейд и результат')
  await t('победа: входы списаны, цель выдана, история записана', async () => {
    const r = await runUpgrade(base(), ['a', 'b'], top, 'fast', id, win); assert(r.ok)
    if (r.ok) { assert.equal(r.state.inv.length, 2); assert.equal(r.state.inv[0].item.defId, 3); assert(!r.state.inv.some(o => o.uid === 'a' || o.uid === 'b')); assert.equal(r.state.history.length, 1); assert.equal(r.state.balance, 1000); assert(r.attempt?.won) }
  })
  await t('поражение: входы списаны, цель не выдана', async () => {
    const r = await runUpgrade(base(), ['a', 'b'], top, 'slow', id, lose); assert(r.ok)
    if (r.ok) { assert.equal(r.state.inv.length, 1); assert(!r.state.inv.some(o => o.item.defId === 3)); assert.equal(r.state.history[0].won, false) }
  })
  await t('FAST и SLOW: одинаковый шанс', async () => {
    const f = await runUpgrade(base(), ['a'], top, 'fast', id), s = await runUpgrade(base(), ['a'], top, 'slow', id)
    assert(f.ok && s.ok && f.attempt && s.attempt); assert.equal(f.attempt!.chance, s.attempt!.chance); assert.equal(f.attempt!.chance, calcChance(150, 3200))
  })
  await t('резолвер с неверным шансом/броском отвергается, состояние не меняется', async () => {
    for (const bad of [async () => ({ chance: .5, roll: 0, won: true }), async (r: { from: Item[]; to: Item }) => ({ chance: sum(r), roll: 0.9, won: true }), async (r: { from: Item[]; to: Item }) => ({ chance: sum(r), roll: 1.5, won: false })]) {
      const s = base(); const r = await runUpgrade(s, ['a'], top, 'fast', id, bad); assert(!r.ok); assert.equal(s.inv.length, 3); assert.equal(s.history.length, 0)
    }
  })
  await t('апгрейд без предметов запрещён', async () => assert(!(await runUpgrade(base(), [], top, 'fast', id, win)).ok))
  await t('цель не дороже входа запрещена', async () => assert(!(await runUpgrade(base(), ['b'], cheap, 'fast', id, win)).ok))
  await t('один предмет в двух слотах запрещён', async () => assert(!(await runUpgrade(base(), ['a', 'a'], top, 'fast', id, win)).ok))
  await t('проданный предмет использовать нельзя', async () => { const sold = sellMany(base(), ['a']); assert(sold.ok); assert(!(await runUpgrade((sold as { state: State }).state, ['a'], top, 'fast', id, win)).ok) })
  await t('повторное использование списанного предмета запрещено', async () => { const r = await runUpgrade(base(), ['a'], top, 'fast', id, win); assert(r.ok); assert(!settleUpgrade((r as { state: State }).state, ['a'], r.attempt!, id()).ok) })
  await t('больше 5 предметов запрещено', () => assert(!settleUpgrade({ ...base(), inv: ['1', '2', '3', '4', '5', '6'].map(u => ({ uid: u, item: cheap })) }, ['1', '2', '3', '4', '5', '6'], att(false), id()).ok))
  await t('баланс не меняется апгрейдом и не бывает отрицательным', async () => { for (const r of [win, lose]) { const o = await runUpgrade(base(), ['a'], top, 'fast', id, r); assert(o.ok && o.state.balance === 1000) } })
  await t('цель без цены запрещена', async () => assert(!(await runUpgrade(base(), ['a'], { ...top, price: 0 }, 'fast', id, win)).ok))

  console.log(`\n${n} passed, ${failed} failed`); process.exit(failed ? 1 : 0)
})()

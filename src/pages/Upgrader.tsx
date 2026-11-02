import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Zap, Timer, Plus, Trophy, Flame, ChevronsUp, AlertTriangle } from 'lucide-react'
import type { Store } from '../lib/useStore'
import type { Item, Owned } from '../types'
import { DEFAULT_QUERY, type Query } from '../lib/catalog'
import { useCatalog } from '../lib/useCatalog'
import { useTargets } from '../lib/useTargets'
import { PCTS } from '../lib/targets'
import CatalogFilters from '../components/CatalogFilters'
import CatalogGrid from '../components/CatalogGrid'
import { calcChance, HOUSE_EDGE } from '../lib/upgrade'
import { MAX_INPUTS } from '../lib/economy'
import { tierOf, usd } from '../lib/money'
import { play, spinBed } from '../lib/sound'
import { toast } from '../lib/toast'
import ItemCard from '../components/ItemCard'
import ItemImage from '../components/ItemImage'

const DUR = { fast: 1800, slow: 4600 }
interface View { inputs: { uid: string; item: Item }[]; to: Item | null; total: number; chance: number }
type Res = { won: boolean; name: string; price: number } | null
const fmt = (n: number) => n.toLocaleString('ru-RU')

export default function Upgrader({ s, go }: { s: Store; go: (p: string) => void }) {
  const [sel, setSel] = useState<string[]>([])
  const [target, setTarget] = useState<Item | null>(null)
  const [q, setQ] = useState<Query>(DEFAULT_QUERY)
  const [pct, setPct] = useState<number | null>(null)          // желаемый шанс: 35 / 50 / 75 или null = выбор цели вручную
  const [mode, setMode] = useState<'fast' | 'slow'>('slow')
  const [angle, setAngle] = useState(0)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<Res>(null)
  const [dur, setDur] = useState(DUR.slow)
  // Снимок на время анимации: предметы списываются в момент запуска, но интерфейс не должен меняться до результата.
  const [frozen, setFrozen] = useState<View | null>(null)
  const [frozenInv, setFrozenInv] = useState<Owned[] | null>(null)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const live: View = useMemo(() => {
    const inputs = sel.map(u => s.inv.find(o => o.uid === u)).filter((o): o is Owned => !!o).map(o => ({ uid: o.uid, item: o.item }))
    const total = inputs.reduce((a, x) => a + x.item.price, 0)
    return { inputs, to: target, total, chance: target ? calcChance(total, target.price) : 0 }
  }, [sel, target, s.inv])
  const view = frozen ?? live
  const shownInv = frozenInv ?? s.inv

  // Ручной режим: обычный каталог. Режим процента: подбор ближайших по реальному шансу целей.
  const cat = useCatalog(q, 48, pct === null)
  const manual = useMemo(() => cat.items.filter(i => calcChance(view.total, i.price) > 0), [cat.items, view.total])
  useEffect(() => { if (pct === null && view.total > 0 && !cat.loading && !cat.more && !cat.error && cat.hasMore && manual.length < 12 && cat.page < 15) cat.loadMore() }, [pct, view.total, cat.loading, cat.more, cat.error, cat.hasMore, cat.page, manual.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const tg = useTargets(live.total, busy ? null : pct, q.item, q.search, q.category)
  // Новая подборка → автоматически выбираем ближайший вариант (пользователь может выбрать другой из списка).
  useEffect(() => { if (pct && !busy && !tg.loading) setTarget(tg.picks[0]?.item ?? null) }, [tg.picks, tg.loading]) // eslint-disable-line react-hooks/exhaustive-deps

  const canRun = !busy && live.inputs.length > 0 && !!live.to && live.chance > 0
  const touch = () => { setFrozen(null); setRes(null) }
  const toggle = (uid: string) => {
    if (busy) return
    touch(); setTarget(null)
    if (!sel.includes(uid) && sel.length >= MAX_INPUTS) { toast(`Не больше ${MAX_INPUTS} предметов`, 'err'); return }
    setSel(sel.includes(uid) ? sel.filter(x => x !== uid) : [...sel, uid])
  }
  const choosePct = (p: number | null) => { if (busy) return; touch(); setTarget(null); setPct(p === pct ? null : p) }

  async function run() {
    if (!canRun || !live.to) return
    const to = live.to, d = DUR[mode]
    setFrozen(live); setFrozenInv(s.inv); setDur(d); setRes(null); setBusy(true)
    play('start')
    const out = await s.upgrade(sel, to, mode)
    if (!out.ok || !out.attempt) { toast(out.ok ? 'Ошибка апгрейда' : out.error, 'err'); setFrozen(null); setFrozenInv(null); setBusy(false); return }
    const a = out.attempt
    setAngle(prev => (Math.floor(prev / 360) + (mode === 'fast' ? 3 : 5)) * 360 + a.roll * 360)
    spinBed(d)
    const n = mode === 'fast' ? 8 : 16
    for (let i = 1; i <= n; i++) timers.current.push(window.setTimeout(() => play('tick', i / n), d * (1 - Math.pow(1 - i / n, 3)) * 0.92))
    timers.current.push(window.setTimeout(() => play('stop'), d + 60))
    timers.current.push(window.setTimeout(() => {
      play(a.won ? 'win' : 'lose')
      setRes({ won: a.won, name: to.name, price: to.price })
      setSel([]); setTarget(null); setFrozenInv(null); setBusy(false)
    }, d + 330))
  }

  const R = 92, C = 2 * Math.PI * R
  const label = busy ? 'Идёт апгрейд…' : !live.inputs.length ? 'Выберите предметы' : !live.to ? (pct && tg.loading ? 'Подбираем цель…' : 'Выберите цель') : 'Upgrade'
  const v = view
  return (
    <section className="page">
      <h1>Апгрейд</h1>
      <div className="howto">1. Выберите до {MAX_INPUTS} своих предметов · 2. Выберите желаемый шанс (35/50/75%) — цель подберётся по реальным ценам, или выберите цель вручную · 3. Нажмите Upgrade. Шанс = сумма цен ÷ цена цели − {HOUSE_EDGE * 100}% комиссии.</div>
      <div className="up-grid">
        <div className="panel">
          <h2>Ваши предметы</h2>
          {shownInv.length === 0
            ? <div className="empty"><p>Инвентарь пуст. Купите предмет в магазине за виртуальный баланс.</p><button className="btn ghost" onClick={() => go('shop')}>Открыть магазин</button></div>
            : <div className="grid">{shownInv.map(o => <ItemCard key={o.uid} compact item={o.item} selected={v.inputs.some(x => x.uid === o.uid)} disabled={busy} onClick={() => toggle(o.uid)} />)}</div>}
        </div>

        <div className="panel stage">
          <div className="slots">
            <div className="slotbox"><span className="lbl">Вы вкладываете · <b>{fmt(v.total)} UP</b></span>
              <div className="slotrow">{Array.from({ length: MAX_INPUTS }, (_, i) => { const x = v.inputs[i]; return x
                ? <button key={x.uid} disabled={busy} className={`slot full r-${tierOf(x.item.price)}`} onClick={() => toggle(x.uid)} title={`${x.item.name} — убрать`}><ItemImage item={x.item} size={30} /></button>
                : <span key={i} className="slot"><Plus size={14} /></span> })}</div></div>
            <ArrowRight className="arrow" size={20} />
            <div className="slotbox"><span className="lbl">Цель · <b>{v.to ? `${fmt(v.to.price)} UP` : '—'}</b></span>
              <div className="slotrow">{v.to ? <span className={`slot full big r-${tierOf(v.to.price)}`} title={v.to.name}><ItemImage item={v.to} size={44} /></span> : <span className="slot big"><Plus size={18} /></span>}</div></div>
          </div>

          <div className={`wheel ${busy ? 'busy' : ''} ${res ? (res.won ? 'win' : 'lose') : ''}`}>
            <svg viewBox="0 0 220 220" aria-hidden>
              <circle cx="110" cy="110" r={R} className="track" />
              <circle cx="110" cy="110" r={R} className="zone" strokeDasharray={`${v.chance * C} ${C}`} transform="rotate(-90 110 110)" />
              <g className="needle" style={{ transform: `rotate(${angle}deg)`, transformOrigin: '110px 110px', transition: busy ? `transform ${dur}ms cubic-bezier(.12,.7,.1,1)` : 'none' }}><path d="M110 4 l9 20 h-18z" /></g>
            </svg>
            <div className="pct"><b>{(v.chance * 100).toFixed(1)}%</b><span>шанс успеха</span></div>
          </div>

          <div className="ctrls">
            <div className="modes" role="radiogroup" aria-label="Желаемый шанс">
              {PCTS.map(p => <button key={p} role="radio" aria-checked={pct === p} className={pct === p ? 'on' : ''} disabled={busy} onClick={() => choosePct(p)}>{p}%</button>)}
              <button role="radio" aria-checked={pct === null} className={pct === null ? 'on' : ''} disabled={busy} onClick={() => choosePct(null)} title="Выбрать цель самостоятельно">Вручную</button>
            </div>
            <div className="modes" role="radiogroup" aria-label="Скорость анимации">
              <button role="radio" aria-checked={mode === 'fast'} className={mode === 'fast' ? 'on' : ''} disabled={busy} onClick={() => setMode('fast')}><Zap size={16} />FAST</button>
              <button role="radio" aria-checked={mode === 'slow'} className={mode === 'slow' ? 'on' : ''} disabled={busy} onClick={() => setMode('slow')}><Timer size={16} />SLOW</button>
            </div>
          </div>
          <p className="hint">Режим FAST/SLOW меняет только скорость анимации. Шанс одинаков.</p>

          {v.to && v.total > 0 && (
            <dl className="calc" aria-label="Расчёт апгрейда">
              <dt>Вложено</dt><dd>{fmt(v.total)} UP · {usd(v.total)}</dd>
              <dt>Цена цели</dt><dd>{fmt(v.to.price)} UP · {usd(v.to.price)}</dd>
              <dt>Реальный шанс</dt><dd><b>{(v.chance * 100).toFixed(2)}%</b>{pct && !frozen && <em> (запрошено {pct}%, {Math.abs(v.chance * 100 - pct) < 0.005 ? 'точно' : `отклонение ${Math.abs(v.chance * 100 - pct).toFixed(2)} п.п.`})</em>}</dd>
              <dt>При победе</dt><dd className="okc">получите скин за {fmt(v.to.price)} UP (+{fmt(v.to.price - v.total)} UP)</dd>
              <dt>При проигрыше</dt><dd className="badc">теряете вложенное: −{fmt(v.total)} UP</dd>
            </dl>
          )}
          <button className={`btn huge up ${busy ? 'spin' : ''}`} data-snd="none" disabled={!canRun} onClick={run}><ChevronsUp size={22} />{label}</button>

          {res && <div className={`result ${res.won ? 'ok' : 'bad'}`} role="status">
            {res.won ? <Trophy size={22} /> : <Flame size={22} />}
            <div><b>{res.won ? 'Апгрейд успешен' : 'Апгрейд не удался'}</b><br />{res.won ? `${res.name} (${fmt(res.price)} UP) уже в инвентаре.` : 'Вложенные предметы потеряны. Попробуйте снова.'}</div></div>}
        </div>

        <div className="panel">
          <h2>{pct ? `Цели под шанс ≈ ${pct}%` : 'Желаемый скин'}</h2>
          <CatalogFilters q={q} onChange={setQ} hideSort={pct !== null} />
          {v.total === 0 ? <p className="muted">Выберите свои предметы — {pct ? 'подберём цели под выбранный шанс.' : 'покажем цели дороже вложения с шансом от 1%.'}</p>
            : pct === null
              ? <CatalogGrid c={cat} items={manual} card={i => <ItemCard key={i.id} compact item={i} selected={v.to?.id === i.id} disabled={busy} onClick={() => { touch(); setTarget(i) }} />} />
              : tg.loading ? <div className="grid" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <div key={i} className="card skel" />)}</div>
              : tg.error ? <div className="banner" role="alert"><AlertTriangle size={22} /><div><b>Не удалось подобрать цели</b><p>{tg.error.message}</p></div><button className="btn ghost sm" onClick={tg.retry}>Повторить</button></div>
              : tg.picks.length === 0 ? <div className="empty"><p>Подходящих скинов дороже вложения не найдено. Измените фильтры или выберите цель вручную.</p></div>
              : <>
                <p className="hint" style={{ textAlign: 'left' }}>Показаны ближайшие по реальному шансу. Точного совпадения может не быть, тогда указан фактический процент.</p>
                <div className="grid">{tg.picks.map((p, k) => <ItemCard key={p.item.id} compact item={p.item} selected={v.to?.id === p.item.id} disabled={busy} onClick={() => { touch(); setTarget(p.item) }}
                  sub={<span className="sub"><b>{(p.chance * 100).toFixed(1)}%</b> · +{fmt(p.item.price - live.total)} UP{k === 0 ? ' · ближайший' : ''}</span>} />)}</div>
              </>}
        </div>
      </div>
    </section>
  )
}

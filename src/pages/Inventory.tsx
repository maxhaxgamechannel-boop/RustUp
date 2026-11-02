import { useMemo, useState } from 'react'
import { Coins, CheckSquare, XSquare } from 'lucide-react'
import type { Store } from '../lib/useStore'
import { play } from '../lib/sound'
import { toast } from '../lib/toast'
import ItemCard from '../components/ItemCard'
import Confirm from '../components/Confirm'
import ItemDetail from '../components/ItemDetail'

export default function Inventory({ s, go }: { s: Store; go: (p: string) => void }) {
  const [sel, setSel] = useState<string[]>([])
  const [ask, setAsk] = useState<string[] | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const valid = useMemo(() => sel.filter(u => s.inv.some(o => o.uid === u)), [sel, s.inv])
  const picked = valid.map(u => s.inv.find(o => o.uid === u)!.item)
  const sum = picked.reduce((a, i) => a + i.price, 0)
  const total = s.inv.reduce((a, o) => a + o.item.price, 0)
  const toggle = (u: string) => { setFocus(u); setSel(c => c.includes(u) ? c.filter(x => x !== u) : [...c, u]) }

  const askItems = (ask ?? []).filter(u => s.inv.some(o => o.uid === u)).map(u => s.inv.find(o => o.uid === u)!.item)
  const askSum = askItems.reduce((a, i) => a + i.price, 0)
  const fo = s.inv.find(o => o.uid === focus)
  function sell() {
    const out = s.sellMany(ask ?? []); setSel(c => c.filter(u => !(ask ?? []).includes(u))); setAsk(null)
    if (out.ok) { play('coin'); toast(`Продано предметов: ${askItems.length}. Зачислено ${out.gained} UP`) } else toast(out.error, 'err')
  }
  return (
    <section className="page">
      <h1>Инвентарь</h1>
      <div className="stats">
        <div className="stat"><span>Предметов</span><b>{s.inv.length}</b></div>
        <div className="stat"><span>Общая стоимость</span><b>{total.toLocaleString('ru-RU')} UP</b></div>
        <div className="stat"><span>Выбрано</span><b>{valid.length} · {sum.toLocaleString('ru-RU')} UP</b></div>
      </div>
      {s.inv.length === 0
        ? <div className="empty"><p>Инвентарь пуст. Купите скины в магазине за виртуальный баланс.</p><button className="btn ghost" onClick={() => go('shop')}>Открыть магазин</button></div>
        : <>
          <div className="bar">
            <button className="btn ghost sm" onClick={() => setSel(s.inv.map(o => o.uid))}><CheckSquare size={16} />Выбрать все</button>
            <button className="btn ghost sm" disabled={!valid.length} onClick={() => setSel([])}><XSquare size={16} />Снять выбор</button>
            <button className="btn sm grow" disabled={!valid.length} data-snd="none" onClick={() => setAsk(valid)}><Coins size={16} />Продать выбранные ({sum} UP)</button>
          </div>
          <div className="split">
            <div className="grid big">{s.inv.map(o => <ItemCard key={o.uid} item={o.item} selected={valid.includes(o.uid)} onClick={() => toggle(o.uid)} />)}</div>
            <ItemDetail item={fo ? fo.item : null}>{fo && <button className="btn ghost" data-snd="none" onClick={() => setAsk([fo.uid])}><Coins size={16} />Продать за {fo.item.price} UP</button>}</ItemDetail>
          </div>
        </>}
      {ask && askItems.length > 0 && <Confirm title="Подтвердите продажу" ok={`Продать за ${askSum} UP`} onOk={sell} onCancel={() => setAsk(null)}>
        <ul className="sell-list">{askItems.map((i, k) => <li key={k}><span>{i.name}</span><b>{i.price} UP</b></li>)}</ul>
        <p className="muted">Итого на баланс: <b>{askSum} UP</b>. Предметы исчезнут из инвентаря.</p></Confirm>}
    </section>
  )
}

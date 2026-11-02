import { useState } from 'react'
import type { Store } from '../lib/useStore'
import type { Item } from '../types'
import { DEFAULT_QUERY, type Query } from '../lib/catalog'
import { useCatalog } from '../lib/useCatalog'
import { play } from '../lib/sound'
import { toast } from '../lib/toast'
import ItemCard from '../components/ItemCard'
import ItemDetail from '../components/ItemDetail'
import CatalogFilters from '../components/CatalogFilters'
import CatalogGrid from '../components/CatalogGrid'

export default function Shop({ s }: { s: Store }) {
  const [q, setQ] = useState<Query>(DEFAULT_QUERY)
  const [pick, setPick] = useState<Item | null>(null)
  const c = useCatalog(q)
  const buy = () => { if (!pick) return; const o = s.buy(pick); if (o.ok) { play('coin'); toast(`Куплено: ${pick.name} за ${pick.price} UP`) } else toast(o.error, 'err') }
  return (
    <section className="page">
      <h1>Магазин скинов</h1>
      <p className="muted" style={{ marginTop: -8 }}>Реальные скины Rust с ценами Steam Community Market (100 UP = $1). Покупка только за виртуальный баланс: <b>{s.balance.toLocaleString('ru-RU')} UP</b></p>
      <CatalogFilters q={q} onChange={setQ} found={c.loading || c.error ? undefined : c.total} />
      <div className="split">
        <div><CatalogGrid c={c} big card={i => <ItemCard key={i.id} item={i} selected={pick?.id === i.id} onClick={() => setPick(i)} />} /></div>
        <ItemDetail item={pick}>{pick && <button className="btn" data-snd="none" disabled={s.balance < pick.price} onClick={buy}>{s.balance < pick.price ? `Не хватает ${(pick.price - s.balance).toLocaleString('ru-RU')} UP` : `Купить за ${pick.price.toLocaleString('ru-RU')} UP`}</button>}</ItemDetail>
      </div>
    </section>
  )
}

import { AlertTriangle } from 'lucide-react'
import type { Item } from '../types'
import type { Catalog } from '../lib/useCatalog'

/** Единое отображение каталога: загрузка, ошибка с понятным текстом, пустой результат, «Показать ещё». */
export default function CatalogGrid({ c, card, items = c.items, big }: { c: Catalog; card: (i: Item) => React.ReactNode; items?: Item[]; big?: boolean }) {
  const cls = `grid ${big ? 'big' : ''}`
  if (c.loading) return <div className={cls} aria-busy="true">{Array.from({ length: 12 }, (_, i) => <div key={i} className="card skel" />)}</div>
  if (c.error && !c.items.length) return (
    <div className="banner" role="alert"><AlertTriangle size={22} /><div><b>Каталог недоступен</b><p>{c.error.message}</p></div><button className="btn ghost sm" onClick={c.retry}>Повторить</button></div>)
  if (!items.length && !c.hasMore) return <div className="empty"><p>Скины не найдены. Измените поиск или фильтры.</p></div>
  return (<>
    <div className={cls}>{items.map(card)}</div>
    {c.error && <p className="hint errtxt" role="alert">{c.error.message}</p>}
    {c.capped && <p className="hint">Показаны первые 1000 совпадений, отсортированные по названию. Уточните поиск, чтобы увидеть остальные.</p>}
    {c.hasMore && <button className="btn ghost sm more" disabled={c.more} onClick={c.loadMore}>{c.more ? 'Загрузка…' : `Показать ещё (загружено ${c.items.length} из ${c.total})`}</button>}
  </>)
}

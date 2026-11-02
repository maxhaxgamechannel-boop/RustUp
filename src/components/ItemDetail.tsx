import type { Item } from '../types'
import { tierOf, usd } from '../lib/money'
import ItemImage from './ItemImage'
import { TIER_LABEL } from './ItemCard'

export default function ItemDetail({ item, children }: { item: Item | null; children?: React.ReactNode }) {
  if (!item) return <aside className="detail empty-d"><p className="muted">Выберите скин, чтобы увидеть подробности.</p></aside>
  return (
    <aside className={`detail r-${tierOf(item.price)}`}>
      <div className="dart"><ItemImage item={item} size={150} /></div>
      <h2>{item.name}</h2>
      <dl>
        <dt>Цена</dt><dd><b>{item.price.toLocaleString('ru-RU')} UP</b> · {usd(item.price)}</dd>
        <dt>Ценовой класс</dt><dd className="rar">{TIER_LABEL[tierOf(item.price)]}</dd>
        {item.base && <><dt>Предмет</dt><dd>{item.base}</dd></>}
        {item.collection && <><dt>Коллекция</dt><dd>{item.collection}</dd></>}
        <dt>itemdefid</dt><dd>{item.defId}</dd>
      </dl>
      {children}
    </aside>
  )
}

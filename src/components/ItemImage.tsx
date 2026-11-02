import { useState } from 'react'
import type { Item } from '../types'
import ItemArt from './ItemArt'

/** Иконка скина (icon_url из rust.wiki API). Размер задаёт контейнер (.art/.slot/.dart): картинка вписывается без искажений
 *  (object-fit: contain, max-width/max-height) и не выходит за рамки. При ошибке загрузки — векторная заглушка. */
export default function ItemImage({ item, size = 58 }: { item: Item; size?: number }) {
  const [bad, setBad] = useState('')
  if (!item.icon || bad === item.icon) return <ItemArt cat={item.cat} size={size} />
  return <img className="iimg" src={item.icon} alt={item.name} loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer" onError={() => setBad(item.icon)} />
}

import { Check } from 'lucide-react'
import type { Item } from '../types'
import { tierOf, usd } from '../lib/money'
import ItemImage from './ItemImage'

export const TIER_LABEL = { common: 'До $1', rare: '$1–5', epic: '$5–25', legend: '$25+' }
interface Props { item: Item; selected?: boolean; onClick?: () => void; footer?: React.ReactNode; sub?: React.ReactNode; disabled?: boolean; compact?: boolean }
export default function ItemCard({ item, selected, onClick, footer, sub, disabled, compact }: Props) {
  const body = (<>
    {selected && <span className="chk"><Check size={14} strokeWidth={3} /></span>}
    <span className="art"><ItemImage item={item} size={compact ? 44 : 60} /></span>
    <span className="nm" title={item.name}>{item.name}</span>
    <span className="meta"><b>{item.price.toLocaleString('ru-RU')} UP</b><i>{usd(item.price)}</i></span>
    {sub}
  </>)
  const cls = `card r-${tierOf(item.price)} ${compact ? 'compact' : ''} ${selected ? 'sel' : ''}`
  if (onClick) return <button type="button" className={cls} onClick={onClick} disabled={disabled} aria-pressed={!!selected}>{body}</button>
  return <div className={cls}>{body}{footer}</div>
}

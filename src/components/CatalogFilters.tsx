import { useEffect, useRef, useState } from 'react'
import { RotateCcw, Search, X } from 'lucide-react'
import { CAT_LABEL, DEFAULT_QUERY, fetchBases, SORT_LABEL, type Base, type Query, type Sort } from '../lib/catalog'

const GROUPS: Record<Base['group'], string> = { weapon: 'Оружие', clothing: 'Одежда и броня', build: 'Постройки', tool: 'Инструменты' }

/** Поиск + тип оружия/предмета + категория + сортировка. Все фильтры работают совместно; активные показаны чипами. */
export default function CatalogFilters({ q, onChange, hideSort, found }: { q: Query; onChange: (q: Query) => void; hideSort?: boolean; found?: number }) {
  const [text, setText] = useState(q.search)
  const [bases, setBases] = useState<Base[]>([])
  const latest = useRef(q); latest.current = q   // таймер поиска всегда берёт актуальные фильтры
  useEffect(() => { void fetchBases().then(setBases) }, [])
  useEffect(() => { setText(q.search) }, [q.search])
  useEffect(() => { const t = setTimeout(() => text !== latest.current.search && onChange({ ...latest.current, search: text }), 350); return () => clearTimeout(t) }, [text]) // eslint-disable-line react-hooks/exhaustive-deps

  const baseName = bases.find(b => b.shortname === q.item)?.name ?? q.item
  const chips: { key: string; label: string; clear: () => void }[] = []
  if (q.search) chips.push({ key: 'search', label: `Поиск: «${q.search}»`, clear: () => onChange({ ...q, search: '' }) })
  if (q.item) chips.push({ key: 'item', label: `Предмет: ${baseName}`, clear: () => onChange({ ...q, item: '' }) })
  if (q.category) chips.push({ key: 'cat', label: `Категория: ${CAT_LABEL[q.category] ?? q.category}`, clear: () => onChange({ ...q, category: '' }) })
  if (!hideSort && q.sort !== DEFAULT_QUERY.sort) chips.push({ key: 'sort', label: SORT_LABEL[q.sort], clear: () => onChange({ ...q, sort: DEFAULT_QUERY.sort }) })
  const reset = () => { setText(''); onChange({ ...DEFAULT_QUERY, sort: hideSort ? q.sort : DEFAULT_QUERY.sort }) }

  return (
    <div className="filters">
      <div className="bar">
        <label className="searchbox"><Search size={16} /><input placeholder="Поиск по названию скина" value={text} onChange={e => setText(e.target.value)} aria-label="Поиск по названию скина" /></label>
        <select value={q.item} onChange={e => onChange({ ...q, item: e.target.value })} aria-label="Тип оружия или предмета">
          <option value="">Любое оружие / предмет</option>
          {(Object.keys(GROUPS) as Base['group'][]).map(g => { const list = bases.filter(b => b.group === g); return list.length ? <optgroup key={g} label={GROUPS[g]}>{list.map(b => <option key={b.shortname} value={b.shortname}>{b.name}</option>)}</optgroup> : null })}
        </select>
        {!hideSort && <select value={q.sort} onChange={e => onChange({ ...q, sort: e.target.value as Sort })} aria-label="Сортировка">{(Object.keys(SORT_LABEL) as Sort[]).map(s => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}</select>}
        {chips.length > 0 && <button type="button" className="btn ghost sm" onClick={reset}><RotateCcw size={14} />Сбросить фильтры</button>}
        {found !== undefined && <span className="muted grow">Найдено: <b>{found.toLocaleString('ru-RU')}</b></span>}
      </div>
      <div className="tabs" role="group" aria-label="Категория">{Object.entries(CAT_LABEL).map(([id, label]) => <button type="button" key={id || 'all'} className={q.category === id ? 'on' : ''} aria-pressed={q.category === id} onClick={() => onChange({ ...q, category: id })}>{label}</button>)}</div>
      {chips.length > 0 && <div className="chips" aria-label="Активные фильтры">{chips.map(c => <span className="chip" key={c.key}>{c.label}<button type="button" aria-label={`Убрать фильтр: ${c.label}`} onClick={c.clear}><X size={12} /></button></span>)}</div>}
    </div>
  )
}

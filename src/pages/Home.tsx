import { ArrowUpRight, Wallet, Package, History } from 'lucide-react'
import type { Store } from '../lib/useStore'
import { useCatalog } from '../lib/useCatalog'
import { DEFAULT_QUERY } from '../lib/catalog'
import ItemCard from '../components/ItemCard'
import CatalogGrid from '../components/CatalogGrid'

export default function Home({ go, s }: { go: (p: string) => void; s: Store }) {
  const c = useCatalog(DEFAULT_QUERY, 4)
  return (
    <section className="page">
      <div className="hero">
        <p className="muted">Демо-версия · виртуальный баланс · без реальных денег</p>
        <h1 className="display">Меняйте дешёвые скины на дорогие.<br />Шанс считается честно.</h1>
        <p className="lead">Настоящие скины Rust и цены Steam Market. Выберите скины и цель — RustUP покажет вероятность до запуска: сумма цен ÷ цена цели, минус 5% комиссии.</p>
        <div className="row"><button className="btn" onClick={() => go('shop')}><ArrowUpRight size={18} />Выбрать скины</button><button className="btn ghost" onClick={() => go('upgrade')}>К апгрейду</button></div>
      </div>
      <div className="stats">
        <div className="stat"><Wallet size={18} /><span>Ваш баланс</span><b>{s.balance.toLocaleString('ru-RU')} UP</b></div>
        <div className="stat"><Package size={18} /><span>Предметов</span><b>{s.inv.length}</b></div>
        <div className="stat"><History size={18} /><span>Попыток</span><b>{s.history.length}</b></div>
      </div>
      <h2>Самые дорогие скины на рынке</h2>
      <CatalogGrid c={c} big card={i => <ItemCard key={i.id} item={i} />} />
    </section>
  )
}

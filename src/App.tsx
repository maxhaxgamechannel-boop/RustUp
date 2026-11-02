import { useEffect, useState } from 'react'
import { ArrowBigUp, Home as HomeIc, Package, Zap, History as Hist, User, Wallet, Store as StoreIc, Volume2, VolumeX } from 'lucide-react'
import { useStore } from './lib/useStore'
import Home from './pages/Home'
import Upgrader from './pages/Upgrader'
import Inventory from './pages/Inventory'
import History from './pages/History'
import Profile from './pages/Profile'
import Shop from './pages/Shop'
import Toasts from './components/Toasts'
import { soundEnabled, setSound, play } from './lib/sound'

const NAV = [['home', 'Главная', HomeIc], ['upgrade', 'Апгрейд', Zap], ['inventory', 'Инвентарь', Package], ['shop', 'Магазин', StoreIc], ['history', 'История', Hist], ['profile', 'Профиль', User]] as const

export default function App() {
  const s = useStore()
  const [snd, setSnd] = useState(soundEnabled)
  const read = () => (location.hash.slice(1) || 'home')
  const [page, setPage] = useState(read)
  useEffect(() => { const f = () => setPage(read()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  // Звук нажатия: карточки — «выбор», остальные кнопки и ссылки навигации — «клик». data-snd="none" — у кнопок со своим звуком.
  useEffect(() => {
    const f = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('button, a[href^="#"]')
      if (!el || el.dataset.snd === 'none' || (el as HTMLButtonElement).disabled) return
      play(el.classList.contains('card') ? 'select' : 'click')
    }
    document.addEventListener('click', f); return () => document.removeEventListener('click', f)
  }, [])
  const go = (p: string) => { location.hash = p; scrollTo(0, 0) }
  return (
    <>
      <header className="top">
        <a className="logo" href="#home"><ArrowBigUp size={26} fill="currentColor" />Rust<b>UP</b></a>
        <nav aria-label="Основная навигация">{NAV.map(([id, label, Ic]) =>
          <a key={id} href={`#${id}`} className={page === id ? 'on' : ''}><Ic size={16} /><span>{label}</span></a>)}</nav>
        <button className="icon" aria-pressed={!snd} aria-label={snd ? 'Выключить звук' : 'Включить звук'} title={snd ? 'Звук включён' : 'Звук выключен'} onClick={() => { setSound(!snd); setSnd(!snd) }}>{snd ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
        <div className="bal" title="Виртуальный баланс"><Wallet size={16} />{s.balance} UP</div>
      </header>
      <main>
        {page === 'upgrade' ? <Upgrader s={s} go={go} /> : page === 'inventory' ? <Inventory s={s} go={go} /> : page === 'shop' ? <Shop s={s} /> :
          page === 'history' ? <History s={s} go={go} /> : page === 'profile' ? <Profile s={s} /> : <Home s={s} go={go} />}
      </main>
      <Toasts />
      <footer className="foot">RustUP — демонстрационный проект. Виртуальная валюта UP не имеет стоимости, вывод и депозиты невозможны. Не связан с Facepunch Studios. Данные скинов и цен: <a href="https://rust.wiki" target="_blank" rel="noreferrer">rust.wiki</a> (Steam Community Market).</footer>
    </>
  )
}

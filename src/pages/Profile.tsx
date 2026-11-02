import type { Store } from '../lib/useStore'

export default function Profile({ s }: { s: Store }) {
  const wins = s.history.filter(a => a.won).length
  const rate = s.history.length ? Math.round((wins / s.history.length) * 100) : 0
  const best = s.history.filter(a => a.won).sort((a, b) => b.to.price - a.to.price)[0]
  const stats: [string, string][] = [
    ['Баланс', `${s.balance.toLocaleString('ru-RU')} UP`], ['Предметов', String(s.inv.length)], ['Попыток', String(s.history.length)],
    ['Успешных', `${wins} (${rate}%)`], ['Лучший выигрыш', best ? best.to.name : '—'],
  ]
  return (
    <section className="page">
      <h1>Профиль</h1>
      <div className="who"><span className="ava">DU</span><div><b>Demo User</b><p className="muted">Локальный профиль. Данные хранятся только в этом браузере.</p></div></div>
      <div className="stats">{stats.map(([k, v]) => <div key={k} className="stat"><span>{k}</span><b>{v}</b></div>)}</div>
      <button className="btn ghost" onClick={() => { if (confirm('Сбросить баланс, инвентарь и историю?')) s.reset() }}>Сбросить демо-данные</button>
    </section>
  )
}

import type { Store } from '../lib/useStore'

export default function History({ s, go }: { s: Store; go: (p: string) => void }) {
  return (
    <section className="page">
      <h1>История попыток</h1>
      {s.history.length === 0
        ? <div className="empty"><p>Попыток пока нет. Запустите первый апгрейд.</p><button className="btn ghost" onClick={() => go('upgrade')}>К апгрейду</button></div>
        : <div className="table-wrap"><table>
            <thead><tr><th>Время</th><th>Вложено</th><th>Цель</th><th>Режим</th><th>Шанс</th><th>Выпало</th><th>Итог</th></tr></thead>
            <tbody>{s.history.map(a => (
              <tr key={a.id}><td>{new Date(a.at).toLocaleString('ru-RU')}</td><td>{a.from.map(i => i.name).join(', ')}</td><td>{a.to.name}</td>
                <td>{a.mode === 'fast' ? 'FAST' : 'SLOW'}</td><td>{(a.chance * 100).toFixed(1)}%</td><td>{(a.roll * 100).toFixed(1)}%</td>
                <td className={a.won ? 'ok' : 'bad'}>{a.won ? 'Успех' : 'Неудача'}</td></tr>))}
            </tbody></table></div>}
    </section>
  )
}

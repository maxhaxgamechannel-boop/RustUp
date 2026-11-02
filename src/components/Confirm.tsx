import { useEffect } from 'react'
import { play } from '../lib/sound'
export default function Confirm({ title, children, ok, onOk, onCancel }: { title: string; children: React.ReactNode; ok: string; onOk: () => void; onCancel: () => void }) {
  useEffect(() => { play('open'); return () => play('close') }, [])
  useEffect(() => { const f = (e: KeyboardEvent) => e.key === 'Escape' && onCancel(); addEventListener('keydown', f); return () => removeEventListener('keydown', f) }, [onCancel])
  return (
    <div className="modal" onClick={onCancel}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <h2>{title}</h2>{children}
        <div className="row"><button className="btn" data-snd="none" autoFocus onClick={onOk}>{ok}</button><button className="btn ghost" data-snd="none" onClick={onCancel}>Отмена</button></div>
      </div>
    </div>
  )
}

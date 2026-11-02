import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import { onToast, type ToastMsg } from '../lib/toast'
import { play } from '../lib/sound'

export default function Toasts() {
  const [list, setList] = useState<ToastMsg[]>([])
  useEffect(() => onToast(t => { if (t.kind === 'err') play('error'); setList(l => [...l.slice(-2), t]); setTimeout(() => setList(l => l.filter(x => x.id !== t.id)), 3600) }), [])
  return <div className="toasts" role="status" aria-live="polite">{list.map(t => <div key={t.id} className={`toast ${t.kind}`}>{t.kind === 'ok' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}{t.text}</div>)}</div>
}

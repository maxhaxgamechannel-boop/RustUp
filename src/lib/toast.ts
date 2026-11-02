export interface ToastMsg { id: number; text: string; kind: 'ok' | 'err' }
type L = (t: ToastMsg) => void
const ls = new Set<L>()
let n = 0
export const onToast = (l: L) => { ls.add(l); return () => { ls.delete(l) } }
export const toast = (text: string, kind: ToastMsg['kind'] = 'ok') => ls.forEach(l => l({ id: ++n, text, kind }))

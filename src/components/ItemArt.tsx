// Векторная заглушка, если иконка Steam не загрузилась.
const P = {
  weapon: <><path d="M4 33h28l5-7h13l4 4h6v6h-9l-3 12h-9l2-12H4z" /><path d="M22 33v8h-6v-8" /></>,
  armor: <><path d="M32 7l19 6v16c0 13-8 21-19 27C21 50 13 42 13 29V13z" /><path d="M32 7v49M13 25h38" /></>,
  tool: <><path d="M18 56L41 14" /><path d="M38 11c9-3 16 2 18 9-7 3-14 0-18-9z" /></>,
  build: <><rect x="17" y="7" width="30" height="50" rx="2" /><path d="M17 32h30" /><circle cx="40" cy="45" r="2" /></>,
}
const kind = (cat: string) => (cat === 'weapon' ? 'weapon' : cat === 'clothing' || cat === 'mask' ? 'armor' : cat === 'deployable' || cat === 'decoration' ? 'build' : 'tool')
export default function ItemArt({ cat, size = 64 }: { cat: string; size?: number }) {
  return <svg className="iart" width={size} height={size} viewBox="0 0 64 64" fill="currentColor" fillOpacity=".14" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" aria-hidden>{P[kind(cat)]}</svg>
}

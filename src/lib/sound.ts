// Синтезированный звук (Web Audio): без файлов. Мягкие огибающие, фильтры, лёгкая реверберация,
// компрессор на выходе, ограничение числа голосов и частоты повторов — чтобы звуки не накладывались кашей и не били по ушам.
const KEY = 'rustup.sound'
export type Snd = 'click' | 'select' | 'tick' | 'start' | 'stop' | 'win' | 'lose' | 'coin' | 'open' | 'close' | 'error'

let on = (() => { try { return localStorage.getItem(KEY) !== 'off' } catch { return true } })()
let ctx: AudioContext | null = null
let out: GainNode, send: GainNode, noiseBuf: AudioBuffer
let active = 0
let last: Partial<Record<Snd | 'bed', number>> = {}

const GAP: Record<Snd | 'bed', number> = { click: 60, select: 70, tick: 40, start: 350, stop: 350, win: 600, lose: 600, coin: 150, open: 150, close: 150, error: 300, bed: 500 }
const PRIORITY: Record<Snd, number> = { tick: 0, click: 0, select: 1, open: 1, close: 1, error: 2, coin: 2, start: 2, stop: 3, win: 3, lose: 3 }
export const MAX_VOICES = 10   // важные звуки (stop/win/lose) проходят всегда
const MASTER = 0.55

export const soundEnabled = () => on
export function setSound(v: boolean) {
  on = v; try { localStorage.setItem(KEY, v ? 'on' : 'off') } catch { /* ignore */ }
  if (!v && ctx) { void ctx.close(); ctx = null; active = 0 }
}
/** Только для тестов. */
export function _reset() { ctx = null; active = 0; last = {} }
export const _activeVoices = () => active

function ensure(): boolean {
  if (ctx) return true
  try {
    const g = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
    const AC = g.AudioContext ?? g.webkitAudioContext
    if (!AC) return false
    ctx = new AC()
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -20; comp.knee.value = 24; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2
    const master = ctx.createGain(); master.gain.value = MASTER
    out = ctx.createGain(); out.gain.value = 1
    send = ctx.createGain(); send.gain.value = 1
    const rev = ctx.createConvolver(), len = Math.floor(ctx.sampleRate * 0.9), ir = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) }
    rev.buffer = ir
    const wet = ctx.createGain(); wet.gain.value = 0.35
    out.connect(master); send.connect(rev); rev.connect(wet); wet.connect(master); master.connect(comp); comp.connect(ctx.destination)
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1
    if (ctx.state === 'suspended') void ctx.resume()
    return true
  } catch { ctx = null; return false }
}
function track(src: AudioScheduledSourceNode) { active++; src.onended = () => { active = Math.max(0, active - 1) } }

interface Tone { t?: number; f: number | [number, number]; dur: number; type?: OscillatorType; vol?: number; atk?: number; lp?: number | [number, number]; wet?: number; det?: number }
function tone(v: Tone) {
  if (!ctx) return
  const o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime + (v.t ?? 0), [f0, f1] = Array.isArray(v.f) ? v.f : [v.f, v.f]
  o.type = v.type ?? 'sine'; o.frequency.setValueAtTime(f0, t0)
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + v.dur)
  if (v.det) o.detune.value = v.det
  const vol = v.vol ?? 0.2, atk = v.atk ?? 0.004
  g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + atk); g.gain.exponentialRampToValueAtTime(0.0001, t0 + v.dur)
  let node: AudioNode = o
  if (v.lp !== undefined) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; const [a, b] = Array.isArray(v.lp) ? v.lp : [v.lp, v.lp]; f.frequency.setValueAtTime(a, t0); if (b !== a) f.frequency.exponentialRampToValueAtTime(b, t0 + v.dur); o.connect(f); node = f }
  node.connect(g); g.connect(out)
  if (v.wet) { const s = ctx.createGain(); s.gain.value = v.wet; g.connect(s); s.connect(send) }
  o.start(t0); o.stop(t0 + v.dur + 0.05); track(o)
}
interface Noise { t?: number; dur: number; type: BiquadFilterType; f: number | [number, number]; q?: number; vol?: number; atk?: number; wet?: number }
function noise(v: Noise) {
  if (!ctx) return
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), t0 = ctx.currentTime + (v.t ?? 0), [a, b] = Array.isArray(v.f) ? v.f : [v.f, v.f]
  s.buffer = noiseBuf; s.loop = true
  f.type = v.type; f.Q.value = v.q ?? 0.8; f.frequency.setValueAtTime(a, t0); if (b !== a) f.frequency.exponentialRampToValueAtTime(b, t0 + v.dur)
  const vol = v.vol ?? 0.1, atk = v.atk ?? 0.003
  g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + atk); g.gain.exponentialRampToValueAtTime(0.0001, t0 + v.dur)
  s.connect(f); f.connect(g); g.connect(out)
  if (v.wet) { const w = ctx.createGain(); w.gain.value = v.wet; g.connect(w); w.connect(send) }
  s.start(t0); s.stop(t0 + v.dur + 0.05); track(s)
}

const S: Record<Snd, (p: number) => void> = {
  // чёткий «стеклянный» клик интерфейса
  click: () => { tone({ f: [2000, 1300], dur: 0.05, vol: 0.1, type: 'sine' }); noise({ dur: 0.02, type: 'highpass', f: 5000, vol: 0.05 }) },
  // выбор скина: мягкая двухнотная «капля»
  select: () => { tone({ f: 659, dur: 0.14, vol: 0.14, wet: 0.2 }); tone({ t: 0.045, f: 988, dur: 0.18, vol: 0.11, wet: 0.25 }); tone({ t: 0.045, f: 1976, dur: 0.1, vol: 0.03, type: 'triangle' }) },
  // тик рулетки: p — прогресс 0..1, к концу тон ниже и «тяжелее»
  tick: p => { noise({ dur: 0.014, type: 'highpass', f: 3200, vol: 0.14 }); tone({ f: [1500 - p * 600, 900 - p * 350], dur: 0.04, vol: 0.1 + p * 0.04, type: 'triangle' }) },
  start: () => { noise({ dur: 0.5, type: 'bandpass', f: [300, 2600], q: 1.1, vol: 0.16, atk: 0.12 }); tone({ f: [220, 880], dur: 0.45, vol: 0.07, type: 'triangle', atk: 0.1, lp: 3000 }); tone({ f: [95, 48], dur: 0.2, vol: 0.28 }) },
  stop: () => { tone({ f: [150, 55], dur: 0.24, vol: 0.32 }); noise({ dur: 0.08, type: 'lowpass', f: 900, vol: 0.12 }); tone({ f: 1760, dur: 0.4, vol: 0.06, wet: 0.35 }) },
  win: () => {
    ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => { const t = [0, 0.09, 0.18, 0.3][i]; tone({ t, f, dur: 0.55, vol: 0.13, wet: 0.4 }); tone({ t, f: f * 2, dur: 0.4, vol: 0.04, type: 'triangle', wet: 0.4 }) })
    ;[523.25, 659.25, 783.99].forEach(f => tone({ t: 0.3, f, dur: 1.0, vol: 0.05, atk: 0.06, lp: 2400, wet: 0.5 }))
    noise({ t: 0.25, dur: 0.6, type: 'highpass', f: 6500, vol: 0.035, atk: 0.1, wet: 0.3 })
  },
  lose: () => {
    ;[220, 174.61, 146.83].forEach((f, i) => tone({ t: i * 0.2, f, dur: 0.5, vol: 0.1, type: 'sawtooth', lp: [1400, 280], wet: 0.3, det: i ? -6 : 0 }))
    tone({ t: 0.38, f: [120, 42], dur: 0.6, vol: 0.3 }); noise({ t: 0.38, dur: 0.25, type: 'lowpass', f: 500, vol: 0.1 })
  },
  // покупка / продажа: тёплый «монетный» перезвон
  coin: () => { tone({ f: 1568, dur: 0.2, vol: 0.11, wet: 0.25 }); tone({ t: 0.07, f: 2093, dur: 0.34, vol: 0.1, wet: 0.3 }); tone({ t: 0.07, f: 3136, dur: 0.2, vol: 0.025, type: 'triangle' }); noise({ dur: 0.015, type: 'highpass', f: 6000, vol: 0.04 }) },
  open: () => { noise({ dur: 0.18, type: 'bandpass', f: [400, 1800], q: 1, vol: 0.08, atk: 0.04 }); tone({ f: [520, 780], dur: 0.14, vol: 0.09, wet: 0.2 }) },
  close: () => { noise({ dur: 0.16, type: 'bandpass', f: [1800, 420], q: 1, vol: 0.07, atk: 0.02 }); tone({ f: [780, 480], dur: 0.12, vol: 0.08, wet: 0.15 }) },
  error: () => { tone({ f: 233, dur: 0.09, vol: 0.14, type: 'triangle', lp: 1200 }); tone({ t: 0.1, f: 185, dur: 0.16, vol: 0.14, type: 'triangle', lp: 1000 }) },
}

export function play(k: Snd, arg = 0) {
  if (!on) return
  const now = performance.now()
  if (now - (last[k] ?? -1e9) < GAP[k]) return           // анти-спам по типу звука
  if (!ensure()) return
  if (active >= MAX_VOICES && PRIORITY[k] < 3) return     // не накладываем «кашу»
  last[k] = now
  S[k](arg)
}
/** Фоновый «свист» вращения рулетки на ms миллисекунд (нарастает и затихает). */
export function spinBed(ms: number) {
  if (!on) return
  const now = performance.now()
  if (now - (last.bed ?? -1e9) < GAP.bed || !ensure() || active >= MAX_VOICES) return
  last.bed = now
  const d = Math.max(0.4, ms / 1000), t0 = ctx!.currentTime, s = ctx!.createBufferSource(), f = ctx!.createBiquadFilter(), g = ctx!.createGain()
  s.buffer = noiseBuf; s.loop = true; f.type = 'bandpass'; f.Q.value = 1.4
  f.frequency.setValueAtTime(450, t0); f.frequency.exponentialRampToValueAtTime(1900, t0 + d * 0.35); f.frequency.exponentialRampToValueAtTime(380, t0 + d)
  g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.06, t0 + d * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d)
  s.connect(f); f.connect(g); g.connect(out); s.start(t0); s.stop(t0 + d + 0.05); track(s)
}

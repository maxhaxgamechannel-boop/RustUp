import assert from 'node:assert/strict'

let n = 0, failed = 0
const t = async (name: string, fn: () => void | Promise<void>) => { try { await fn(); n++; console.log('  ok  ', name) } catch (e) { failed++; console.log('  FAIL', name, '\n      ', (e as Error).message) } }

// --- минимальные заглушки Web Audio ---
const store: Record<string, string> = {}
const G = globalThis as Record<string, unknown>
G.localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v } }
let ctors = 0, closed = 0
const oscs: { onended: null | (() => void) }[] = [], srcs: { onended: null | (() => void) }[] = []
class P { value = 0; setValueAtTime() {} linearRampToValueAtTime() {} exponentialRampToValueAtTime() {} }
class Node { connect(x: unknown) { return x } }
class Osc extends Node { type = 'sine'; frequency = new P(); detune = new P(); onended: null | (() => void) = null; start() {} stop() {} }
class Gain extends Node { gain = new P() }
class Filt extends Node { type = 'lowpass'; frequency = new P(); Q = new P() }
class Src extends Node { buffer = null; loop = false; onended: null | (() => void) = null; start() {} stop() {} }
class Comp extends Node { threshold = new P(); knee = new P(); ratio = new P(); attack = new P(); release = new P() }
class AC {
  currentTime = 0; sampleRate = 8000; state = 'running'; destination = new Node()
  constructor() { ctors++ }
  createOscillator() { const o = new Osc(); oscs.push(o); return o }
  createGain() { return new Gain() } createBiquadFilter() { return new Filt() } createDynamicsCompressor() { return new Comp() }
  createBufferSource() { const s = new Src(); srcs.push(s); return s }
  createBuffer(_c: number, len: number) { return { getChannelData: () => new Float32Array(len) } }
  createConvolver() { return Object.assign(new Node(), { buffer: null }) }
  resume() {} close() { closed++; return Promise.resolve() }
}
G.AudioContext = AC
const voices = () => oscs.length + srcs.length

;(async () => {
  const snd = await import('../src/lib/sound')
  const KINDS = ['click', 'select', 'tick', 'start', 'stop', 'win', 'lose', 'coin', 'open', 'close', 'error'] as const

  console.log('Звуки')
  for (const k of KINDS) await t(`звук «${k}» синтезируется без ошибок`, () => { snd._reset(); const b = voices(); snd.play(k, 0.5); assert(voices() > b, 'нет источников') })
  await t('фоновая прокрутка рулетки (spinBed)', () => { snd._reset(); const b = voices(); snd.spinBed(4000); assert.equal(voices(), b + 1) })
  await t('анти-спам: повтор того же звука быстрее порога игнорируется', () => { snd._reset(); snd.play('click'); const b = voices(); snd.play('click'); snd.play('click'); assert.equal(voices(), b) })
  await t('нет наложения «каши»: при переполнении голосов тихие звуки отбрасываются, важные проходят', () => {
    snd._reset(); snd.play('win'); assert(snd._activeVoices() >= snd.MAX_VOICES)
    const b = voices(); snd.play('tick'); snd.play('select'); assert.equal(voices(), b, 'тихие звуки не должны играть')
    snd.play('lose'); assert(voices() > b, 'важный звук должен играть')
  })
  await t('счётчик голосов возвращается к нулю после окончания звуков', () => { for (const s of [...oscs, ...srcs]) s.onended?.(); assert.equal(snd._activeVoices(), 0) })
  await t('полное отключение: ни контекста, ни звуков; настройка сохраняется', () => {
    snd._reset(); snd.setSound(false); const c = ctors, v = voices()
    for (const k of KINDS) snd.play(k); snd.spinBed(1000)
    assert.equal(ctors, c); assert.equal(voices(), v); assert.equal(snd.soundEnabled(), false); assert.equal(store['rustup.sound'], 'off')
  })
  await t('повторное включение возвращает звук', () => { snd.setSound(true); snd._reset(); const v = voices(); snd.play('select'); assert(voices() > v); assert.equal(store['rustup.sound'], 'on') })
  await t('выключение закрывает аудиоконтекст', () => { snd.play('coin'); const c = closed; snd.setSound(false); assert.equal(closed, c + 1) })

  console.log(`\n${n} passed, ${failed} failed`); process.exit(failed ? 1 : 0)
})()

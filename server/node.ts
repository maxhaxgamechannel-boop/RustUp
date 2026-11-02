import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import type { ApiResult } from './core'

type Api = (url: URL) => Promise<ApiResult>
/** Connect-совместимый middleware для Vite (dev/preview) и для прод-сервера. */
export function nodeMiddleware(api: Api) {
  return async (req: IncomingMessage, res: ServerResponse, next?: () => void) => {
    if (!req.url?.startsWith('/api/')) return next?.()
    const send = (r: ApiResult) => { res.statusCode = r.status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', r.status === 200 ? 'public, max-age=60' : 'no-store'); for (const [k, v] of Object.entries(r.headers ?? {})) res.setHeader(k, v); res.end(JSON.stringify(r.body)) }
    if (req.method !== 'GET') return send({ status: 405, body: { error: { code: 'METHOD', message: 'Только GET' } } })
    try { send(await api(new URL(req.url, 'http://localhost'))) } catch { send({ status: 500, body: { error: { code: 'INTERNAL', message: 'Внутренняя ошибка сервера' } } }) }
  }
}
export function readEnvFile(path = '.env'): Record<string, string> {
  try { return Object.fromEntries(readFileSync(path, 'utf8').split(/\r?\n/).map(l => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter((m): m is RegExpMatchArray => !!m).map(m => [m[1], m[2].replace(/^["']|["']$/g, '')])) } catch { return {} }
}

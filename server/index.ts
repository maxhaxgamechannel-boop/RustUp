// Прод-сервер: раздаёт dist/ и /api/*. Запуск: npm run build && npm start
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { createApi } from './core'
import { nodeMiddleware, readEnvFile } from './node'

const apiKey = process.env.RUSTWIKI_API_KEY ?? readEnvFile().RUSTWIKI_API_KEY
const api = nodeMiddleware(createApi({ apiKey }))
const dist = join(process.cwd(), 'dist')
const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon' }

createServer((req, res) => {
  api(req, res, async () => {
    const p = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '')
    for (const f of [join(dist, p), join(dist, 'index.html')]) {
      try { const b = await readFile(f); res.setHeader('Content-Type', MIME[extname(f)] ?? 'application/octet-stream'); return void res.end(b) } catch { /* next */ }
    }
    res.statusCode = 404; res.end('Not found')
  })
}).listen(Number(process.env.PORT ?? 8787), () => console.log(`RustUP: http://localhost:${process.env.PORT ?? 8787}${apiKey ? '' : '  (RUSTWIKI_API_KEY не задан — каталог покажет сообщение об ошибке)'}`))

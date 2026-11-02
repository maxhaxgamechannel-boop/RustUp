import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createApi } from './server/core'
import { nodeMiddleware } from './server/node'

export default defineConfig(({ mode }) => {
  // Ключ без префикса VITE_ — Vite не включает его в клиентский бандл.
  const env = loadEnv(mode, process.cwd(), '')
  const mw = nodeMiddleware(createApi({ apiKey: env.RUSTWIKI_API_KEY }))
  const api: Plugin = { name: 'rustup-api', configureServer: s => void s.middlewares.use(mw), configurePreviewServer: s => void s.middlewares.use(mw) }
  return { plugins: [react(), api] }
})

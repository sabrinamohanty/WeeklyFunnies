import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * GET /api/weather?city=Austin, Texas
 * Proxies Google's weather card through SearchApi (searchapi.io) or SerpApi (serpapi.com)
 * so the API key stays on the server. Responses are cached for 30 minutes per city.
 */
function weatherApi(env: Record<string, string>): Plugin {
  const cache = new Map<string, { at: number; body: string }>()
  const TTL = 30 * 60 * 1000

  const num = (v: unknown) => {
    const n = parseFloat(String(v ?? '').replace(/[^\d.-]/g, ''))
    return Number.isFinite(n) ? Math.round(n) : null
  }

  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    if (!req.url?.startsWith('/api/weather')) return next()
    const send = (status: number, body: unknown) => {
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json')
      res.end(typeof body === 'string' ? body : JSON.stringify(body))
    }

    const city = new URL(req.url, 'http://localhost').searchParams.get('city')?.trim().slice(0, 80)
    if (!city) return send(400, { error: 'missing_city' })

    const searchApiKey = env.SEARCHAPI_KEY
    const serpApiKey = env.SERPAPI_KEY
    if (!searchApiKey && !serpApiKey) return send(503, { error: 'no_key' })

    const hit = cache.get(city.toLowerCase())
    if (hit && Date.now() - hit.at < TTL) return send(200, hit.body)

    const url = searchApiKey ? new URL('https://www.searchapi.io/api/v1/search') : new URL('https://serpapi.com/search.json')
    url.search = new URLSearchParams({
      engine: 'google', q: `weather ${city}`, hl: 'en', gl: 'us', api_key: (searchApiKey || serpApiKey)!,
    }).toString()

    try {
      const r = await fetch(url)
      if (!r.ok) return send(502, { error: 'upstream', status: r.status })
      const data = await r.json()
      // SearchApi puts the card at `weather_result`; SerpApi uses `answer_box` with type "weather_result".
      const box = data.weather_result ?? (data.answer_box?.type === 'weather_result' ? data.answer_box : null)
      if (!box || !Array.isArray(box.forecast)) return send(502, { error: 'no_forecast' })
      const temp = box.temperature
      const current = typeof temp === 'object' && temp ? temp.fahrenheit ?? temp.celsius : temp

      const body = JSON.stringify({
        location: box.location ?? city,
        unit: /^c/i.test(String(box.unit ?? '')) ? 'C' : 'F',
        current: { temp: num(current), sky: String(box.weather ?? '') },
        days: box.forecast.map((d: Record<string, any>) => ({
          day: String(d.day ?? ''),
          high: num(d.temperature?.high ?? d.high),
          low: num(d.temperature?.low ?? d.low),
          sky: String(d.weather ?? ''),
        })),
      })
      cache.set(city.toLowerCase(), { at: Date.now(), body })
      send(200, body)
    } catch {
      send(502, { error: 'network' })
    }
  }

  return {
    name: 'weather-api',
    configureServer: server => { server.middlewares.use(handler) },
    configurePreviewServer: server => { server.middlewares.use(handler) },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), weatherApi(loadEnv(mode, process.cwd(), ''))],
  // Avatar, story and comic generation run in server/ (npm run server); the key never reaches the browser.
  server: {
    proxy: {
      '/api/avatar': 'http://localhost:8787',
      '/api/story': 'http://localhost:8787',
      '/api/panel': 'http://localhost:8787',
      '/generated': 'http://localhost:8787',
    },
  },
}))

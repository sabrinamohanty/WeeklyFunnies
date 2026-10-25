import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { ZodError, type ZodType } from 'zod'
import { config } from './config.ts'
import { completeText, generateImage, HttpError, type ImageBytes } from './meta.ts'
import { buildAvatarPrompt, buildPanelPrompt, buildStoryUserPrompt, STORY_SYSTEM_PROMPT } from './prompts.ts'
import { avatarRequest, panelRequest, storyOutput, storyRequest, type StoryOutput } from './schemas.ts'
import { findImage, hash, loadImage, saveImage } from './storage.ts'

// ---------- small helpers ----------

/** Names and looks end up inside prompts, so reduce them to plain single-line text. */
const plain = (s: string) => s.replace(/[\u0000-\u001f<>{}[\]`]/g, ' ').replace(/\s+/g, ' ').trim()

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** One retry with a short backoff, as the handoff asks for image calls. */
async function retry<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn() } catch (e) {
    if (e instanceof HttpError && e.status < 500) throw e
    await sleep(1500)
    return fn()
  }
}

/** At most N model calls at once, so a burst of panels can't flood the provider. */
function limiter(max: number) {
  let active = 0
  const waiting: (() => void)[] = []
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>(r => waiting.push(r))
    active++
    try { return await fn() } finally { active--; waiting.shift()?.() }
  }
}
const slot = limiter(4)

/** Per-client request budget (in memory; fine for one process). Real per-user caps come with login. */
const hits = new Map<string, number[]>()
function rateLimit(ip: string, perMinute: number) {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter(t => now - t < 60_000)
  if (recent.length >= perMinute) throw new HttpError(429, 'rate_limited', 'Too many requests. Try again in a minute.')
  hits.set(ip, [...recent, now])
}

async function readJson(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > maxBytes) throw new HttpError(413, 'payload_too_large', 'Request body is too large')
    chunks.push(c as Buffer)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new HttpError(400, 'bad_request', 'Body must be JSON') }
}

function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body)
  if (!r.success) throw new HttpError(400, 'bad_request', r.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '))
  return r.data
}

// ---------- routes ----------

async function avatar(body: unknown) {
  const req = parseBody(avatarRequest, body)
  const look = plain(req.look)
  const photo: ImageBytes | undefined = req.photo
    ? { mimeType: /^data:([^;]+)/.exec(req.photo)![1]!, bytes: Buffer.from(req.photo.split(',')[1]!, 'base64') }
    : undefined

  // The photo is never stored; it only shapes this one drawing.
  const key = hash('avatar', req.style, look, photo ? hash(photo.bytes.toString('base64')) : '')
  if (!req.fresh) {
    const hit = await findImage(key)
    if (hit) return { avatarUrl: hit }
  }
  const prompt = buildAvatarPrompt(look, req.style, !!photo)
  const image = await slot(() => retry(() => generateImage({ prompt, references: photo ? [photo] : [], size: config.avatarSize })))
  return { avatarUrl: await saveImage(req.fresh ? hash(key, String(Date.now())) : key, image) }
}

function parseStory(raw: string): unknown {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = text.indexOf('{'), end = text.lastIndexOf('}')
  return JSON.parse(start >= 0 ? text.slice(start, end + 1) : text)
}

async function story(body: unknown) {
  const req = parseBody(storyRequest, body)
  const people = req.people.map(p => ({ id: p.id, name: plain(p.name).split(' ')[0]!.replace(/[^\p{L}'-]/gu, '') || 'Reporter' }))
  const ids = new Set(people.map(p => p.id))
  for (const h of req.highlights) if (!ids.has(h.personId)) throw new HttpError(400, 'bad_request', `Unknown personId ${h.personId}`)

  const user = buildStoryUserPrompt(req.weekLabel, people, req.highlights.map(h => ({ ...h, text: plain(h.text) })))
  const hasComic = req.highlights.some(h => h.inComic && !h.serious)

  const attempt = async (): Promise<StoryOutput> => {
    const out = storyOutput.parse(parseStory(await slot(() => completeText(STORY_SYSTEM_PROMPT, user))))
    if (!people.some(p => p.name === out.article.byline)) throw new Error('byline is not a provided name')
    if (out.comic?.panels.some(p => p.characters.some(c => !ids.has(c)))) throw new Error('unknown character id')
    return hasComic ? out : { ...out, comic: null }
  }
  for (let i = 0; ; i++) {
    try { return await attempt() } catch (e) {
      if (e instanceof HttpError) throw e
      if (i === 1) throw new HttpError(502, 'bad_story', 'The writer returned something we could not use. Try again.')
    }
  }
}

async function panel(body: unknown) {
  const req = parseBody(panelRequest, body)
  const byId = new Map(req.people.map(p => [p.id, p]))
  const cast = req.panel.characters.map(id => {
    const p = byId.get(id)
    if (!p) throw new HttpError(400, 'bad_request', `Unknown character ${id}`)
    return p
  })
  const scene = plain(req.panel.scene)
  const castText = cast.map(p => ({ name: plain(p.name).split(' ')[0]!, look: plain(p.look ?? 'a friendly person') }))
  const refs = (await Promise.all(cast.map(p => (p.avatarUrl ? loadImage(p.avatarUrl) : null)))).filter((r): r is ImageBytes => !!r)

  const key = hash('panel', req.style, scene, JSON.stringify(castText), cast.map(p => p.avatarUrl ?? '').join(','))
  if (!req.fresh) {
    const hit = await findImage(key)
    if (hit) return { imageUrl: hit }
  }
  const prompt = buildPanelPrompt(scene, castText, req.style, refs.length > 0)
  const image = await slot(() => retry(() => generateImage({ prompt, references: refs, size: config.panelSize })))
  return { imageUrl: await saveImage(req.fresh ? hash(key, String(Date.now())) : key, image) }
}

const routes: Record<string, { handler: (b: unknown) => Promise<unknown>; maxBytes: number; perMinute: number }> = {
  '/api/avatar': { handler: avatar, maxBytes: 8_000_000, perMinute: 8 },
  '/api/story': { handler: story, maxBytes: 64_000, perMinute: 10 },
  '/api/panel': { handler: panel, maxBytes: 64_000, perMinute: 30 },
}

// ---------- server ----------

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

createServer(async (req, res) => {
  const started = Date.now()
  const origin = req.headers.origin
  if (origin && config.corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  }
  if (req.method === 'OPTIONS') { res.statusCode = 204; return void res.end() }

  const path = new URL(req.url ?? '/', 'http://x').pathname
  try {
    if (req.method === 'GET' && path === '/api/health') return send(res, 200, { ok: true, hasKey: !!config.metaApiKey })

    const img = /^\/generated\/([a-f0-9]{40})\.(png|jpg|webp)$/.exec(path)
    if (req.method === 'GET' && img) {
      const loaded = await loadImage(path)
      if (!loaded) return send(res, 404, { error: 'not_found' })
      res.setHeader('Content-Type', loaded.mimeType)
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      return void res.end(loaded.bytes)
    }

    const route = routes[path]
    if (!route) return send(res, 404, { error: 'not_found' })
    if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' })

    rateLimit(`${req.socket.remoteAddress}${path}`, route.perMinute)
    const result = await route.handler(await readJson(req, route.maxBytes))
    send(res, 200, result)
    // Request id, route and duration only. Never prompts, highlights or photos.
    console.log(`${path} 200 ${Date.now() - started}ms`)
  } catch (e) {
    const err = e instanceof HttpError ? e : e instanceof ZodError ? new HttpError(400, 'bad_request', 'Invalid request')
      : new HttpError(502, 'provider_error', 'The AI service could not complete that request')
    console.error(`${path} ${err.status} ${err.code} ${Date.now() - started}ms${err.status >= 500 ? ` :: ${(e as Error).message}` : ''}`)
    send(res, err.status, { error: err.message })
  }
}).listen(config.port, () => {
  console.log(`Generation server on http://localhost:${config.port}  (key ${config.metaApiKey ? 'set' : 'MISSING'}, ${config.imageModel} / ${config.textModel})`)
})

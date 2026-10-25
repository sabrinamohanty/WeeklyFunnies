import OpenAI from 'openai'
import { config } from './config.ts'

export interface ImageBytes { bytes: Buffer; mimeType: string }

let client: OpenAI | undefined
function api(): OpenAI {
  if (!config.metaApiKey) throw new HttpError(503, 'no_key', 'META_API_KEY is not set on the server')
  client ??= new OpenAI({ apiKey: config.metaApiKey, baseURL: config.metaBaseUrl, timeout: config.timeoutMs, maxRetries: 1 })
  return client
}

export class HttpError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** The real format, read from the file's first bytes. Providers don't always label images correctly. */
export function sniffMime(b: Buffer, fallback = 'image/png'): string {
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg'
  if (b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') return 'image/png'
  return fallback
}

const ext = (mime: string) => (mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png')

/** Text model: returns the raw reply string. Prompts are built by the caller. */
export async function completeText(system: string, user: string): Promise<string> {
  const r = await api().chat.completions.create({
    model: config.textModel,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  })
  return r.choices[0]?.message?.content ?? ''
}

/**
 * Image model. No references: plain generation. With references (a selfie for avatars, the characters'
 * avatars for panels): the edit endpoint. Reads `b64_json`, or fetches `url` server-side.
 */
export async function generateImage(req: { prompt: string; references: ImageBytes[]; size?: string }): Promise<ImageBytes> {
  const c = api()
  const size = req.size as never
  const res = req.references.length ? await editImage(req) : await c.images.generate({ model: config.imageModel, prompt: req.prompt, ...(size ? { size } : {}) })

  const first = res.data?.[0]
  if (first?.b64_json) { const bytes = Buffer.from(first.b64_json, 'base64'); return { bytes, mimeType: sniffMime(bytes) } }
  if (first?.url) {
    const r = await fetch(first.url, { signal: AbortSignal.timeout(config.timeoutMs) })
    if (!r.ok) throw new HttpError(502, 'upstream', `image download failed (${r.status})`)
    const bytes = Buffer.from(await r.arrayBuffer())
    return { bytes, mimeType: sniffMime(bytes, r.headers.get('content-type')?.split(';')[0] ?? 'image/png') }
  }
  throw new HttpError(502, 'no_image', 'The image model returned no image')
}

/**
 * Edit endpoint with reference images. Meta wants the files named image[0], image[1], ... in order,
 * which the OpenAI SDK doesn't send, so this request is made directly.
 */
async function editImage(req: { prompt: string; references: ImageBytes[]; size?: string }): Promise<{ data?: { b64_json?: string; url?: string }[] }> {
  const form = new FormData()
  form.append('model', config.imageModel)
  form.append('prompt', req.prompt)
  if (req.size) form.append('size', req.size)
  req.references.forEach((r, i) => form.append(`image[${i}]`, new Blob([new Uint8Array(r.bytes)], { type: r.mimeType }), `ref-${i}.${ext(r.mimeType)}`))
  const r = await fetch(`${config.metaBaseUrl.replace(/\/$/, '')}/images/edits`, {
    method: 'POST', headers: { Authorization: `Bearer ${config.metaApiKey}` }, body: form, signal: AbortSignal.timeout(config.timeoutMs),
  })
  if (!r.ok) throw new HttpError(r.status >= 500 ? 502 : 400, 'upstream', `image edit failed (${r.status}): ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

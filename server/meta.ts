import OpenAI, { toFile } from 'openai'
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
  const res = req.references.length
    ? await c.images.edit({
        model: config.imageModel,
        prompt: req.prompt,
        image: await Promise.all(req.references.map((r, i) => toFile(r.bytes, `ref-${i}.${ext(r.mimeType)}`, { type: r.mimeType }))),
        ...(size ? { size } : {}),
      })
    : await c.images.generate({ model: config.imageModel, prompt: req.prompt, ...(size ? { size } : {}) })

  const first = res.data?.[0]
  if (first?.b64_json) return { bytes: Buffer.from(first.b64_json, 'base64'), mimeType: 'image/png' }
  if (first?.url) {
    const r = await fetch(first.url, { signal: AbortSignal.timeout(config.timeoutMs) })
    if (!r.ok) throw new HttpError(502, 'upstream', `image download failed (${r.status})`)
    return { bytes: Buffer.from(await r.arrayBuffer()), mimeType: r.headers.get('content-type')?.split(';')[0] ?? 'image/png' }
  }
  throw new HttpError(502, 'no_image', 'The image model returned no image')
}

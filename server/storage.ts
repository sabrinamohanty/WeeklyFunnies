import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { config } from './config.ts'
import type { ImageBytes } from './meta.ts'

const MIME_BY_EXT: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }

export const hash = (...parts: string[]) => createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 40)

/** Images are saved under generated/<hash>.<ext> and served at /generated/<hash>.<ext>. */
export async function saveImage(key: string, img: ImageBytes): Promise<string> {
  await mkdir(config.imageDir, { recursive: true })
  const name = `${key}.${img.mimeType === 'image/jpeg' ? 'jpg' : img.mimeType === 'image/webp' ? 'webp' : 'png'}`
  await writeFile(new URL(name, config.imageDir), img.bytes)
  return `/generated/${name}`
}

export async function findImage(key: string): Promise<string | null> {
  for (const e of Object.keys(MIME_BY_EXT)) {
    try { await stat(new URL(`${key}.${e}`, config.imageDir)); return `/generated/${key}.${e}` } catch { /* next */ }
  }
  return null
}

/** Reads one of our own saved images from its public path. Anything else is refused. */
export async function loadImage(publicPath: string): Promise<ImageBytes | null> {
  const m = /^\/generated\/([a-f0-9]{40})\.(png|jpg|webp)$/.exec(publicPath)
  if (!m) return null
  try { return { bytes: await readFile(new URL(`${m[1]}.${m[2]}`, config.imageDir)), mimeType: MIME_BY_EXT[m[2]!]! } } catch { return null }
}

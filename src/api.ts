// Client for the generation server (server/). The browser never talks to an AI model or holds a key.
// In dev, Vite proxies these paths to the server. In the iOS app, set VITE_API_URL to wherever it's hosted.
const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

export type ApiStyle = 'classic' | 'manga' | 'sketch' | 'superhero'

/** The app calls its superhero style "hero". */
export const apiStyle = (s: string): ApiStyle => (s === 'hero' ? 'superhero' : (s as ApiStyle))

/** Generated images come back as server paths; this makes them loadable from the browser or the app. */
export const imageSrc = (path: string) => (path.startsWith('/generated/') ? BASE + path : path)

async function post<T>(path: string, body: unknown, timeoutMs = 120_000): Promise<T> {
  const r = await fetch(BASE + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  })
  // With no server, the app's own web server can answer with its HTML page and a 200; that isn't a result.
  const data = await r.json().catch(() => null)
  if (!r.ok || data == null || typeof data !== 'object') throw new Error((data as { error?: string } | null)?.error ?? `Request failed (${r.status})`)
  return data as T
}

/** Shrinks a selfie to a small JPEG data URL so uploads stay fast and under the server limit. */
export async function photoToDataUrl(file: Blob, max = 768): Promise<string> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.85)
}

export interface ApiPerson { id: string; name: string; look?: string; avatarUrl?: string }

export const generateAvatar = (b: { style: ApiStyle; look: string; photo?: string; fresh?: boolean }) =>
  post<{ avatarUrl: string }>('/api/avatar', b)

export interface ApiStory {
  article: { headline: string; byline: string; body: string }
  comic: { title: string; panels: { scene: string; caption: string | null; dialogue: { speaker: string; text: string; side: 'left' | 'right' }[]; characters: string[] }[] } | null
}

export const generateStory = (b: { weekLabel: string; people: ApiPerson[]; highlights: { personId: string; text: string; serious: boolean; inComic: boolean }[] }) =>
  post<ApiStory>('/api/story', b)

export const generatePanel = (b: { style: ApiStyle; panel: { scene: string; characters: string[] }; people: ApiPerson[]; fresh?: boolean }) =>
  post<{ imageUrl: string }>('/api/panel', b)

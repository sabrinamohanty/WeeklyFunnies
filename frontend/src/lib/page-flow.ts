import { isUuid, PAGE_LIMITS, type AvatarTraits, type PageStatus, type ReactionKind } from './types'

/** A highlight the compose screen can still be editing. `file` is a photo not uploaded yet. */
export interface FlowHighlight {
  id: string
  text: string
  photos: { id?: string; url: string; file?: File }[]
  serious: boolean
  inComic: boolean
}

export const MAX_PHOTO_BYTES = 12 * 1024 * 1024

const HAIR_COLORS = ['dark_brown', 'brown', 'blonde', 'red', 'brown'] as const
const TOP_COLORS = ['orange', 'blue', 'green', 'purple', 'pink'] as const

export interface HighlightWriter {
  deleteHighlight: (id: string) => Promise<unknown>
  addHighlight: (
    pageId: string,
    body: { text: string; serious?: boolean; inComic?: boolean },
  ) => Promise<{ highlight: { id: string } }>
  updateHighlight: (
    id: string,
    body: { text?: string; serious?: boolean; inComic?: boolean },
  ) => Promise<unknown>
  addPhoto: (highlightId: string, file: File) => Promise<{ photo: { id: string; url: string } }>
}

/** Server rows stay. Unsaved local rows (not yet given an id) are appended, up to the cap. */
export function appendUnsavedHighlights(server: FlowHighlight[], local: FlowHighlight[]): FlowHighlight[] {
  const saved = server.filter(h => isUuid(h.id))
  const ids = new Set(saved.map(h => h.id))
  const extras = local.filter(h => h.text.trim() && !ids.has(h.id) && !isUuid(h.id))
  const merged = [...saved, ...extras].slice(0, PAGE_LIMITS.highlights)
  return merged
}

/**
 * The list on screen wins over the last server snapshot: edits, new rows, and deletions.
 * A lone empty card does not wipe highlights that are already saved.
 */
export function reconcileHighlights(server: FlowHighlight[], ui: FlowHighlight[]): FlowHighlight[] {
  const rows = ui.map(h => ({ ...h, inComic: h.serious ? false : h.inComic }))
  const content = rows.filter(h => h.text.trim() || isUuid(h.id) || h.photos.length > 0)
  if (content.length === 0) return server.filter(h => isUuid(h.id)).slice(0, PAGE_LIMITS.highlights)
  return content.slice(0, PAGE_LIMITS.highlights)
}

export function classifyHighlightPhotos(existing: number, files: File[]): { accepted: File[]; notices: string[] } {
  const notices: string[] = []
  const room = PAGE_LIMITS.photosPerHighlight - existing
  if (room <= 0) {
    return { accepted: [], notices: [`This highlight already has ${PAGE_LIMITS.photosPerHighlight} photos.`] }
  }
  const accepted: File[] = []
  let skippedType = 0
  let skippedSize = 0
  let skippedRoom = 0
  for (const file of files) {
    const type = file.type.toLowerCase()
    if (type !== 'image/jpeg' && type !== 'image/png' && type !== 'image/jpg') {
      skippedType++
      continue
    }
    if (file.size > MAX_PHOTO_BYTES) {
      skippedSize++
      continue
    }
    if (accepted.length >= room) {
      skippedRoom++
      continue
    }
    accepted.push(file)
  }
  if (skippedType) notices.push('Use a JPEG or PNG photo.')
  if (skippedSize) notices.push('That photo is too large. Use a JPEG or PNG under 12 MB.')
  if (skippedRoom) notices.push(`Only ${PAGE_LIMITS.photosPerHighlight} photos fit on a highlight.`)
  return { accepted, notices }
}

/** Blank text is dropped. A serious highlight is never sent as part of the comic. */
export async function syncHighlights(
  pageId: string,
  local: FlowHighlight[],
  server: { id: string; text: string; serious: boolean; inComic: boolean }[],
  writer: HighlightWriter,
  onPhotoError?: (err: unknown) => void,
): Promise<FlowHighlight[]> {
  const filled = local.filter(h => h.text.trim())
  const keep = new Set(filled.filter(h => isUuid(h.id)).map(h => h.id))
  await Promise.all(server.filter(h => !keep.has(h.id)).map(h => writer.deleteHighlight(h.id)))

  const next: FlowHighlight[] = []
  for (const h of filled) {
    const text = h.text.trim()
    const serious = h.serious
    const inComic = serious ? false : h.inComic
    let id = h.id
    const orig = server.find(x => x.id === id)
    if (!isUuid(id)) {
      const { highlight } = await writer.addHighlight(pageId, { text, serious, inComic })
      id = highlight.id
    } else if (!orig || orig.text !== text || orig.serious !== serious || orig.inComic !== inComic) {
      await writer.updateHighlight(id, { text, serious, inComic })
    }
    const photos: FlowHighlight['photos'] = []
    for (const p of h.photos) {
      if (p.id) {
        photos.push({ id: p.id, url: p.url })
        continue
      }
      if (!p.file) continue
      try {
        const { photo } = await writer.addPhoto(id, p.file)
        if (p.url.startsWith('blob:') && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(p.url)
        photos.push({ id: photo.id, url: photo.url })
      } catch (err) {
        if (!onPhotoError) throw err
        onPhotoError(err)
      }
    }
    next.push({ id, text, photos, serious, inComic })
  }
  return next
}

/** First draw is not a redraw. Anything already generated spends a regeneration. */
export function shouldRegenerate(status: PageStatus): boolean {
  return status !== 'writing'
}

/** One failure does not cancel the other panels. Duplicate or out-of-range indexes are drawn once. */
export async function drawComicPanels(
  panels: { index: number }[] | null | undefined,
  draw: (index: number) => Promise<unknown>,
): Promise<{ failed: number[] }> {
  if (!panels?.length) return { failed: [] }
  const indexes = [...new Set(panels.map(p => p.index))].filter(
    index => Number.isInteger(index) && index >= 0 && index < PAGE_LIMITS.panels,
  )
  const results = await Promise.allSettled(indexes.map(index => draw(index)))
  return {
    failed: results.flatMap((result, i) => (result.status === 'rejected' ? [indexes[i]!] : [])),
  }
}

/** Skip a save when the proof sheet still matches the last page we stored. */
export function storyEdit(
  saved: { headline: string; body: string },
  next: { id: string; headline: string; article: string },
): { id: string; headline?: string; body?: string } | null {
  const headline = next.headline === saved.headline ? undefined : next.headline
  const body = next.article === saved.body ? undefined : next.article
  if (headline === undefined && body === undefined) return null
  return {
    id: next.id,
    ...(headline !== undefined ? { headline } : {}),
    ...(body !== undefined ? { body } : {}),
  }
}

export function moveItem<T>(items: T[], from: number, to: number): T[] | null {
  if (!Number.isInteger(from) || !Number.isInteger(to)) return null
  if (from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return null
  const next = items.slice()
  const [item] = next.splice(from, 1)
  if (item === undefined) return null
  next.splice(to, 0, item)
  return next
}

export function toggledReaction(current: ReactionKind | null, clicked: ReactionKind): ReactionKind | null {
  return current === clicked ? null : clicked
}

export function draftStoriesForPaper<T>(
  published: boolean,
  activePaperId: string | undefined,
  pagePapers: { paperId: string }[] | undefined,
  stories: T[] | null | undefined,
): T[] {
  if (published || !activePaperId || !stories?.length) return []
  if (!pagePapers?.some(p => p.paperId === activePaperId)) return []
  return stories
}

export type FrontEmpty = 'join' | 'published-empty' | 'draft-empty' | null

export function frontEmptyState(input: {
  paperCount: number
  published: boolean
  publishedPageCount: number
  ownStoryCount: number
}): FrontEmpty {
  if (input.paperCount === 0) return 'join'
  if (input.published && input.publishedPageCount === 0) return 'published-empty'
  if (!input.published && input.ownStoryCount === 0) return 'draft-empty'
  return null
}

export function showOwnDraftComic(published: boolean, panelCount: number, hasComic: boolean): boolean {
  return !published && panelCount > 0 && hasComic
}

export interface LightboxPanel {
  caption: string | null
  photos: string[]
  imageUrl: string | null
}

export function lightboxItems(panels: LightboxPanel[], startPanel: number): {
  items: { label: string; caption?: string; image?: string; panelIndex: number }[]
  start: number
} {
  const items: { label: string; caption?: string; image?: string; panelIndex: number }[] = []
  let start = 0
  let matched = false
  panels.forEach((panel, k) => {
    if (k === startPanel) {
      start = items.length
      matched = true
    }
    const caption = panel.caption ?? undefined
    if (panel.photos.length) {
      panel.photos.forEach((url, i) => {
        items.push({ label: `Panel ${k + 1} · photo ${i + 1}`, caption, image: url, panelIndex: k })
      })
    } else {
      items.push({ label: `Panel ${k + 1}`, caption, image: panel.imageUrl ?? undefined, panelIndex: k })
    }
  })
  return { items, start: matched ? start : 0 }
}

export function avatarTraits(chips: { hair: number; glasses: boolean; outfit: number }): AvatarTraits {
  return {
    hairStyle: 'short',
    hairColor: HAIR_COLORS[chips.hair] ?? 'dark_brown',
    skinTone: 'medium',
    glasses: chips.glasses ? 'round' : 'none',
    top: 'tshirt',
    topColor: TOP_COLORS[chips.outfit] ?? 'orange',
  }
}

export function avatarNeedsRedraw(
  current: { style: string; hair: number; glasses: boolean; outfit: number },
  drawn: { style: string; hair: number; glasses: boolean; outfit: number },
  drawnUrl: string | null,
): boolean {
  if (!drawnUrl) return true
  return current.style !== drawn.style || current.hair !== drawn.hair || current.glasses !== drawn.glasses || current.outfit !== drawn.outfit
}

export function avatarPhotoProblem(consent: boolean, file: File): string | null {
  const type = file.type.toLowerCase()
  if (!consent) return 'Check the box to use this photo for your avatar.'
  if (type !== 'image/jpeg' && type !== 'image/png' && type !== 'image/jpg') return 'Use a JPEG or PNG photo.'
  if (file.size > MAX_PHOTO_BYTES) return 'That photo is too large. Use a JPEG or PNG under 12 MB.'
  return null
}

export function parseLocalDraft(raw: string | null): { highlights: FlowHighlight[]; saved: number[] } {
  if (!raw) return { highlights: [], saved: [] }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { highlights: [], saved: [] }
    const record = parsed as { highlights?: unknown; saved?: unknown }
    const highlights = Array.isArray(record.highlights) ? record.highlights.flatMap(normalizeStoredHighlight) : []
    const saved = Array.isArray(record.saved)
      ? record.saved.filter((n): n is number => typeof n === 'number' && Number.isInteger(n))
      : []
    return { highlights, saved }
  } catch {
    return { highlights: [], saved: [] }
  }
}

function normalizeStoredHighlight(value: unknown): FlowHighlight[] {
  if (!value || typeof value !== 'object') return []
  const row = value as { id?: unknown; text?: unknown; serious?: unknown; inComic?: unknown; photos?: unknown }
  if (typeof row.id !== 'string' || typeof row.text !== 'string' || !row.text.trim()) return []
  const photos = Array.isArray(row.photos) ? row.photos.flatMap(normalizeStoredPhoto) : []
  const serious = row.serious === true
  return [{
    id: row.id,
    text: row.text,
    photos,
    serious,
    inComic: serious ? false : row.inComic !== false,
  }]
}

function normalizeStoredPhoto(value: unknown): { id?: string; url: string }[] {
  if (typeof value === 'string') return value.startsWith('blob:') || !value ? [] : [{ url: value }]
  if (!value || typeof value !== 'object') return []
  const photo = value as { id?: unknown; url?: unknown }
  if (typeof photo.url !== 'string' || !photo.url || photo.url.startsWith('blob:')) return []
  return [{ id: typeof photo.id === 'string' ? photo.id : undefined, url: photo.url }]
}

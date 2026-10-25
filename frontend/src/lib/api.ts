import { accessToken } from './auth'
import {
  ApiError,
  type ApiHighlight,
  type ApiPage,
  type ApiPanel,
  type ApiPaper,
  type ApiStory,
  type AvatarTraits,
  type CityCandidate,
  type CreatedInvite,
  type EditionBundle,
  type EditionSummary,
  type PaperDetail,
  type Photo,
  type Profile,
  type ReactionCounts,
  type ReactionKind,
  type StyleKey,
  type WeatherReport,
} from './types'

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:3000'

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken()
  const headers = new Headers(init.headers)
  const form = typeof FormData !== 'undefined' && init.body instanceof FormData
  if (init.body && !form && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers })
  } catch {
    throw new ApiError(0, { error: 'Could not reach the API. Is it running on port 3000?', code: 'network' })
  }

  const text = await res.text()
  let body: Record<string, unknown> = {}
  if (text) {
    try {
      const parsed: unknown = JSON.parse(text)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new ApiError(res.status, { error: 'The API sent a response the app could not read.', code: 'internal' })
      }
      body = parsed as Record<string, unknown>
    } catch (err) {
      if (err instanceof ApiError) throw err
      throw new ApiError(res.status || 502, {
        error: res.ok ? 'The API sent a response the app could not read.' : 'Something went wrong.',
        code: 'internal',
      })
    }
  }
  if (!res.ok) {
    throw new ApiError(res.status, {
      error: typeof body.error === 'string' ? body.error : 'Something went wrong.',
      code: typeof body.code === 'string' ? body.code : 'internal',
      requestId: typeof body.requestId === 'string' ? body.requestId : undefined,
      details: Array.isArray(body.details) ? (body.details as ApiError['details']) : undefined,
      retryAfterSeconds: typeof body.retryAfterSeconds === 'number' ? body.retryAfterSeconds : undefined,
    })
  }
  return body as T
}

export const api = {
  health: () => request<{ status: string }>('/api/health'),
  me: () => request<{ profile: Profile }>('/api/me'),
  updateMe: (body: { name?: string; cityId?: number; birthday?: string; style?: StyleKey }) =>
    request<{ profile: Profile }>('/api/me', { method: 'PATCH', body: JSON.stringify(body) }),
  geocode: (q: string) =>
    request<{ results: CityCandidate[] }>(`/api/geocode?q=${encodeURIComponent(q)}`),
  logout: () => request<{ signedOut: true; purgeAfter: string }>('/api/session/logout', {
    method: 'POST',
    body: '{}',
  }),
  weather: (coords?: { lat: string; lon: string }) => {
    const q = coords ? `?lat=${encodeURIComponent(coords.lat)}&lon=${encodeURIComponent(coords.lon)}` : ''
    return request<{ weather: WeatherReport | null }>(`/api/weather${q}`)
  },
  papers: () => request<{ papers: ApiPaper[] }>('/api/papers'),
  paper: (id: string) => request<{ paper: PaperDetail }>(`/api/papers/${id}`),
  createPaper: (name: string) =>
    request<{ paper: ApiPaper }>('/api/papers', { method: 'POST', body: JSON.stringify({ name }) }),
  createInvite: (paperId: string) =>
    request<{ invite: CreatedInvite }>(`/api/papers/${paperId}/invites`, { method: 'POST', body: '{}' }),
  leavePaper: (paperId: string) =>
    request<{ paperId: string; left: true }>(`/api/papers/${paperId}/membership`, { method: 'DELETE' }),
  joinPaper: (code: string) =>
    request<{ paper: ApiPaper }>('/api/invites/join', { method: 'POST', body: JSON.stringify({ code }) }),

  currentPage: () => request<{ page: ApiPage | null }>('/api/pages/current'),
  setCurrentPagePapers: (paperIds: string[]) =>
    request<{ page: ApiPage }>('/api/pages/current', { method: 'PUT', body: JSON.stringify({ paperIds }) }),
  getPage: (pageId: string) => request<{ page: ApiPage }>(`/api/pages/${pageId}`),
  updatePage: (pageId: string, body: {
    stories?: { id: string; headline?: string; body?: string }[]
    comic?: { title?: string; panels?: { index: number; caption?: string | null }[] }
  }) => request<{ page: ApiPage }>(`/api/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  addHighlight: (pageId: string, body: { text: string; serious?: boolean; inComic?: boolean }) =>
    request<{ highlight: ApiHighlight }>(`/api/pages/${pageId}/highlights`, { method: 'POST', body: JSON.stringify(body) }),
  updateHighlight: (id: string, body: { text?: string; serious?: boolean; inComic?: boolean }) =>
    request<{ highlight: ApiHighlight }>(`/api/highlights/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteHighlight: (id: string) =>
    request<{ id: string; deleted: boolean }>(`/api/highlights/${id}`, { method: 'DELETE' }),
  addPhoto: (highlightId: string, file: File) => {
    const body = new FormData()
    body.append('photo', file)
    return request<{ photo: Photo }>(`/api/highlights/${highlightId}/photos`, { method: 'POST', body })
  },
  deletePhoto: (photoId: string) =>
    request<{ id: string; deleted: boolean }>(`/api/photos/${photoId}`, { method: 'DELETE' }),
  generatePage: (pageId: string, regenerate = false) =>
    request<{ page: ApiPage }>(`/api/pages/${pageId}/generate`, {
      method: 'POST',
      body: JSON.stringify({ regenerate }),
    }),
  rewriteStory: (pageId: string, storyId: string) =>
    request<{ story: ApiStory }>(`/api/pages/${pageId}/stories/${storyId}/rewrite`, { method: 'POST', body: '{}' }),
  drawPanel: (pageId: string, index: number, regenerate = false) =>
    request<{ panel: ApiPanel }>(`/api/pages/${pageId}/panels/${index}`, {
      method: 'POST',
      body: JSON.stringify({ regenerate }),
    }),
  reorderPanels: (pageId: string, order: number[]) =>
    request<{ page: ApiPage }>(`/api/pages/${pageId}/panels/order`, {
      method: 'PUT',
      body: JSON.stringify({ order }),
    }),
  approvePage: (pageId: string) =>
    request<{ page: ApiPage }>(`/api/pages/${pageId}/approve`, { method: 'POST', body: '{}' }),

  currentEdition: (paperId: string) =>
    request<{ edition: EditionSummary }>(`/api/papers/${paperId}/editions/current`),
  listEditions: (paperId: string) =>
    request<{ editions: EditionSummary[] }>(`/api/papers/${paperId}/editions`),
  editionBundle: (editionId: string) =>
    request<{ bundle: EditionBundle }>(`/api/editions/${editionId}`),
  publishEdition: (editionId: string) =>
    request<{ edition: EditionSummary }>(`/api/editions/${editionId}/publish`, { method: 'POST', body: '{}' }),
  saveEdition: (editionId: string, saved: boolean) =>
    request<{ edition: EditionSummary }>(`/api/editions/${editionId}/saved`, {
      method: 'PUT',
      body: JSON.stringify({ saved }),
    }),
  setReaction: (editionId: string, storyId: string, reaction: ReactionKind | null) =>
    request<{ reactions: ReactionCounts; myReaction: ReactionKind | null }>(
      `/api/editions/${editionId}/stories/${storyId}/reaction`,
      { method: 'PUT', body: JSON.stringify({ reaction }) },
    ),

  uploadAvatarPhoto: (file: File) => {
    const body = new FormData()
    body.append('photo', file)
    body.append('photoConsent', 'true')
    return request<{ photoUrl: string; expiresAt: string }>('/api/avatar/photo', { method: 'POST', body })
  },
  createAvatar: (body: { style?: StyleKey; traits?: AvatarTraits; photoUrl?: string } = {}) =>
    request<{ avatarUrl: string; style: StyleKey; look: string }>('/api/avatar', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
}

export function userMessage(err: unknown) {
  if (err instanceof ApiError) {
    if (err.code === 'not_implemented') return 'That part of the paper is still being built.'
    if (err.code === 'unauthorized') return 'Please sign in again.'
    if (err.selfHarm) return err.message
    if (err.code === 'edition_locked') return 'This week’s deadline has passed.'
    if (err.code === 'content_blocked') return 'That didn’t make it past the editor. Try different wording.'
    if (err.code === 'rate_limited') {
      return err.retryAfterSeconds
        ? `Too many requests. Try again in ${err.retryAfterSeconds} seconds.`
        : 'Too many requests. Try again shortly.'
    }
    if (err.code === 'quota_exceeded') return 'The press is out of ink for now. Try again later.'
    if (err.code === 'provider_unavailable') return 'The writer is busy. Try again in a moment.'
    if (err.code === 'payload_too_large') return 'That photo is too large. Use a JPEG or PNG under 12 MB.'
    if (err.code === 'unsupported_media') return 'Use a JPEG or PNG photo.'
    if (err.code === 'not_found' || err.code === 'conflict' || err.code === 'forbidden') return err.message
    return err.message
  }
  return 'Something went wrong.'
}

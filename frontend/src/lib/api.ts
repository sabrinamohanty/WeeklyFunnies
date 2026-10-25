import { accessToken } from './auth'
import {
  ApiError,
  type ApiPaper,
  type CityCandidate,
  type CreatedInvite,
  type PaperDetail,
  type Profile,
  type StyleKey,
} from './types'

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:3000'

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken()
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers })
  } catch {
    throw new ApiError(0, { error: 'Could not reach the API. Is it running on port 3000?', code: 'network' })
  }

  const text = await res.text()
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {}
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
  papers: () => request<{ papers: ApiPaper[] }>('/api/papers'),
  paper: (id: string) => request<{ paper: PaperDetail }>(`/api/papers/${id}`),
  createPaper: (name: string) =>
    request<{ paper: ApiPaper }>('/api/papers', { method: 'POST', body: JSON.stringify({ name }) }),
  createInvite: (paperId: string) =>
    request<{ invite: CreatedInvite }>(`/api/papers/${paperId}/invites`, { method: 'POST', body: '{}' }),
  joinPaper: (code: string) =>
    request<{ paper: ApiPaper }>('/api/invites/join', { method: 'POST', body: JSON.stringify({ code }) }),
}

export function userMessage(err: unknown) {
  if (err instanceof ApiError) {
    if (err.code === 'not_implemented') return 'That part of the paper is still being built.'
    if (err.code === 'unauthorized') return 'Please sign in again.'
    if (err.code === 'not_found') return err.message
    return err.message
  }
  return 'Something went wrong.'
}

export type StyleKey = 'classic' | 'manga' | 'sketch' | 'superhero'
export type Role = 'owner' | 'member'

export interface ApiErrorBody {
  error: string
  code: string
  requestId?: string
  details?: { path: string; issue: string }[]
  retryAfterSeconds?: number
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId?: string
  readonly details?: ApiErrorBody['details']
  readonly retryAfterSeconds?: number

  constructor(status: number, body: Partial<ApiErrorBody>) {
    super(body.error || 'Something went wrong.')
    this.name = 'ApiError'
    this.status = status
    this.code = body.code || 'internal'
    this.requestId = body.requestId
    this.details = body.details
    this.retryAfterSeconds = body.retryAfterSeconds
  }

  get selfHarm() {
    return this.details?.some(d => d.issue === 'self_harm_support') ?? false
  }
}

export interface City {
  name: string
  admin1: string | null
  country: string
  timezone: string
}

export interface CityCandidate {
  id: number
  name: string
  admin1: string | null
  country: string
  countryCode: string
  timezone: string
}

export interface Profile {
  id: string
  name: string | null
  city: City | null
  birthday: string | null
  zodiacSign: string | null
  style: StyleKey
  look: string | null
  avatarUrl: string | null
  onboarded: boolean
  createdAt: string
}

export interface ApiPaper {
  id: string
  name: string
  role: Role
  memberCount: number
  createdAt: string
}

export interface Member {
  userId: string
  name: string | null
  city: string | null
  zodiacSign: string | null
  avatarUrl: string | null
  role: Role
  joinedAt: string
}

export interface PaperDetail extends ApiPaper {
  members: Member[]
}

export interface CreatedInvite {
  id: string
  code: string
  createdAt: string
  expiresAt: string
  revokedAt: string | null
  active: boolean
}

export function cityLabel(city: { name: string; admin1: string | null; country?: string; countryCode?: string }) {
  if (city.admin1) return `${city.name}, ${city.admin1}`
  return city.country && city.country !== 'United States' ? `${city.name}, ${city.country}` : city.name
}

export function profileReady(p: Profile | null) {
  return Boolean(p?.name && p.city && p.birthday)
}

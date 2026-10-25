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

export type PageStatus = 'writing' | 'generated' | 'approved'
export type EditionStatus = 'draft' | 'published'
export type GenerationStatus = 'pending' | 'generating' | 'ready' | 'failed'
export type ReactionKind = 'ha' | 'aww' | 'hooray'
export type StorySection =
  | 'news' | 'sports' | 'pets' | 'campus' | 'work' | 'food'
  | 'travel' | 'arts' | 'family' | 'home' | 'outdoors' | 'milestones'

export interface Photo {
  id: string
  highlightId: string
  url: string
  width: number
  height: number
  createdAt: string
}

export interface ApiHighlight {
  id: string
  pageId: string
  text: string
  serious: boolean
  inComic: boolean
  position: number
  photos: Photo[]
  notices: Array<'marked_serious'>
  createdAt: string
  updatedAt: string
}

export interface ApiStory {
  id: string
  highlightId: string
  section: StorySection
  headline: string
  body: string
  photos: string[]
}

export interface PanelImage {
  status: GenerationStatus
  url: string | null
  error: 'generation_failed' | 'content_blocked' | 'provider_unavailable' | null
}

export interface ApiPanel {
  index: number
  caption: string | null
  dialogue: { text: string; side: 'left' | 'right' }[]
  highlightId: string
  image: PanelImage
  photos: string[]
}

export interface ApiComic {
  title: string
  panels: ApiPanel[]
}

export interface PagePaper {
  paperId: string
  paperName: string
  editionId: string
  deadline: string
}

export interface ApiPage {
  id: string
  weekStart: string
  weekEnd: string
  deadline: string
  locked: boolean
  style: StyleKey
  papers: PagePaper[]
  status: PageStatus
  highlights: ApiHighlight[]
  stories: ApiStory[]
  comic: ApiComic | null
  notices: Array<'fallback_used' | 'stale'>
  limits: { regenerationsLeft: number; rewritesLeft: number; redrawsLeft: number }
  generatedAt: string | null
  approvedAt: string | null
  urlsExpireAt: string
}

export interface ReactionCounts {
  ha: number
  aww: number
  hooray: number
}

export interface PublishedStory extends ApiStory {
  reactions: ReactionCounts
  myReaction: ReactionKind | null
}

export interface PublishedPage {
  pageId: string
  authorId: string
  style: StyleKey
  stories: PublishedStory[]
  comic: ApiComic | null
}

export interface EditionSummary {
  id: string
  paperId: string
  paperName?: string
  issueNumber: number
  weekStart: string
  weekEnd: string
  deadline: string
  status: EditionStatus
  publishedAt: string | null
  expiresAt: string | null
  savedAt: string | null
}

export interface EditionMember {
  userId: string
  name: string
  city: string | null
  zodiacSign: string | null
  style: StyleKey
  avatarUrl: string | null
  role: Role
}

export interface WeatherReport {
  source: 'location' | 'profile_city'
  place: string | null
  timezone: string
  fetchedAt: string
  current: { tempC: number; weatherCode: number; summary: string } | null
  days: {
    date: string
    tempMaxC: number
    tempMinC: number
    precipitationChance: number | null
    weatherCode: number
    summary: string
  }[]
}

export interface EditionBundle {
  edition: EditionSummary & { paperName: string }
  viewer: { userId: string; role: Role }
  members: EditionMember[]
  progress: { userId: string; status: 'not_started' | 'in_progress' | 'approved' }[]
  pages: PublishedPage[]
  horoscopes: { sign: string; text: string; luckyNumber: number; userIds: string[] }[]
  birthdays: { userId: string; name: string; monthDay: string }[]
  urlsExpireAt: string
}

export interface AvatarTraits {
  hairStyle?: 'short' | 'medium' | 'long' | 'wavy' | 'curly' | 'coily' | 'braids' | 'locs' | 'buzzed' | 'bald'
  hairColor?: 'black' | 'dark_brown' | 'brown' | 'auburn' | 'red' | 'blonde' | 'gray' | 'white' | 'dyed'
  skinTone?: 'very_light' | 'light' | 'medium' | 'tan' | 'brown' | 'dark'
  facialHair?: 'none' | 'stubble' | 'mustache' | 'beard'
  glasses?: 'none' | 'round' | 'square' | 'sunglasses'
  headwear?: 'none' | 'cap' | 'beanie' | 'headwrap' | 'hijab' | 'turban'
  top?: 'tshirt' | 'hoodie' | 'sweater' | 'jacket' | 'shirt' | 'dress' | 'jersey'
  topColor?: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'black' | 'white' | 'gray' | 'brown'
  note?: string
}

export const PAGE_LIMITS = {
  highlights: 3,
  photosPerHighlight: 4,
  panels: 4,
} as const

export const isUuid = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

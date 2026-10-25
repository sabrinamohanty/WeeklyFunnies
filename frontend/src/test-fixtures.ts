import type { ApiHighlight, ApiPage, ApiPanel, ApiStory, EditionBundle, Profile } from './lib/types'
import type { Paper } from './data'

export const USER = '11111111-1111-4111-8111-111111111111'
export const PAPER = '22222222-2222-4222-8222-222222222222'
export const OTHER = '33333333-3333-4333-8333-333333333333'
export const PAGE = '44444444-4444-4444-8444-444444444444'
export const EDITION = '55555555-5555-4555-8555-555555555555'
export const HID = '66666666-6666-4666-8666-666666666666'
export const HID2 = '77777777-7777-4777-8777-777777777777'
export const HID3 = '88888888-8888-4888-8888-888888888888'
export const SID = '99999999-9999-4999-8999-999999999999'

export const profile: Profile = {
  id: USER,
  name: 'Ama',
  city: { name: 'Austin', admin1: 'Texas', country: 'United States', timezone: 'America/Chicago' },
  birthday: '1995-10-15',
  zodiacSign: 'Libra',
  style: 'classic',
  look: null,
  avatarUrl: null,
  onboarded: true,
  createdAt: '2026-10-01T00:00:00.000Z',
}

export const uiPaper: Paper = {
  id: PAPER,
  name: 'The Desk Test',
  mono: 'DT',
  swatch: 'yellow',
  members: ['yellow'],
  role: 'Editor',
  status: 'due',
  progress: 'Just you so far',
  pressDay: 'Sunday',
}

export function highlight(partial: Partial<ApiHighlight> = {}): ApiHighlight {
  return {
    id: HID,
    pageId: PAGE,
    text: 'Ran a 5K',
    serious: false,
    inComic: true,
    position: 0,
    photos: [],
    notices: [],
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
    ...partial,
  }
}

export function story(partial: Partial<ApiStory> = {}): ApiStory {
  return {
    id: SID,
    highlightId: HID,
    section: 'sports',
    headline: 'Ama ran',
    body: 'She finished.',
    photos: [],
    ...partial,
  }
}

export function panel(index: number, partial: Partial<ApiPanel> = {}): ApiPanel {
  return {
    index,
    caption: `Panel ${index}`,
    dialogue: [],
    highlightId: HID,
    image: { status: 'ready', url: `http://127.0.0.1/panel-${index}.png`, error: null },
    photos: [],
    ...partial,
  }
}

export function page(partial: Partial<ApiPage> = {}): ApiPage {
  return {
    id: PAGE,
    weekStart: '2026-10-19',
    weekEnd: '2026-10-25',
    deadline: '2026-10-26T04:59:59.999Z',
    locked: false,
    style: 'classic',
    papers: [{ paperId: PAPER, paperName: 'The Desk Test', editionId: EDITION, deadline: '2026-10-26T04:59:59.999Z' }],
    status: 'writing',
    highlights: [],
    stories: [],
    comic: null,
    notices: [],
    limits: { regenerationsLeft: 5, rewritesLeft: 10, redrawsLeft: 12 },
    generatedAt: null,
    approvedAt: null,
    urlsExpireAt: '2026-10-25T02:00:00.000Z',
    ...partial,
  }
}

export function bundle(partial: Partial<EditionBundle> = {}): EditionBundle {
  return {
    edition: {
      id: EDITION,
      paperId: PAPER,
      paperName: 'The Desk Test',
      issueNumber: 1,
      weekStart: '2026-10-19',
      weekEnd: '2026-10-25',
      deadline: '2026-10-26T04:59:59.999Z',
      status: 'draft',
      publishedAt: null,
      expiresAt: null,
      savedAt: null,
    },
    viewer: { userId: USER, role: 'owner' },
    members: [{
      userId: USER,
      name: 'Ama',
      city: 'Austin, Texas',
      zodiacSign: 'Libra',
      style: 'classic',
      avatarUrl: null,
      role: 'owner',
    }],
    progress: [],
    pages: [],
    horoscopes: [],
    birthdays: [],
    urlsExpireAt: '2026-10-25T02:00:00.000Z',
    ...partial,
  }
}

export function file(name: string, type: string, size = 32): File {
  const blob = new File([new Uint8Array([1, 2, 3, 4])], name, { type })
  if (blob.size !== size) Object.defineProperty(blob, 'size', { value: size })
  return blob
}

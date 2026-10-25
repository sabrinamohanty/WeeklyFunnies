import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditionBundle } from '../lib/types'
import { StoreProvider, type DraftPanel, type State } from '../store'
import { EDITION, PAGE, PAPER, SID, USER, bundle, page, panel, story, uiPaper } from '../test-fixtures'
import type { WeatherReport } from '../lib/types'
import { Comics, Front, Stars } from './Read'

const apiMock = vi.hoisted(() => ({
  currentEdition: vi.fn(),
  editionBundle: vi.fn(),
  setReaction: vi.fn(),
  updateMe: vi.fn(),
  weather: vi.fn(),
}))

vi.mock('../lib/auth', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: vi.fn(),
    },
  },
  accessToken: vi.fn(async () => 'tok'),
}))

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return { ...actual, api: apiMock }
})

const draftPanels: DraftPanel[] = [0, 1, 2, 3].map(index => ({
  index,
  swatch: 'yellow',
  mood: 'smile',
  caption: `Mine ${index}`,
  url: `http://mine/${index}.png`,
  status: 'ready',
  photos: [],
}))

function show(path: string, edition: EditionBundle | null, patch: Partial<State> = {}) {
  if (edition) {
    apiMock.currentEdition.mockResolvedValue({ edition: edition.edition })
    apiMock.editionBundle.mockResolvedValue({ bundle: edition })
  }
  const initial: Partial<State> = {
    ready: true,
    authed: true,
    papers: [uiPaper],
    activePaper: PAPER,
    profile: { name: 'Ama', city: 'Austin, Texas', cityId: 1, birthday: '1995-10-15' },
    page: page({
      status: 'approved',
      stories: [story({ headline: 'SECRET DRAFT' })],
      comic: { title: 'My strip', panels: [panel(0)] },
    }),
    draft: {
      title: 'My strip',
      stories: [{ id: 'local-story', highlightId: 'h', headline: 'SECRET DRAFT', article: 'Not printed.' }],
      panels: draftPanels,
    },
    ...patch,
  }
  return render(
    <MemoryRouter initialEntries={[path]}>
      <StoreProvider initial={initial}>
        <Routes>
          <Route path="/front" element={<Front />} />
          <Route path="/comics" element={<Comics />} />
          <Route path="/stars" element={<Stars />} />
        </Routes>
      </StoreProvider>
    </MemoryRouter>,
  )
}

function published(extra: Partial<EditionBundle> = {}): EditionBundle {
  return bundle({
    edition: { ...bundle().edition, status: 'published', publishedAt: '2026-10-26T05:00:00.000Z' },
    pages: [{
      pageId: PAGE,
      authorId: USER,
      style: 'classic',
      comic: { title: 'Public strip', panels: [
        panel(0, { photos: ['http://a', 'http://b'], caption: 'first' }),
        panel(1, { photos: [], caption: 'second' }),
        panel(2, { photos: ['http://c'], caption: 'third' }),
      ] },
      stories: [{
        ...story({ headline: 'Public hed' }),
        reactions: { ha: 1, aww: 0, hooray: 0 },
        myReaction: null,
      }],
    }],
    ...extra,
  })
}

const austin: WeatherReport = {
  source: 'profile_city',
  place: 'Austin',
  timezone: 'America/Chicago',
  fetchedAt: '2026-10-25T12:00:00.000Z',
  current: { tempC: 22, weatherCode: 1, summary: 'Mainly clear' },
  days: [{
    date: '2026-10-25',
    tempMaxC: 28.2,
    tempMinC: 16.4,
    precipitationChance: 10,
    weatherCode: 1,
    summary: 'Mainly clear',
  }],
}

describe('the edition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.weather.mockResolvedValue({ weather: austin })
  })

  it('shows the reader’s own draft, and the live forecast', async () => {
    show('/front', bundle())
    expect(await screen.findByText('Your page · waiting for press')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'SECRET DRAFT' })).toBeTruthy()
    expect(await screen.findByTitle('Mainly clear')).toBeTruthy()
    expect(apiMock.weather).toHaveBeenCalledWith(undefined)
    expect(screen.queryByText(/Sample/)).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Public hed' })).toBeNull()
  })

  it('does not also show that draft once the edition is on the stands', async () => {
    show('/front', published())
    expect(await screen.findByRole('heading', { name: 'Public hed' })).toBeTruthy()
    expect(screen.queryByText('Your page · waiting for press')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'SECRET DRAFT' })).toBeNull()
  })

  it('hides a draft that belongs to a different paper', async () => {
    show('/front', bundle(), {
      page: page({ papers: [{ paperId: '33333333-3333-4333-8333-333333333333', paperName: 'Other', editionId: EDITION, deadline: page().deadline }] }),
    })
    expect(await screen.findByText(/is still being written/)).toBeTruthy()
    expect(screen.queryByText('SECRET DRAFT')).toBeNull()
  })

  it('asks a reader with no paper to join, and explains an empty press', async () => {
    show('/front', null, { papers: [], activePaper: '' })
    expect(screen.getByRole('heading', { name: 'Join a paper to start reading' })).toBeTruthy()

    cleanup()
    show('/front', published({ pages: [] }))
    expect(await screen.findByText(/has no pages yet/)).toBeTruthy()

    cleanup()
    show('/front', bundle(), { draft: null, page: page({ stories: [] }) })
    expect(await screen.findByText(/is still being written/)).toBeTruthy()
  })

  it('turns a reaction off when the same one is tapped again', async () => {
    apiMock.setReaction.mockImplementation(async (_edition: string, _story: string, reaction: 'ha' | null) => ({
      reactions: { ha: reaction === 'ha' ? 2 : 1, aww: 0, hooray: 0 },
      myReaction: reaction,
    }))
    show('/front', published())
    const ha = await screen.findByRole('button', { name: /^Ha/ })
    fireEvent.click(ha)
    await waitFor(() => expect(apiMock.setReaction).toHaveBeenCalledWith(EDITION, SID, 'ha'))
    fireEvent.click(screen.getByRole('button', { name: /^Ha/ }))
    await waitFor(() => expect(apiMock.setReaction).toHaveBeenLastCalledWith(EDITION, SID, null))
  })

  it('opens a published comic on the photo for that panel', async () => {
    show('/comics', published())
    const third = await screen.findByRole('button', { name: /Public strip, panel 3/ })
    fireEvent.click(third)
    expect(screen.getByAltText('Panel 3 · photo 1')).toHaveProperty('src', expect.stringContaining('http://c'))
  })

  it('shows the reader’s own strip only while the edition is still a draft', async () => {
    show('/comics', bundle())
    expect(await screen.findByRole('heading', { name: 'My strip' })).toBeTruthy()
    expect(screen.queryByText('No comics in this edition yet')).toBeNull()

    cleanup()
    show('/comics', published({ pages: [] }))
    expect(await screen.findByText('No comics in this edition yet')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'My strip' })).toBeNull()
  })

  it('uses the birthday’s day, not a timezone-shifted date, until horoscopes exist', async () => {
    show('/stars', bundle())
    expect(await screen.findByText('Lucky number 15')).toBeTruthy()
    expect(screen.getByText('Balance returns, though not to your sleep schedule.')).toBeTruthy()
    expect(screen.getByText(/Crew horoscopes show up here/)).toBeTruthy()
    expect(screen.getByText('No birthdays in this edition')).toBeTruthy()
  })

  it('shows a lowercase edition horoscope on the reader’s own sign', async () => {
    show('/stars', bundle({
      horoscopes: [{ sign: 'libra', text: 'A bright week for friends.', luckyNumber: 42, userIds: [USER] }],
    }))
    expect(await screen.findByText('A bright week for friends.')).toBeTruthy()
    expect(screen.getByText('Lucky number 42')).toBeTruthy()
    expect(screen.queryByText('Balance returns, though not to your sleep schedule.')).toBeNull()
    expect(screen.queryByText(/Crew horoscopes show up here/)).toBeNull()
  })
})

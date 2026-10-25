import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditionSummary } from '../lib/types'
import { StoreProvider, type State } from '../store'
import { PAPER, bundle, uiPaper } from '../test-fixtures'
import { BackIssues } from './Papers'

const apiMock = vi.hoisted(() => ({
  listEditions: vi.fn(),
  editionBundle: vi.fn(),
  publishEdition: vi.fn(),
  saveEdition: vi.fn(),
  setReaction: vi.fn(),
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

function edition(partial: Partial<EditionSummary> = {}): EditionSummary {
  return { ...bundle().edition, ...partial }
}

function show(role: 'Editor' | 'Contributor' = 'Editor') {
  const initial: Partial<State> = {
    ready: true,
    authed: true,
    papers: [{ ...uiPaper, role }],
    activePaper: PAPER,
    profile: { name: 'Ama', city: 'Austin, Texas', cityId: 1, birthday: '1995-10-15' },
  }
  return render(
    <MemoryRouter initialEntries={['/back-issues']}>
      <StoreProvider initial={initial}>
        <Routes>
          <Route path="/back-issues" element={<BackIssues />} />
        </Routes>
      </StoreProvider>
    </MemoryRouter>,
  )
}

describe('back issues', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists real editions and does not show the sample headlines', async () => {
    apiMock.listEditions.mockResolvedValue({
      editions: [
        edition({ status: 'draft', deadline: '2099-01-01T00:00:00.000Z' }),
        edition({
          id: 'printed',
          issueNumber: 12,
          weekStart: '2026-10-12',
          status: 'published',
          publishedAt: '2026-10-19T05:00:00.000Z',
          expiresAt: '2026-11-02T05:00:00.000Z',
        }),
      ],
    })
    show()
    expect(await screen.findByText(/No\. 12/)).toBeTruthy()
    expect(screen.queryByText('Austin Man Adopts First Pup!')).toBeNull()
    expect(screen.queryByText(/This week's edition/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Read' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull()
  })

  it('publishes a closed draft and saves a printed edition for the editor', async () => {
    const closed = edition({
      id: 'closed',
      issueNumber: 11,
      weekStart: '2026-10-05',
      status: 'draft',
      deadline: '2020-01-01T00:00:00.000Z',
    })
    apiMock.listEditions.mockResolvedValue({ editions: [closed] })
    apiMock.publishEdition.mockResolvedValue({
      edition: { ...closed, status: 'published', publishedAt: '2026-10-12T05:00:00.000Z', expiresAt: '2026-10-26T05:00:00.000Z' },
    })
    apiMock.saveEdition.mockResolvedValue({
      edition: { ...closed, status: 'published', savedAt: '2026-10-20T00:00:00.000Z', expiresAt: null },
    })
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(apiMock.publishEdition).toHaveBeenCalledWith('closed'))
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
    await waitFor(() => expect(apiMock.saveEdition).toHaveBeenCalledWith('closed', true))
  })

  it('hides press and save from a contributor, and opens the printed stories', async () => {
    apiMock.listEditions.mockResolvedValue({
      editions: [
        edition({ id: 'closed', status: 'draft', deadline: '2020-01-01T00:00:00.000Z' }),
        edition({ id: 'printed', issueNumber: 9, status: 'published', publishedAt: '2026-10-19T05:00:00.000Z', expiresAt: '2026-11-02T05:00:00.000Z' }),
      ],
    })
    apiMock.editionBundle.mockResolvedValue({
      bundle: bundle({
        edition: edition({ id: 'printed', issueNumber: 9, status: 'published' }),
        pages: [{
          pageId: 'page',
          authorId: '11111111-1111-4111-8111-111111111111',
          style: 'classic',
          comic: null,
          stories: [{
            id: 'story',
            highlightId: 'h',
            section: 'news',
            headline: 'Real printed hed',
            body: 'The page that actually ran.',
            photos: [],
            reactions: { ha: 0, aww: 0, hooray: 0 },
            myReaction: null,
          }],
        }],
      }),
    })
    show('Contributor')
    expect(await screen.findByText('Waiting for the editor')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Read' }))
    expect(await screen.findByRole('heading', { name: 'Real printed hed' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Ha/ })).toBeTruthy()
    expect(apiMock.editionBundle).toHaveBeenCalledWith('printed')
  })
})

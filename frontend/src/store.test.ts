import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'

vi.mock('./lib/auth', () => ({
  supabase: { auth: {} },
  accessToken: vi.fn(async () => null),
}))

vi.mock('./lib/api', () => ({
  api: {
    me: vi.fn(),
    papers: vi.fn(),
    currentPage: vi.fn(),
    currentEdition: vi.fn(),
    editionBundle: vi.fn(),
  },
  userMessage: (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong.'),
}))

import { api } from './lib/api'
import { loadAccount, pageFields, toUiPaper } from './store'
import { HID, page, profile, highlight } from './test-fixtures'

const session = { user: { email: 'ama@example.com' } } as Session

describe('pageFields', () => {
  it('keeps an edited highlight and a new draft when the server already has a row', () => {
    const saved = page({ highlights: [highlight({ text: 'Old' })] })
    const fields = pageFields(saved, [
      { id: HID, text: 'Edited', photos: [], serious: false, inComic: true },
      { id: 'h-new', text: 'Still on this phone', photos: [], serious: false, inComic: true },
    ])
    expect(fields.highlights?.map(h => h.text)).toEqual(['Edited', 'Still on this phone'])
  })

  it('does not replace saved highlights with the empty card from step one', () => {
    const saved = page({ highlights: [highlight()] })
    const fields = pageFields(saved, [{ id: 'h-blank', text: '', photos: [], serious: false, inComic: true }])
    expect(fields.highlights?.map(h => h.text)).toEqual(['Ran a 5K'])
  })

  it('marks every linked paper published only after approval', () => {
    const writing = pageFields(page())
    expect(writing.published).toEqual([])
    expect(writing.highlights).toHaveLength(1)
    expect(writing.highlights?.[0]?.id.startsWith('h-')).toBe(true)
    const approved = pageFields(page({ status: 'approved', highlights: [highlight()] }))
    expect(approved.published).toEqual([page().papers[0]!.paperId])
  })
})

describe('loadAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.mocked(api.me).mockResolvedValue({ profile })
    vi.mocked(api.papers).mockResolvedValue({
      papers: [{ id: page().papers[0]!.paperId, name: 'The Desk Test', role: 'owner', memberCount: 1, createdAt: profile.createdAt }],
    })
    vi.mocked(api.currentPage).mockResolvedValue({ page: page({ highlights: [highlight({ text: 'On the server' })] }) })
    vi.mocked(api.currentEdition).mockResolvedValue({ edition: {
      id: '55555555-5555-4555-8555-555555555555',
      paperId: page().papers[0]!.paperId,
      issueNumber: 1,
      weekStart: '2026-10-19',
      weekEnd: '2026-10-25',
      deadline: '2026-10-26T04:59:59.999Z',
      status: 'draft',
      publishedAt: null,
      expiresAt: null,
      savedAt: null,
    } })
    vi.mocked(api.editionBundle).mockRejectedValue(new Error('edition down'))
  })

  it('keeps an unsaved highlight that was stored before the server had any', async () => {
    localStorage.setItem('meanwhile:local', JSON.stringify({
      highlights: [{ id: 'h-phone', text: 'Typed offline', photos: ['blob:dead', { url: 'http://kept' }] }],
      saved: [4, 'nope'],
    }))
    const state = await loadAccount(session, null)
    expect(state.highlights.map(h => h.text)).toEqual(['On the server', 'Typed offline'])
    expect(state.highlights[1]?.photos).toEqual([{ url: 'http://kept' }])
    expect(state.saved).toEqual([4])
    expect(state.bundle).toBeNull()
    expect(state.email).toBe('ama@example.com')
    expect(state.papers[0]?.mono).toBe('DT')
  })

  it('still opens the newsstand when this week’s page cannot be loaded', async () => {
    vi.mocked(api.currentPage).mockRejectedValue(new Error('down'))
    const state = await loadAccount(session, null)
    expect(state.papers).toHaveLength(1)
    expect(state.page).toBeNull()
    expect(state.highlights).toHaveLength(1)
    expect(state.selectedPapers).toEqual([page().papers[0]!.paperId])
  })

  it('stays signed in when the profile request fails', async () => {
    vi.mocked(api.me).mockRejectedValue(new Error('down'))
    const state = await loadAccount(session, null)
    expect(state.authed).toBe(true)
    expect(state.papers).toEqual([])
    expect(state.profile.name).toBe('')
  })

  it('signs nobody in when there is no session', async () => {
    const state = await loadAccount(null, null)
    expect(state.authed).toBe(false)
    expect(api.me).not.toHaveBeenCalled()
  })
})

describe('paper monograms', () => {
  it('uses the first letters after dropping a leading The', () => {
    expect(toUiPaper({ id: 'p', name: 'The Desk Test', role: 'owner', memberCount: 1 }, 0).mono).toBe('DT')
    expect(toUiPaper({ id: 'p', name: 'Roommates', role: 'member', memberCount: 4 }, 0).mono).toBe('R')
    expect(toUiPaper({ id: 'p', name: 'The ', role: 'owner', memberCount: 1 }, 0).mono).toBe('WF')
    expect(toUiPaper({ id: 'p', name: '   ', role: 'owner', memberCount: 1 }, 0).mono).toBe('WF')
    expect(toUiPaper({ id: 'p', name: 'Roommates', role: 'member', memberCount: 4 }, 0).progress).toBe('4 members')
  })
})

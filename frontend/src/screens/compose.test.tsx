import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/types'
import { StoreProvider, type State } from '../store'
import { HID, PAGE, file, highlight, page, panel, story, uiPaper } from '../test-fixtures'
import { Review, WriteHighlights } from './MyWeek'

const apiMock = vi.hoisted(() => ({
  addHighlight: vi.fn(),
  updateHighlight: vi.fn(),
  deleteHighlight: vi.fn(),
  addPhoto: vi.fn(),
  deletePhoto: vi.fn(),
  generatePage: vi.fn(),
  drawPanel: vi.fn(),
  getPage: vi.fn(),
  updatePage: vi.fn(),
  reorderPanels: vi.fn(),
  approvePage: vi.fn(),
  setCurrentPagePapers: vi.fn(),
  rewriteStory: vi.fn(),
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

function generated() {
  return page({
    status: 'generated',
    highlights: [highlight()],
    stories: [story()],
    comic: { title: 'Meanwhile, this week', panels: [0, 1, 2, 3].map(index => panel(index)) },
  })
}

function renderWrite(patch: Partial<State> = {}) {
  const initial: Partial<State> = {
    ready: true,
    authed: true,
    papers: [uiPaper],
    selectedPapers: [uiPaper.id],
    activePaper: uiPaper.id,
    page: page(),
    highlights: [{ id: 'h-local', text: 'Ran a 5K', photos: [], serious: false, inComic: true }],
    profile: { name: 'Ama', city: 'Austin, Texas', cityId: 1, birthday: '1995-10-15' },
    ...patch,
  }
  return render(
    <MemoryRouter initialEntries={['/my-week/write']}>
      <StoreProvider initial={initial}>
        <Routes>
          <Route path="/my-week/write" element={<WriteHighlights />} />
          <Route path="/my-week/review" element={<h1>Proof sheet</h1>} />
        </Routes>
      </StoreProvider>
    </MemoryRouter>,
  )
}

function renderReview(patch: Partial<State> = {}) {
  const ready = generated()
  const initial: Partial<State> = {
    ready: true,
    authed: true,
    papers: [uiPaper],
    selectedPapers: [uiPaper.id],
    page: ready,
    highlights: [{ id: HID, text: 'Ran a 5K', photos: [], serious: false, inComic: true }],
    draft: {
      title: ready.comic!.title,
      stories: [{ id: story().id, highlightId: HID, headline: 'Ama ran', article: 'She finished.' }],
      panels: ready.comic!.panels.map((p, i) => ({
        index: p.index,
        swatch: 'yellow',
        mood: 'smile',
        caption: p.caption ?? '',
        url: p.image.url,
        status: p.image.status,
        photos: p.photos,
        ...(i === 0 ? {} : {}),
      })),
    },
    ...patch,
  }
  return render(
    <MemoryRouter initialEntries={['/my-week/review']}>
      <StoreProvider initial={initial}>
        <Routes>
          <Route path="/my-week/review" element={<Review />} />
          <Route path="/my-week/write" element={<h1>Write</h1>} />
        </Routes>
      </StoreProvider>
    </MemoryRouter>,
  )
}

describe('writing a page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.addHighlight.mockResolvedValue({ highlight: { id: HID } })
    apiMock.deleteHighlight.mockResolvedValue({ id: HID, deleted: true })
    apiMock.updateHighlight.mockResolvedValue({ highlight: highlight() })
    apiMock.addPhoto.mockResolvedValue({
      photo: { id: 'photo-1', highlightId: HID, url: 'http://photo', width: 1, height: 1, createdAt: '2026-10-20T00:00:00Z' },
    })
    apiMock.generatePage.mockResolvedValue({ page: generated() })
    apiMock.drawPanel.mockResolvedValue({ panel: panel(0) })
    apiMock.getPage.mockResolvedValue({ page: generated() })
  })

  it('still opens the proof sheet when one panel fails to ink', async () => {
    apiMock.drawPanel.mockImplementation(async (_id: string, index: number) => {
      if (index === 1) throw new ApiError(503, { error: 'down', code: 'provider_unavailable' })
      return { panel: panel(index) }
    })
    renderWrite()
    fireEvent.click(screen.getByRole('button', { name: 'Generate my page' }))
    expect(await screen.findByRole('heading', { name: 'Proof sheet' })).toBeTruthy()
    expect(apiMock.generatePage).toHaveBeenCalledWith(PAGE, false)
    expect(apiMock.drawPanel).toHaveBeenCalledTimes(4)
    expect(await screen.findByText(/Redraw it on the proof sheet/)).toBeTruthy()
    expect(apiMock.getPage).toHaveBeenCalledWith(PAGE)
  })

  it('asks the server to regenerate once a page has already been written', async () => {
    renderWrite({ page: page({ status: 'generated', stories: [story()] }) })
    fireEvent.click(screen.getByRole('button', { name: 'Generate my page' }))
    await screen.findByRole('heading', { name: 'Proof sheet' })
    expect(apiMock.generatePage).toHaveBeenCalledWith(PAGE, true)
  })

  it('opens the proof sheet when the writer returns no comic', async () => {
    apiMock.generatePage.mockResolvedValue({ page: page({ status: 'generated', stories: [story()], comic: null }) })
    renderWrite()
    fireEvent.click(screen.getByRole('button', { name: 'Generate my page' }))
    await screen.findByRole('heading', { name: 'Proof sheet' })
    expect(apiMock.drawPanel).not.toHaveBeenCalled()
  })

  it('stays on the highlights when the refreshed page cannot be loaded', async () => {
    apiMock.getPage.mockRejectedValue(new ApiError(500, { error: 'nope', code: 'internal' }))
    renderWrite()
    fireEvent.click(screen.getByRole('button', { name: 'Generate my page' }))
    expect(await screen.findByText('nope')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Proof sheet' })).toBeNull()
  })

  it('does not upload a gif, an oversized file, or a fifth photo', async () => {
    const photos = [0, 1, 2, 3].map(i => ({ id: `p${i}`, url: `http://p${i}` }))
    renderWrite({
      highlights: [{ id: HID, text: 'Ran a 5K', photos, serious: false, inComic: true }],
    })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file('clip.gif', 'image/gif')] } })
    expect(await screen.findByText('This highlight already has 4 photos.')).toBeTruthy()
    expect(apiMock.addPhoto).not.toHaveBeenCalled()

    cleanup()
    renderWrite({
      highlights: [{ id: HID, text: 'Ran a 5K', photos: photos.slice(0, 3), serious: false, inComic: true }],
    })
    const inputs = document.querySelectorAll('input[type="file"]')
    const open = inputs[inputs.length - 1] as HTMLInputElement
    fireEvent.change(open, {
      target: { files: [file('clip.gif', 'image/gif'), file('big.png', 'image/png', 13 * 1024 * 1024), file('ok.png', 'image/png')] },
    })
    await waitFor(() => expect(apiMock.addPhoto).toHaveBeenCalledTimes(1))
    const note = screen.getByText(/Use a JPEG or PNG photo/)
    expect(note.textContent).toMatch(/too large/)
  })

  it('disables generation after the deadline', () => {
    renderWrite({ page: page({ locked: true }) })
    expect(screen.getByRole('button', { name: 'Deadline passed' })).toHaveProperty('disabled', true)
  })
})

describe('the proof sheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.updatePage.mockResolvedValue({ page: generated() })
    apiMock.reorderPanels.mockResolvedValue({ page: generated() })
  })

  it('does not save a headline the reader only tabbed through', () => {
    renderReview()
    fireEvent.blur(screen.getByLabelText('Headline'))
    expect(apiMock.updatePage).not.toHaveBeenCalled()
  })

  it('patches the headline without resubmitting the article', async () => {
    renderReview()
    const headline = screen.getByLabelText('Headline')
    fireEvent.change(headline, { target: { value: 'A new hed' } })
    fireEvent.blur(headline)
    await waitFor(() => expect(apiMock.updatePage).toHaveBeenCalledWith(PAGE, {
      stories: [{ id: story().id, headline: 'A new hed' }],
    }))
  })

  it('will not approve a stale page', () => {
    renderReview({ page: { ...generated(), notices: ['stale'] } })
    expect(screen.getByRole('button', { name: 'Approve my page' })).toHaveProperty('disabled', true)
    expect(screen.getByText(/Generate again before approving/)).toBeTruthy()
  })

  it('saves a dragged order once, when the panel is dropped', async () => {
    renderReview()
    const first = screen.getByLabelText('Panel 1. Use the arrow keys to move it.')
    const second = screen.getByLabelText('Panel 2. Use the arrow keys to move it.')
    fireEvent.dragStart(first)
    fireEvent.dragOver(second)
    expect(apiMock.reorderPanels).not.toHaveBeenCalled()
    fireEvent.dragEnd(first)
    await waitFor(() => expect(apiMock.reorderPanels).toHaveBeenCalledTimes(1))
    expect(apiMock.reorderPanels).toHaveBeenCalledWith(PAGE, [1, 0, 2, 3])
  })

  it('does not ask the server to move a panel past the end of the strip', () => {
    renderReview()
    fireEvent.keyDown(screen.getByLabelText('Panel 4. Use the arrow keys to move it.'), { key: 'ArrowRight' })
    expect(apiMock.reorderPanels).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByLabelText('Panel 1. Use the arrow keys to move it.'), { key: 'ArrowRight' })
    expect(apiMock.reorderPanels).toHaveBeenCalledWith(PAGE, [1, 0, 2, 3])
  })
})

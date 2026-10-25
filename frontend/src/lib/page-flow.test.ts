import { describe, expect, it, vi } from 'vitest'
import { dayOfMonth, monthDayLabel, weekLabelFromIso } from '../data'
import { MAX_PHOTO_BYTES } from './page-flow'
import {
  appendUnsavedHighlights,
  avatarNeedsRedraw,
  avatarPhotoProblem,
  avatarTraits,
  classifyHighlightPhotos,
  deadlineHasPassed,
  draftStoriesForPaper,
  editionsReadyToPublish,
  drawComicPanels,
  frontEmptyState,
  lightboxItems,
  moveItem,
  parseLocalDraft,
  reconcileHighlights,
  recycleNote,
  shouldRegenerate,
  showOwnDraftComic,
  storyEdit,
  syncHighlights,
  toggledReaction,
  type FlowHighlight,
  type HighlightWriter,
} from './page-flow'
import { file } from '../test-fixtures'

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function row(partial: Partial<FlowHighlight> & Pick<FlowHighlight, 'id' | 'text'>): FlowHighlight {
  return { photos: [], serious: false, inComic: true, ...partial }
}

describe('highlight merge', () => {
  it('keeps a server highlight and an unsaved draft, and drops blank placeholders', () => {
    const merged = appendUnsavedHighlights(
      [row({ id: A, text: 'Saved' })],
      [row({ id: 'h-local', text: 'Still typing' }), row({ id: 'h-empty', text: '   ' })],
    )
    expect(merged.map(h => h.text)).toEqual(['Saved', 'Still typing'])
  })

  it('does not append a fourth highlight past the cap', () => {
    const server = [A, B, C].map(id => row({ id, text: id }))
    const merged = appendUnsavedHighlights(server, [row({ id: 'h-extra', text: 'Too many' })])
    expect(merged).toHaveLength(3)
    expect(merged.some(h => h.text === 'Too many')).toBe(false)
  })

  it('does not treat a stored uuid as an unsaved draft', () => {
    const merged = appendUnsavedHighlights([], [row({ id: A, text: 'Already on the server' })])
    expect(merged).toEqual([])
  })

  it('keeps in-progress edits and drops a highlight the screen no longer shows', () => {
    const server = [row({ id: A, text: 'Old' }), row({ id: B, text: 'Gone' })]
    const ui = [
      row({ id: A, text: '  Rewritten  ', serious: true, inComic: true }),
      row({ id: 'h-new', text: 'New' }),
      row({ id: 'h-blank', text: '' }),
    ]
    const merged = reconcileHighlights(server, ui)
    expect(merged.map(h => h.id)).toEqual([A, 'h-new'])
    expect(merged[0]).toMatchObject({ text: '  Rewritten  ', serious: true, inComic: false })
  })

  it('does not wipe saved highlights when the only card is still empty', () => {
    const server = [row({ id: A, text: 'Saved' })]
    expect(reconcileHighlights(server, [row({ id: 'h-blank', text: '' })])).toEqual(server)
  })

  it('trusts an empty photo list on screen, so a removal is not restored', () => {
    const server = [row({ id: A, text: 'Saved', photos: [{ id: 'p1', url: 'http://photo' }] })]
    const ui = [row({ id: A, text: 'Saved', photos: [] })]
    expect(reconcileHighlights(server, ui)[0]?.photos).toEqual([])
  })
})

describe('photo acceptance', () => {
  it('rejects a full highlight without blaming the file type', () => {
    const png = file('ok.png', 'image/png')
    const result = classifyHighlightPhotos(4, [png])
    expect(result.accepted).toEqual([])
    expect(result.notices).toEqual(['This highlight already has 4 photos.'])
  })

  it('keeps a png, drops a gif and a second file that does not fit, and flags an oversized jpeg', () => {
    const big = file('big.jpg', 'image/jpeg', MAX_PHOTO_BYTES + 1)
    const result = classifyHighlightPhotos(3, [
      file('anim.gif', 'image/gif'),
      file('ok.PNG', 'image/PNG'),
      big,
      file('extra.png', 'image/png'),
    ])
    expect(result.accepted.map(f => f.name)).toEqual(['ok.PNG'])
    expect(result.notices).toEqual([
      'Use a JPEG or PNG photo.',
      'That photo is too large. Use a JPEG or PNG under 12 MB.',
      'Only 4 photos fit on a highlight.',
    ])
  })

  it('accepts the non-standard image/jpg type', () => {
    const result = classifyHighlightPhotos(0, [file('scan.jpg', 'image/jpg')])
    expect(result.accepted).toHaveLength(1)
    expect(result.notices).toEqual([])
  })

  it('says nothing when the picker was cancelled', () => {
    expect(classifyHighlightPhotos(1, [])).toEqual({ accepted: [], notices: [] })
  })
})

describe('syncHighlights', () => {
  function writer(): HighlightWriter {
    return {
      deleteHighlight: vi.fn(async () => ({})),
      addHighlight: vi.fn(async () => ({ highlight: { id: C } })),
      updateHighlight: vi.fn(async () => ({})),
      addPhoto: vi.fn(async () => ({ photo: { id: 'photo-1', url: 'http://signed' } })),
    }
  }

  it('creates, updates, and skips an unchanged row, and forces a serious highlight out of the comic', async () => {
    const api = writer()
    const local = [
      row({ id: 'h-new', text: '  New week  ', serious: true, inComic: true, photos: [{ url: 'blob:local', file: file('a.png', 'image/png') }] }),
      row({ id: A, text: 'Changed', serious: false, inComic: true }),
      row({ id: B, text: 'Same', serious: false, inComic: false, photos: [{ id: 'kept', url: 'http://kept' }] }),
    ]
    const server = [
      { id: A, text: 'Old', serious: false, inComic: true },
      { id: B, text: 'Same', serious: false, inComic: false },
      { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', text: 'Removed', serious: false, inComic: true },
    ]
    const next = await syncHighlights('page', local, server, api)
    expect(api.deleteHighlight).toHaveBeenCalledTimes(1)
    expect(api.addHighlight).toHaveBeenCalledWith('page', { text: 'New week', serious: true, inComic: false })
    expect(api.updateHighlight).toHaveBeenCalledTimes(1)
    expect(api.updateHighlight).toHaveBeenCalledWith(A, { text: 'Changed', serious: false, inComic: true })
    expect(api.addPhoto).toHaveBeenCalledWith(C, local[0]!.photos[0]!.file)
    expect(next.map(h => h.id)).toEqual([C, A, B])
    expect(next[0]).toMatchObject({ serious: true, inComic: false, photos: [{ id: 'photo-1', url: 'http://signed' }] })
    expect(next[2]?.photos).toEqual([{ id: 'kept', url: 'http://kept' }])
  })

  it('does not add a replacement when deleting the old highlight fails', async () => {
    const api = writer()
    vi.mocked(api.deleteHighlight).mockRejectedValueOnce(new Error('nope'))
    await expect(syncHighlights('page', [row({ id: 'h-new', text: 'New' })], [
      { id: A, text: 'Old', serious: false, inComic: true },
    ], api)).rejects.toThrow('nope')
    expect(api.addHighlight).not.toHaveBeenCalled()
  })

  it('keeps the highlight when one photo fails and still uploads the next', async () => {
    const api = writer()
    const notices: unknown[] = []
    vi.mocked(api.addPhoto)
      .mockRejectedValueOnce(new Error('blocked'))
      .mockResolvedValueOnce({ photo: { id: 'photo-2', url: 'http://ok' } })
    const next = await syncHighlights('page', [row({
      id: 'h-new',
      text: 'Two photos',
      photos: [
        { url: 'blob:a', file: file('a.png', 'image/png') },
        { url: 'blob:b', file: file('b.png', 'image/png') },
      ],
    })], [], api, err => notices.push(err))
    expect(notices).toHaveLength(1)
    expect(next[0]?.photos).toEqual([{ id: 'photo-2', url: 'http://ok' }])
  })

  it('drops a photo that has neither an id nor a file', async () => {
    const api = writer()
    const next = await syncHighlights('page', [row({
      id: A,
      text: 'Same',
      photos: [{ url: 'blob:gone' }],
    })], [{ id: A, text: 'Same', serious: false, inComic: true }], api)
    expect(api.addPhoto).not.toHaveBeenCalled()
    expect(next[0]?.photos).toEqual([])
  })
})

describe('generation and proof edits', () => {
  it('regenerates only after the first draft exists', () => {
    expect(shouldRegenerate('writing')).toBe(false)
    expect(shouldRegenerate('generated')).toBe(true)
    expect(shouldRegenerate('approved')).toBe(true)
  })

  it('draws each panel once and reports the one that failed', async () => {
    const drawn: number[] = []
    const result = await drawComicPanels(
      [{ index: 0 }, { index: 1 }, { index: 1 }, { index: 9 }, { index: -1 }, { index: 2.5 }],
      async index => {
        drawn.push(index)
        if (index === 1) throw new Error('ink')
      },
    )
    expect(drawn).toEqual([0, 1])
    expect(result.failed).toEqual([1])
  })

  it('draws nothing when the page has no comic yet', async () => {
    const draw = vi.fn()
    await expect(drawComicPanels(null, draw)).resolves.toEqual({ failed: [] })
    expect(draw).not.toHaveBeenCalled()
  })

  it('patches only the field that changed', () => {
    const saved = { headline: 'Old', body: 'Body' }
    expect(storyEdit(saved, { id: 's', headline: 'Old', article: 'Body' })).toBeNull()
    expect(storyEdit(saved, { id: 's', headline: 'New', article: 'Body' })).toEqual({ id: 's', headline: 'New' })
    expect(storyEdit(saved, { id: 's', headline: 'Old', article: 'More' })).toEqual({ id: 's', body: 'More' })
  })

  it('refuses a move past either end', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
    expect(moveItem(['a', 'b'], 1, 2)).toBeNull()
    expect(moveItem(['a'], 0, 0)).toBeNull()
    expect(moveItem(['a', 'b'], -1, 0)).toBeNull()
  })
})

describe('reading and avatar decisions', () => {
  const stories = [{ id: 's', headline: 'Mine' }]

  it('shows a draft only on a paper that draft was linked to, and never after publish', () => {
    expect(draftStoriesForPaper(false, 'paper', [{ paperId: 'paper' }], stories)).toEqual(stories)
    expect(draftStoriesForPaper(false, 'other', [{ paperId: 'paper' }], stories)).toEqual([])
    expect(draftStoriesForPaper(true, 'paper', [{ paperId: 'paper' }], stories)).toEqual([])
    expect(draftStoriesForPaper(false, undefined, [{ paperId: 'paper' }], stories)).toEqual([])
  })

  it('offers press only for a draft whose Sunday deadline has passed', () => {
    const now = Date.parse('2026-10-26T12:00:00.000Z')
    const open = { id: 'open', status: 'draft', deadline: '2026-11-02T04:59:59.999Z' }
    const closed = { id: 'closed', status: 'draft', deadline: '2026-10-26T04:59:59.999Z' }
    const printed = { id: 'printed', status: 'published', deadline: '2026-10-26T04:59:59.999Z' }
    expect(deadlineHasPassed(closed.deadline, now)).toBe(true)
    expect(deadlineHasPassed(open.deadline, now)).toBe(false)
    expect(deadlineHasPassed('not-a-date', now)).toBe(false)
    expect(editionsReadyToPublish([open, closed, printed], now)).toEqual([closed])
  })

  it('counts days until an unsaved edition is recycled', () => {
    const now = Date.parse('2026-10-26T12:00:00.000Z')
    expect(recycleNote(null, now)).toBe('Kept forever')
    expect(recycleNote('2026-10-26T13:00:00.000Z', now)).toBe('Recycled tomorrow')
    expect(recycleNote('2026-10-28T12:00:00.000Z', now)).toBe('Recycled in 2 days')
    expect(recycleNote('2026-10-26T11:00:00.000Z', now)).toBe('Recycled soon')
  })

  it('picks one empty state and does not stack them', () => {
    expect(frontEmptyState({ paperCount: 0, published: false, publishedPageCount: 0, ownStoryCount: 2 })).toBe('join')
    expect(frontEmptyState({ paperCount: 1, published: true, publishedPageCount: 0, ownStoryCount: 1 })).toBe('published-empty')
    expect(frontEmptyState({ paperCount: 1, published: false, publishedPageCount: 0, ownStoryCount: 0 })).toBe('draft-empty')
    expect(frontEmptyState({ paperCount: 1, published: true, publishedPageCount: 2, ownStoryCount: 0 })).toBeNull()
    expect(frontEmptyState({ paperCount: 1, published: false, publishedPageCount: 0, ownStoryCount: 1 })).toBeNull()
  })

  it('hides the draft comic once the edition is published, and when there is nothing to draw', () => {
    expect(showOwnDraftComic(false, 4, true)).toBe(true)
    expect(showOwnDraftComic(true, 4, true)).toBe(false)
    expect(showOwnDraftComic(false, 0, true)).toBe(false)
    expect(showOwnDraftComic(false, 4, false)).toBe(false)
  })

  it('opens the lightbox on the first photo of the tapped panel', () => {
    const built = lightboxItems([
      { caption: 'a', photos: ['http://a', 'http://b'], imageUrl: null },
      { caption: null, photos: [], imageUrl: 'http://panel' },
      { caption: 'c', photos: ['http://c'], imageUrl: 'http://ignored' },
    ], 2)
    expect(built.start).toBe(3)
    expect(built.items[3]).toMatchObject({ label: 'Panel 3 · photo 1', image: 'http://c', panelIndex: 2 })
    expect(lightboxItems([], 3).start).toBe(0)
    expect(lightboxItems([{ caption: null, photos: [], imageUrl: null }], 5).start).toBe(0)
  })

  it('turns a reaction off when it is tapped again', () => {
    expect(toggledReaction(null, 'ha')).toBe('ha')
    expect(toggledReaction('ha', 'ha')).toBeNull()
    expect(toggledReaction('ha', 'aww')).toBe('aww')
  })

  it('maps chip indexes onto avatar traits and asks for a redraw when they change', () => {
    expect(avatarTraits({ hair: 99, glasses: true, outfit: -1 })).toEqual({
      hairStyle: 'short',
      hairColor: 'dark_brown',
      skinTone: 'medium',
      glasses: 'round',
      top: 'tshirt',
      topColor: 'orange',
    })
    const drawn = { style: 'classic', hair: 0, glasses: false, outfit: 0 }
    expect(avatarNeedsRedraw(drawn, drawn, null)).toBe(true)
    expect(avatarNeedsRedraw(drawn, drawn, 'http://avatar')).toBe(false)
    expect(avatarNeedsRedraw({ ...drawn, glasses: true }, drawn, 'http://avatar')).toBe(true)
    expect(avatarNeedsRedraw({ ...drawn, style: 'sketch' }, drawn, 'http://avatar')).toBe(true)
  })

  it('blocks an avatar photo until there is consent, a real type, and a sane size', () => {
    const png = file('me.png', 'image/png')
    expect(avatarPhotoProblem(false, png)).toMatch(/Check the box/)
    expect(avatarPhotoProblem(true, file('me.gif', 'image/gif'))).toMatch(/JPEG or PNG/)
    expect(avatarPhotoProblem(true, file('me.png', 'image/png', MAX_PHOTO_BYTES + 1))).toMatch(/too large/)
    expect(avatarPhotoProblem(true, png)).toBeNull()
  })
})

describe('local draft storage and calendar labels', () => {
  it('drops dead blob urls and non-integers, and survives corrupt storage', () => {
    const parsed = parseLocalDraft(JSON.stringify({
      highlights: [
        { id: 'h-1', text: ' Kept ', photos: ['blob:dead', { url: 'http://ok', id: 'p' }, { url: '' }] },
        { id: 'h-2', text: '   ' },
        { text: 'no id' },
        null,
      ],
      saved: [1, '2', 2.5, 3],
    }))
    expect(parsed.highlights).toEqual([row({ id: 'h-1', text: ' Kept ', photos: [{ id: 'p', url: 'http://ok' }] })])
    expect(parsed.saved).toEqual([1, 3])
    expect(parseLocalDraft('not json')).toEqual({ highlights: [], saved: [] })
    expect(parseLocalDraft(null)).toEqual({ highlights: [], saved: [] })
    expect(parseLocalDraft('[]')).toEqual({ highlights: [], saved: [] })
  })

  it('keeps a serious stored highlight out of the comic', () => {
    const parsed = parseLocalDraft(JSON.stringify({
      highlights: [{ id: 'h-1', text: 'Hard week', serious: true, inComic: true }],
    }))
    expect(parsed.highlights[0]).toMatchObject({ serious: true, inComic: false })
  })

  it('does not roll an impossible calendar day into the next month', () => {
    expect(monthDayLabel('02-31')).toBe('02-31')
    expect(monthDayLabel('13-01')).toBe('13-01')
    expect(monthDayLabel('02-29')).toMatch(/Feb/)
    expect(weekLabelFromIso('2026-02-31')).not.toMatch(/Mar/)
    expect(weekLabelFromIso('2026-10-19')).toMatch(/Oct/)
    expect(dayOfMonth('1995-10-15')).toBe(15)
    expect(dayOfMonth('nope')).toBeNull()
    expect(dayOfMonth('1995-10-32')).toBeNull()
  })
})

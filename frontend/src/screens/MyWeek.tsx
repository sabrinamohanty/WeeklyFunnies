import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Cartoon } from '../components/Cartoon'
import { IconClock, IconGrip, IconPlus, IconRefresh, IconX } from '../components/Icons'
import { BRAND, Checkbox, Cover, MetaRow, MiniMast, Overlay, Screen, useCountdown } from '../components/ui'
import { edition, weekLabelFromIso } from '../data'
import { api, userMessage } from '../lib/api'
import {
  classifyHighlightPhotos,
  drawComicPanels,
  moveItem,
  shouldRegenerate,
  storyEdit,
  syncHighlights,
} from '../lib/page-flow'
import { isUuid, PAGE_LIMITS } from '../lib/types'
import {
  emptyHighlight,
  pageFields,
  useActivePaper,
  useStore,
  type DraftPanel,
  type DraftStory,
  type Highlight,
  type HighlightPhoto,
} from '../store'
import { lookFor } from './Onboarding'

export function ChoosePapers() {
  const nav = useNavigate()
  const { state, set, toast } = useStore()
  const [busy, setBusy] = useState(false)
  const deadline = state.page?.deadline ? new Date(state.page.deadline) : edition.deadline
  const due = useCountdown(deadline)
  const week = state.page?.weekStart ? weekLabelFromIso(state.page.weekStart) : edition.week
  const sel = state.selectedPapers.filter(id => state.papers.some(p => p.id === id))
  const toggle = (id: string) => {
    if (state.page?.locked) return
    set({ selectedPapers: sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id] })
  }
  const first = state.papers.find(p => p.id === sel[0])
  const cta = sel.length === 0 ? 'Pick at least one paper' : sel.length === 1 ? `Write for ${first!.name.replace(/^The /, '')}` : `Write for ${sel.length} papers`

  const continueWrite = async () => {
    if (sel.length === 0 || busy) return
    setBusy(true)
    try {
      const { page } = await api.setCurrentPagePapers(sel)
      set(pageFields(page, state.highlights))
      nav('/my-week/write')
    } catch (e) {
      toast(userMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen dock={
      <>
        <button className="btn btn-primary" disabled={sel.length === 0 || busy || state.page?.locked} onClick={() => void continueWrite()}>
          {busy ? 'Opening the desk…' : cta}
        </button>
        <p className="dock-note">{state.page?.locked ? 'This week’s deadline has passed.' : 'You can always post to more papers later.'}</p>
      </>
    }>
      <MiniMast back="/front" />
      <MetaRow left={`My week · ${week}`} right="Step 1 of 3" />
      <p className="kicker">Assignment desk</p>
      <h1 className="display">Which papers is this week's comic for?</h1>
      <p className="lede">Pick one or more. Your highlights, headlines and comic strip go to every paper you check.</p>
      <div className="deadline">
        <IconClock size={20} />
        <p><b>All papers close Sunday at 11:59 p.m.</b> New editions print Monday morning.
          {due.ms > 0 && <span className="countdown"> {due.label} left</span>}</p>
      </div>
      <div className="paper-options">
        {state.papers.map(p => {
          const on = sel.includes(p.id)
          const done = state.published.includes(p.id)
          return (
            <label key={p.id} className={`paper-option ${on ? 'selected' : ''}`}>
              <Checkbox checked={on} onChange={() => toggle(p.id)} label={p.name} />
              <Cover mono={p.mono} swatch={p.swatch} />
              <span>
                <b>{p.name}</b>
                <i>{done ? 'You already posted this week' : p.progress}</i>
                <span className="tag">Due Sun</span>
              </span>
            </label>
          )
        })}
      </div>
      {state.papers.length === 0 && (
        <p className="hint">Join or start a paper first — a page needs somewhere to print.</p>
      )}
      <Link to="/papers" className="link center">Manage my papers</Link>
    </Screen>
  )
}

export function WriteHighlights() {
  const nav = useNavigate()
  const { state, set, toast } = useStore()
  const [printing, setPrinting] = useState(false)
  const hs = state.highlights
  const filled = hs.filter(h => h.text.trim()).length
  const paper = state.papers.find(p => p.id === state.selectedPapers[0])
  const week = state.page?.weekStart ? weekLabelFromIso(state.page.weekStart) : edition.week
  const locked = Boolean(state.page?.locked)

  const update = (id: string, patch: Partial<Highlight>) => set(s => ({ highlights: s.highlights.map(h => (h.id === id ? { ...h, ...patch } : h)) }))
  const remove = (id: string) => {
    const h = hs.find(x => x.id === id)
    if (h && isUuid(h.id)) {
      void api.deleteHighlight(h.id).catch(e => toast(userMessage(e)))
    }
    set(s => ({ highlights: s.highlights.filter(x => x.id !== id) }))
  }
  const add = () => set(s => ({ highlights: [...s.highlights, emptyHighlight()] }))

  const generate = async () => {
    if (printing || filled < 1 || locked) return
    setPrinting(true)
    try {
      let page = state.page
      if (!page) {
        const paperIds = state.selectedPapers.filter(id => state.papers.some(p => p.id === id))
        if (paperIds.length === 0) throw new Error('Pick a paper first.')
        page = (await api.setCurrentPagePapers(paperIds)).page
      }
      const highlights = await syncHighlights(page.id, state.highlights, page.highlights, api, err => toast(userMessage(err)))
      const generated = (await api.generatePage(page.id, shouldRegenerate(page.status))).page
      const drawn = await drawComicPanels(generated.comic?.panels, index => api.drawPanel(generated.id, index))
      if (drawn.failed.length) toast('A panel didn’t ink. Redraw it on the proof sheet.')
      const fresh = (await api.getPage(generated.id)).page
      set({ ...pageFields(fresh), highlights })
      nav('/my-week/review')
    } catch (e) {
      toast(e instanceof Error && !('code' in e) ? e.message : userMessage(e))
    } finally {
      setPrinting(false)
    }
  }

  return (
    <Screen dock={
      <>
        <button className="btn btn-primary" disabled={filled < 1 || printing || locked} onClick={() => void generate()}>
          {locked ? 'Deadline passed' : 'Generate my page'}
        </button>
        <p className="dock-note">{filled < 2 ? 'Add at least two highlights for the best page.' : 'Takes about 30 seconds. You can edit everything next.'}</p>
      </>
    }>
      <MiniMast back="/my-week" />
      <MetaRow left={`${paper?.name ?? 'My week'} · ${week}`} right="Step 2 of 3" />
      <h1 className="display">What did you do this week?</h1>
      <p className="lede">Write 2–3 highlights. We turn each one into a headline, a short article and a comic panel. Due Sunday at 11:59 p.m.</p>

      {hs.map((h, i) => (
        <HighlightCard key={h.id} h={h} n={i + 1} canRemove={hs.length > 1 && !locked} locked={locked}
          update={update} remove={remove} />
      ))}
      {hs.length < PAGE_LIMITS.highlights && !locked && (
        <button className="add-card" onClick={add}><IconPlus size={20} /> Add highlight {hs.length + 1}</button>
      )}
      {printing && <PrintingPress />}
    </Screen>
  )
}

const placeholders = ['e.g. Adopted a puppy named Biscuit', 'e.g. Finished my first 5K', 'e.g. Survived three midterms in four days']

function HighlightCard({ h, n, canRemove, locked, update, remove }: {
  h: Highlight; n: number; canRemove: boolean; locked: boolean
  update: (id: string, p: Partial<Highlight>) => void; remove: (id: string) => void
}) {
  const { toast } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || locked) return
    const { accepted, notices } = classifyHighlightPhotos(h.photos.length, Array.from(files))
    if (notices.length) toast(notices.join(' '))
    if (accepted.length === 0) return
    const next: HighlightPhoto[] = [...h.photos]
    for (const file of accepted) {
      if (isUuid(h.id)) {
        try {
          const { photo } = await api.addPhoto(h.id, file)
          next.push({ id: photo.id, url: photo.url })
        } catch (e) {
          toast(userMessage(e))
        }
      } else {
        next.push({ url: URL.createObjectURL(file), file })
      }
    }
    update(h.id, { photos: next })
  }

  const removePhoto = (k: number) => {
    const photo = h.photos[k]
    if (!photo) return
    if (photo.id) void api.deletePhoto(photo.id).catch(e => toast(userMessage(e)))
    if (photo.url.startsWith('blob:')) URL.revokeObjectURL(photo.url)
    update(h.id, { photos: h.photos.filter((_, j) => j !== k) })
  }

  return (
    <section className="card highlight">
      <div className="card-head">
        <p className="kicker">Highlight {n}</p>
        {canRemove && <button className="icon-btn" aria-label={`Remove highlight ${n}`} onClick={() => remove(h.id)}><IconX size={20} /></button>}
      </div>
      <div className="field-wrap">
        <textarea className="field area" rows={3} maxLength={500} value={h.text} placeholder={placeholders[n - 1]}
          aria-label={`Highlight ${n}`} disabled={locked} onChange={e => update(h.id, { text: e.target.value })} />
        <span className="counter">{h.text.length}/500</span>
      </div>
      <p className="hint">Photos · only your paper can see them</p>
      <div className={`photo-strip ${over ? 'over' : ''}`}
        onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); void addFiles(e.dataTransfer.files) }}>
        {h.photos.map((p, k) => (
          <div key={p.id ?? p.url} className="thumb">
            <img src={p.url} alt={`Photo ${k + 1}`} />
            {!locked && <button className="thumb-x" aria-label={`Remove photo ${k + 1}`} onClick={() => removePhoto(k)}><IconX size={14} /></button>}
          </div>
        ))}
        {h.photos.length < PAGE_LIMITS.photosPerHighlight && !locked && (
          <button className={`thumb add ${h.photos.length === 0 ? 'wide' : ''}`} onClick={() => fileRef.current?.click()}>
            <IconPlus size={20} />{h.photos.length === 0 ? 'Drag photos here or tap to add' : 'Add'}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png" multiple hidden onChange={e => { void addFiles(e.target.files); e.target.value = '' }} />
      </div>
      <div className="toggles">
        <label><span>Keep this one serious</span><Checkbox checked={h.serious} onChange={v => update(h.id, { serious: v, inComic: v ? false : h.inComic })} /></label>
        <label><span>Include in my comic strip</span><Checkbox checked={h.inComic && !h.serious} onChange={v => update(h.id, { inComic: v })} /></label>
      </div>
    </section>
  )
}

const pressSteps = ['Reading your highlights…', 'Writing headlines…', 'Inking comic panels…', 'Stop the presses!']

function PrintingPress() {
  const paper = useActivePaper()
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => setI(v => Math.min(v + 1, pressSteps.length - 1)), 900)
    return () => window.clearInterval(t)
  }, [])
  return (
    <Overlay>
      <div className="press-overlay" role="alertdialog" aria-label="Generating your page" aria-live="assertive">
        <div className="press">
          <div className="press-roller" />
          <div className="press-sheet"><span className="mini-logo">{paper?.name ?? BRAND}</span><i /><i /><i /><i /></div>
        </div>
        <p key={i} className="press-step">{pressSteps[i]}</p>
      </div>
    </Overlay>
  )
}

export function Review() {
  const nav = useNavigate()
  const { state, set, toast } = useStore()
  const [published, setPublished] = useState(false)
  const [busy, setBusy] = useState(false)
  const [redrawing, setRedrawing] = useState<number | null>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const draft = state.draft
  const page = state.page
  const locked = Boolean(page?.locked)
  const week = page?.weekStart ? weekLabelFromIso(page.weekStart) : edition.week
  const panelsRef = useRef(draft?.panels ?? [])
  const dragOrder = useRef<number[] | null>(null)
  const dragFrom = useRef<number | null>(null)
  if (draft && dragFrom.current === null) panelsRef.current = draft.panels

  if (!draft) return <Navigate to="/my-week/write" replace />

  const look = lookFor(state.avatar)
  const setStory = (i: number, patch: Partial<DraftStory>) =>
    set(s => ({ draft: { ...s.draft!, stories: s.draft!.stories.map((st, j) => (j === i ? { ...st, ...patch } : st)) } }))
  const setPanels = (panels: DraftPanel[]) => {
    panelsRef.current = panels
    set(s => ({ draft: { ...s.draft!, panels } }))
  }

  const saveStory = async (st: DraftStory) => {
    if (!page || locked) return
    const prev = page.stories.find(s => s.id === st.id)
    const edit = storyEdit(
      { headline: prev?.headline ?? '', body: prev?.body ?? '' },
      st,
    )
    if (!edit) return
    try {
      const { page: next } = await api.updatePage(page.id, { stories: [edit] })
      set(pageFields(next, state.highlights))
    } catch (e) {
      toast(userMessage(e))
    }
  }

  const rewrite = async (i: number) => {
    if (!page || locked) return
    const st = draft.stories[i]
    if (!st) return
    try {
      await api.rewriteStory(page.id, st.id)
      const { page: next } = await api.getPage(page.id)
      set(pageFields(next, state.highlights))
    } catch (e) {
      toast(userMessage(e))
    }
  }

  const redraw = async (k: number) => {
    if (!page || locked) return
    setRedrawing(k)
    try {
      const { panel } = await api.drawPanel(page.id, draft.panels[k]?.index ?? k, true)
      setPanels(draft.panels.map((x, j) => j === k ? { ...x, index: panel.index, caption: panel.caption ?? '', url: panel.image.url, status: panel.image.status, photos: panel.photos } : x))
    } catch (e) {
      toast(userMessage(e))
    } finally {
      setRedrawing(null)
    }
  }

  const commitOrder = (panels: DraftPanel[]) => {
    if (!page || locked) return
    void api.reorderPanels(page.id, panels.map(x => x.index))
      .then(({ page: fresh }) => set(pageFields(fresh, state.highlights)))
      .catch(e => toast(userMessage(e)))
  }

  const move = (from: number, to: number, persist: boolean) => {
    if (locked) return
    const next = moveItem(panelsRef.current, from, to)
    if (!next) return
    setPanels(next)
    if (persist) commitOrder(next)
  }

  const approve = async () => {
    if (!page || locked || busy) return
    setBusy(true)
    try {
      const { page: next } = await api.approvePage(page.id)
      set(pageFields(next, state.highlights))
      setPublished(true)
    } catch (e) {
      toast(userMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen dock={
      <div className="btn-row split">
        <button className="btn" onClick={() => nav('/my-week/write')}>Edit</button>
        <button className="btn btn-primary" disabled={locked || busy || page?.status === 'approved' || page?.notices.includes('stale')} onClick={() => void approve()}>
          {page?.status === 'approved' ? 'Approved' : busy ? 'Filing…' : 'Approve my page'}
        </button>
      </div>
    }>
      <MiniMast back="/my-week/write" />
      <MetaRow left={`Proof sheet · ${week}`} right="Step 3 of 3" />
      <h1 className="display">Review your page</h1>
      <p className="lede">Edit anything before it goes to print.</p>
      {page?.notices.includes('stale') && <p className="hint">Your highlights changed after this was written. Generate again before approving.</p>}
      {page?.notices.includes('fallback_used') && <p className="hint">The writer used a safe fallback. Edit or rewrite anything that looks off.</p>}

      {draft.stories.map((st, i) => (
        <section key={st.id} className="card">
          <div className="card-head">
            <p className="kicker">Highlight {i + 1} · Story</p>
            <button className="btn btn-sm" disabled={locked} onClick={() => void rewrite(i)}><IconRefresh size={18} /> Rewrite</button>
          </div>
          <label className="hint" htmlFor={`hl-${i}`}>Headline</label>
          <textarea id={`hl-${i}`} className="field headline-field typed" rows={2} maxLength={120} value={st.headline}
            disabled={locked} onChange={e => setStory(i, { headline: e.target.value })}
            onBlur={e => void saveStory({ ...st, headline: e.target.value })} />
          <label className="hint" htmlFor={`ar-${i}`}>Article</label>
          <textarea id={`ar-${i}`} className="field area typed" rows={4} maxLength={600} value={st.article}
            disabled={locked} onChange={e => setStory(i, { article: e.target.value })}
            onBlur={e => void saveStory({ ...st, article: e.target.value })} />
        </section>
      ))}

      {draft.panels.length > 0 && (
        <section className="card">
          <div className="card-head">
            <p className="kicker">Your comic strip{draft.title ? ` · ${draft.title}` : ''}</p>
            <i className="hint">Drag to reorder</i>
          </div>
          <div className="strip-frame editable">
            {draft.panels.map((p, k) => (
              <div key={p.index} draggable={!locked} className={`ht c-${p.swatch} panel ${drag === k ? 'dragging' : ''} ${redrawing === k ? 'redrawing' : ''}`}
                onDragStart={() => { dragOrder.current = panelsRef.current.map(x => x.index); dragFrom.current = k; setDrag(k) }}
                onDragEnd={() => {
                  const order = panelsRef.current.map(x => x.index)
                  const changed = dragOrder.current !== null && order.join() !== dragOrder.current.join()
                  dragOrder.current = null
                  dragFrom.current = null
                  setDrag(null)
                  if (changed) commitOrder(panelsRef.current)
                }}
                onDragOver={e => {
                  e.preventDefault()
                  const from = dragFrom.current
                  if (from === null || from === k) return
                  move(from, k, false)
                  dragFrom.current = k
                  setDrag(k)
                }}
                tabIndex={0} aria-label={`Panel ${k + 1}. Use the arrow keys to move it.`}
                onKeyDown={e => {
                  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -2, ArrowDown: 2 }[e.key]
                  if (step) { e.preventDefault(); move(k, k + step, true) }
                }}>
                <span className="panel-label"><IconGrip size={14} /> Panel {k + 1}</span>
                {p.url
                  ? <img className="panel-art" src={p.url} alt="" />
                  : <Cartoon look={look} style={state.avatar.style} mood={p.mood} />}
                {(p.status === 'pending' || p.status === 'generating') && <span className="inking">Inking…</span>}
                {p.caption && <span className="panel-caption">{p.caption}</span>}
                <button className="panel-redraw" disabled={redrawing !== null || locked} onClick={() => void redraw(k)} aria-label={`Redraw panel ${k + 1}`}>
                  <IconRefresh size={15} /> Redraw
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {published && (
        <Overlay>
          <div className="press-overlay" role="dialog" aria-modal="true" aria-label="Approved">
            <div className="extra">
              <p className="extra-stamp">Extra! Extra!</p>
              <h2 className="display center">Your page is filed</h2>
              <p className="lede center">It goes to {state.selectedPapers.length === 1 ? '1 paper' : `${state.selectedPapers.length} papers`} when the editor publishes after Sunday 11:59 p.m.</p>
              <button className="btn btn-primary" onClick={() => { toast('Page filed with the editor'); nav('/front') }}>See the front page</button>
            </div>
          </div>
        </Overlay>
      )}
    </Screen>
  )
}

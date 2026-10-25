import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { IconClock, IconGrip, IconPlus, IconRefresh, IconX } from '../components/Icons'
import { BRAND, Checkbox, MetaRow, MiniMast, Overlay, Screen, useCountdown } from '../components/ui'
import { edition, moodCycle, swatchCycle, type Mood, type Swatch } from '../data'
import { uid, useActivePaper, useStore, type DraftPanel, type DraftStory, type Highlight, type State } from '../store'
import { defaultPanelSrcs } from '../demoSeed'
import { apiStyle, generatePanel, generateStory, imageSrc, photoToDataUrl, type ApiPerson, type ApiStory } from '../api'
import { describeLook } from './Onboarding'
import { SettingsButton } from './Settings'

export function ChoosePapers() {
  const nav = useNavigate()
  const { state, set } = useStore()
  const due = useCountdown(edition.deadline)
  const sel = state.selectedPapers.filter(id => state.papers.some(p => p.id === id))
  const toggle = (id: string) => set({ selectedPapers: sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id] })
  const first = state.papers.find(p => p.id === sel[0])
  const cta = sel.length === 0 ? 'Pick at least one paper' : sel.length === 1 ? `Write for ${first!.name.replace(/^The /, '')}` : `Write for ${sel.length} papers`

  return (
    <Screen dock={
      <>
        <button className="btn btn-primary" disabled={sel.length === 0} onClick={() => nav('/my-week/write')}>{cta}</button>
        <p className="dock-note">You can always post to more papers later.</p>
      </>
    }>
      <MiniMast back="/front" right={<SettingsButton />} />
      <MetaRow left={`My week · ${edition.week}`} right="Step 1 of 3" />
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
          const done = p.status === 'done' || state.published.includes(p.id)
          return (
            <label key={p.id} className={`paper-option ${on ? 'selected' : ''}`}>
              <Checkbox checked={on} onChange={() => toggle(p.id)} label={p.name} />
              <span>
                <b>{p.name}</b>
                <i>{done ? 'You already posted this week' : p.progress}</i>
                <span className="tag">Due Sun</span>
              </span>
            </label>
          )
        })}
      </div>
      <Link to="/papers" className="link center">Manage my papers</Link>
    </Screen>
  )
}

export function WriteHighlights() {
  const nav = useNavigate()
  const { state, set } = useStore()
  const [printing, setPrinting] = useState(false)
  const hs = state.highlights
  const filled = hs.filter(h => h.text.trim()).length
  const paper = state.papers.find(p => p.id === state.selectedPapers[0])

  const update = (id: string, patch: Partial<Highlight>) => set(s => ({ highlights: s.highlights.map(h => (h.id === id ? { ...h, ...patch } : h)) }))
  const remove = (id: string) => set(s => ({ highlights: s.highlights.filter(h => h.id !== id) }))
  const add = () => set(s => ({ highlights: [...s.highlights, { id: uid('h'), text: '', photos: [], serious: false, inComic: true }] }))

  const generate = async () => {
    setPrinting(true)
    const name = state.profile.name.trim() || 'Our reporter'
    const written = hs.filter(h => h.text.trim())
    const comic = written.filter(h => h.inComic)
    const me = reporter(state)
    const started = Date.now()

    // Offline stand-in, used when the writer or artist can't be reached.
    const localDraft = () => {
      const stories: DraftStory[] = written.map(h => ({ highlightId: h.id, ...writeStory(h.text, name, state.profile.city, h.serious, 0), alt: 0 }))
      const panels: DraftPanel[] = Array.from({ length: PANELS }, (_, k) => ({
        id: uid('p'), swatch: swatchCycle[k % swatchCycle.length]!, mood: (['o', 'grin', 'flat', 'smile'] as Mood[])[k]!,
        caption: comic[k % Math.max(1, comic.length)]?.text ?? '',
      }))
      return { stories, panels }
    }

    let draft: { stories: DraftStory[]; panels: DraftPanel[] }
    let scripts: NonNullable<ApiStory['comic']>['panels'] = []
    try {
      const story = await generateStory({
        weekLabel: edition.week, people: [me],
        highlights: written.map(h => ({ personId: me.id, text: h.text, serious: h.serious, inComic: h.inComic })),
      })
      const local = localDraft()
      scripts = story.comic?.panels ?? []
      draft = {
        stories: [{ highlightId: written[0]!.id, headline: story.article.headline, article: story.article.body, alt: 0 }],
        panels: scripts.length === PANELS
          ? scripts.map((p, k) => ({
              id: uid('p'), swatch: local.panels[k]!.swatch, mood: local.panels[k]!.mood,
              caption: p.caption ?? p.dialogue[0]?.text ?? '', scene: p.scene, characters: p.characters, loading: true,
            }))
          : local.panels,
      }
    } catch {
      // The writer is out of reach: the local draft is shown exactly as if it had come from the writer.
      draft = localDraft()
    }

    // Let the press animation play at least a moment, then show the proof sheet and fill panels as they finish.
    await new Promise(r => window.setTimeout(r, Math.max(0, MIN_PRESS_MS - (Date.now() - started))))
    set({ draft })
    nav('/my-week/review')

    const patchPanel = (id: string, patch: Partial<DraftPanel>) =>
      set(s => (s.draft ? { draft: { ...s.draft, panels: s.draft.panels.map(p => (p.id === id ? { ...p, ...patch } : p)) } } : {}))
    // A panel with no image once the artist fails or runs out of time shows its ready-made stand-in.
    draft.panels.filter(p => p.scene).forEach(p => {
      withTimeout(generatePanel({ style: apiStyle(state.avatar.style), panel: { scene: p.scene!, characters: p.characters! }, people: [me] }), PANEL_TIMEOUT_MS)
        .then(r => patchPanel(p.id, { image: r.imageUrl, loading: false }))
        .catch(() => patchPanel(p.id, { loading: false }))
    })
  }

  return (
    <Screen dock={
      <>
        <button className="btn btn-primary" disabled={filled < 1} onClick={generate}>Generate my page</button>
        <p className="dock-note">{filled < 2 ? 'Add at least two highlights for the best page.' : 'Takes about 30 seconds. You can edit everything next.'}</p>
      </>
    }>
      <MiniMast back="/my-week" />
      <MetaRow left={`${paper?.name ?? 'My week'} · ${edition.week}`} right="Step 2 of 3" />
      <h1 className="display">What did you do this week?</h1>
      <p className="lede">Write 2–3 highlights. We turn each one into a headline, a short article and a comic panel. Due Sunday at 11:59 p.m.</p>

      {hs.map((h, i) => <HighlightCard key={h.id} h={h} n={i + 1} canRemove={hs.length > 1} update={update} remove={remove} />)}
      {hs.length < 3 && (
        <button className="add-card" onClick={add}><IconPlus size={20} /> Add highlight {hs.length + 1}</button>
      )}
      {printing && <PrintingPress />}
    </Screen>
  )
}

const placeholders = ['e.g. Saw my favorite band live', 'e.g. Tried a new restaurant', 'e.g. Finished a big project at work']

function HighlightCard({ h, n, canRemove, update, remove }: { h: Highlight; n: number; canRemove: boolean; update: (id: string, p: Partial<Highlight>) => void; remove: (id: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  // Photos are shrunk to small data URLs so they're saved with the draft and survive a refresh.
  const addFiles = async (files: FileList | null) => {
    if (!files) return
    const picked = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, 6 - h.photos.length)
    const urls = await Promise.all(picked.map(f => photoToDataUrl(f, 800).catch(() => URL.createObjectURL(f))))
    update(h.id, { photos: [...h.photos, ...urls] })
  }

  return (
    <section className="card highlight">
      <div className="card-head">
        <p className="kicker">Highlight {n}</p>
        {canRemove && <button className="icon-btn" aria-label={`Remove highlight ${n}`} onClick={() => remove(h.id)}><IconX size={20} /></button>}
      </div>
      <div className="field-wrap">
        <textarea className="field area" rows={3} maxLength={280} value={h.text} placeholder={placeholders[n - 1]}
          aria-label={`Highlight ${n}`} onChange={e => update(h.id, { text: e.target.value })} />
        <span className="counter">{h.text.length}/280</span>
      </div>
      <p className="hint">Photos · only your paper can see them</p>
      <div className={`photo-strip ${over ? 'over' : ''}`}
        onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files) }}>
        {h.photos.map((p, k) => (
          <div key={p.slice(0, 40) + k} className={`thumb ${p.startsWith('blob:') || p.startsWith('data:') ? '' : `ht c-${p}`}`}>
            {(p.startsWith('blob:') || p.startsWith('data:')) && <img src={p} alt={`Photo ${k + 1}`} />}
            <button className="thumb-x" aria-label={`Remove photo ${k + 1}`} onClick={() => update(h.id, { photos: h.photos.filter((_, j) => j !== k) })}><IconX size={14} /></button>
          </div>
        ))}
        {h.photos.length < 6 && (
          <button className={`thumb add ${h.photos.length === 0 ? 'wide' : ''}`} onClick={() => fileRef.current?.click()}>
            <IconPlus size={20} />{h.photos.length === 0 ? 'Drag photos here or tap to add' : 'Add'}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
      </div>
      <div className="toggles">
        <label><span>Keep this one serious</span><Checkbox checked={h.serious} onChange={v => update(h.id, { serious: v })} /></label>
        <label><span>Include in my comic strip</span><Checkbox checked={h.inComic} onChange={v => update(h.id, { inComic: v })} /></label>
      </div>
    </section>
  )
}

/** Comic strips are a 2×2 grid of four panels. */
const PANELS = 4

/** The press animation plays at least this long, so the page never flashes past. */
const MIN_PRESS_MS = 4000
/** A panel still unfinished after this long is given up on and shows its stand-in. */
const PANEL_TIMEOUT_MS = 45_000

/** Rejects if the work isn't done in time; a result that arrives afterward is ignored by the caller. */
const withTimeout = <T,>(work: Promise<T>, ms: number) =>
  new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error('timed out')), ms)
    work.then(v => { window.clearTimeout(t); resolve(v) }, e => { window.clearTimeout(t); reject(e) })
  })

/** The signed-in person as the story and image models see them: a first name, a fixed look, their avatar. */
function reporter(state: State): ApiPerson {
  return { id: 'me', name: state.profile.name.trim() || 'Reporter', look: describeLook(state.avatar), avatarUrl: state.avatar.image }
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

/** Stand-in for the AI writer: turns a highlight into a tabloid headline and a two-line article. */
function writeStory(text: string, name: string, city: string, serious: boolean, alt: number) {
  const first = name.split(' ')[0]!
  const place = city.trim() || 'Local'
  const t = text.trim().replace(/[.!]+$/, '')
  const lower = t.toLowerCase()
  const rules: [RegExp, string[]][] = [
    [/pupp|dog|kitten|cat\b/, [`${place} Resident Adopts First Pup!`, `${first} Gains Roommate, Loses Couch`, `Small Creature Seizes Control of ${first}'s Home`]],
    [/5k|run|marathon|race/, [`${first} Conquers the Course, Demands Tacos`, `Legs Report Mixed Feelings After ${first}'s Big Race`, `${place} Runner Crosses Finish Line in Style`]],
    [/job|hired|intern|work/, [`${first} Starts New Gig, Office Snack Drawer Trembles`, `${place} Hire Makes Strong First Impression`, `${first} Joins Workforce, Requests Better Chairs`]],
    [/exam|midterm|test|class|orgo/, [`${first} Survives Exam Week on Cold Brew Alone`, `Textbooks Concede Defeat to ${first}`, `${first} Declares War on the Syllabus`]],
  ]
  const match = rules.find(([re]) => re.test(lower))
  const options = match ? match[1] : [`${first} Makes Headlines: ${titleCase(t.split(' ').slice(0, 6).join(' '))}`, `Sources Confirm ${first} Had A Week`, `${place} Reporter Files Bombshell Update`]
  const headline = serious ? `${first}: ${titleCase(t.split(' ').slice(0, 7).join(' '))}` : options[alt % options.length]!
  // Keep the writer's capitalization (names, places); only the sentence start is lowered.
  const rest = t.replace(/^I\s+/, '').replace(/\b[Mm]y\b/g, 'their')
  const body = rest[0]!.toLowerCase() + rest.slice(1)
  const article = serious
    ? `${first} shared some news this week: ${body}. The crew sends its love.`
    : `${first} ${body}. Sources close to the reporter confirm this was, by all accounts, a big deal. More details as they develop.`
  return { headline, article }
}

const titleCase = (s: string) => s.replace(/\w\S*/g, w => w[0]!.toUpperCase() + w.slice(1))

export function Review() {
  const nav = useNavigate()
  const { state, set, toast } = useStore()
  const [published, setPublished] = useState(false)
  const [redrawing, setRedrawing] = useState<string | null>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const draft = state.draft

  // Drafts saved before strips had four panels get the missing ones added.
  useEffect(() => {
    if (!draft || draft.panels.length >= PANELS) return
    // Read the latest draft inside the update so running this twice can't add extra panels.
    set(s => {
      const panels = s.draft?.panels ?? []
      if (!s.draft || panels.length >= PANELS) return {}
      const extra = Array.from({ length: PANELS - panels.length }, (_, k) => {
        const n = panels.length + k
        return { id: uid('p'), swatch: swatchCycle[n % swatchCycle.length]!, mood: moodCycle[n % moodCycle.length]!, caption: '' }
      })
      return { draft: { ...s.draft, panels: [...panels, ...extra] } }
    })
  }, [draft, set])

  if (!draft) return <Navigate to="/my-week/write" replace />

  const name = state.profile.name.trim() || 'Our reporter'
  const setStory = (i: number, patch: Partial<DraftStory>) =>
    set(s => ({ draft: { ...s.draft!, stories: s.draft!.stories.map((st, j) => (j === i ? { ...st, ...patch } : st)) } }))
  const setPanels = (panels: DraftPanel[]) => set(s => ({ draft: { ...s.draft!, panels } }))

  const rewrite = async (i: number) => {
    const st = draft.stories[i]!
    const h = state.highlights.find(x => x.id === st.highlightId)
    if (!h) return
    const alt = st.alt + 1
    // A story the writer produced is rewritten by the writer; the offline stand-in covers the rest.
    if (draft.panels.some(p => p.scene)) {
      try {
        const written = state.highlights.filter(x => x.text.trim())
        const r = await generateStory({
          weekLabel: edition.week, people: [reporter(state)],
          highlights: written.map(x => ({ personId: 'me', text: x.text, serious: x.serious, inComic: x.inComic })),
        })
        return setStory(i, { headline: r.article.headline, article: r.article.body, alt })
      } catch { /* falls through to the local rewrite below */ }
    }
    setStory(i, { ...writeStory(h.text, name, state.profile.city, h.serious, alt), alt })
  }
  const redraw = (k: number) => {
    const p = draft.panels[k]!
    if (p.scene) {
      const patch = (x: Partial<DraftPanel>) => set(s => (s.draft ? { draft: { ...s.draft, panels: s.draft.panels.map(q => (q.id === p.id ? { ...q, ...x } : q)) } } : {}))
      patch({ loading: true })
      withTimeout(generatePanel({ style: apiStyle(state.avatar.style), panel: { scene: p.scene, characters: p.characters! }, people: [reporter(state)], fresh: true }), PANEL_TIMEOUT_MS)
        .then(r => patch({ image: r.imageUrl, loading: false }))
        .catch(() => patch({ loading: false }))
      return
    }
    setRedrawing(p.id)
    window.setTimeout(() => {
      setPanels(draft.panels.map((x, j) => j === k ? {
        ...x,
        swatch: swatchCycle[(swatchCycle.indexOf(x.swatch) + 1) % swatchCycle.length] as Swatch,
        mood: moodCycle[(moodCycle.indexOf(x.mood) + 1) % moodCycle.length]!,
      } : x))
      setRedrawing(null)
    }, 550)
  }
  const move = (from: number, to: number) => {
    if (to < 0 || to >= draft.panels.length || from === to) return
    const next = [...draft.panels]
    const [p] = next.splice(from, 1)
    next.splice(to, 0, p!)
    setPanels(next)
  }
  const publish = () => {
    set(s => ({ published: [...new Set([...s.published, ...s.selectedPapers])] }))
    setPublished(true)
  }

  return (
    <Screen dock={
      <div className="btn-row split">
        <button className="btn" onClick={() => nav('/my-week/write')}>Edit</button>
        <button className="btn btn-primary" onClick={publish}>Approve &amp; publish</button>
      </div>
    }>
      <MiniMast back="/my-week/write" />
      <MetaRow left={`Proof sheet · ${edition.week}`} right="Step 3 of 3" />
      <h1 className="display">Review your page</h1>
      <p className="lede">Edit anything before it goes to print.{draft.stories.length > 1 && ' Only your cover story runs on the front page.'}</p>

      {draft.stories.map((st, i) => (
        <section key={st.highlightId} className="card">
          <div className="card-head">
            <p className="kicker">Highlight {i + 1} · Story</p>
            <button className="btn btn-sm" onClick={() => void rewrite(i)}><IconRefresh size={18} /> Rewrite</button>
          </div>
          {draft.stories.length > 1 && (
            <label className="cover-pick">
              <input type="radio" name="cover" checked={(draft.coverId ?? draft.stories[0]!.highlightId) === st.highlightId}
                onChange={() => set(s => ({ draft: { ...s.draft!, coverId: st.highlightId } }))} />
              <span>Make this my cover story</span>
            </label>
          )}
          <label className="hint" htmlFor={`hl-${i}`}>Headline</label>
          <textarea key={`h${st.alt}`} id={`hl-${i}`} className="field headline-field typed" rows={2} value={st.headline} onChange={e => setStory(i, { headline: e.target.value })} />
          <label className="hint" htmlFor={`ar-${i}`}>Article</label>
          <textarea key={`a${st.alt}`} id={`ar-${i}`} className="field area typed" rows={4} value={st.article} onChange={e => setStory(i, { article: e.target.value })} />
        </section>
      ))}

      <section className="card">
        <div className="card-head">
          <p className="kicker">Your comic strip</p>
          <i className="hint">Drag to reorder</i>
        </div>
        <div className="strip-frame editable">
          {draft.panels.map((p, k) => (
            <div key={p.id} draggable className={`ht c-${p.swatch} panel ${drag === k ? 'dragging' : ''} ${redrawing === p.id ? 'redrawing' : ''} ${p.loading ? 'is-loading' : ''}`}
              onDragStart={() => setDrag(k)} onDragEnd={() => setDrag(null)}
              onDragOver={e => { e.preventDefault(); if (drag !== null && drag !== k) { move(drag, k); setDrag(k) } }}
              tabIndex={0} aria-label={`Panel ${k + 1}. Use the arrow keys to move it.`}
              onKeyDown={e => {
                // The grid is two panels wide, so up and down jump a row.
                const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -2, ArrowDown: 2 }[e.key]
                if (step) { e.preventDefault(); move(k, k + step) }
              }}>
              <span className="panel-label"><IconGrip size={14} /> Panel {k + 1}</span>
              {/* A generated image wins; while it's still being drawn the panel shimmers; otherwise the ready-made panel for this slot. */}
              {p.image
                ? <img className="panel-art" src={imageSrc(p.image)} alt={`Panel ${k + 1}: ${p.caption}`} draggable={false} />
                : p.loading
                  ? null
                  : <img className="panel-art" src={defaultPanelSrcs[k % defaultPanelSrcs.length]} alt={`Panel ${k + 1}: ${p.caption}`} draggable={false} />}
              {p.loading && <span className="inking">Inking…</span>}
              <button className="panel-redraw" disabled={redrawing !== null || !!p.loading} onClick={() => redraw(k)} aria-label={`Redraw panel ${k + 1}`}>
                <IconRefresh size={15} /> Redraw
              </button>
            </div>
          ))}
        </div>
      </section>

      {published && (
        <Overlay>
          <div className="press-overlay" role="dialog" aria-modal="true" aria-label="Published">
            <div className="extra">
              <p className="extra-stamp">Extra! Extra!</p>
              <h2 className="display center">You're in Monday's edition</h2>
              <p className="lede center">Your page went to {state.selectedPapers.length === 1 ? '1 paper' : `${state.selectedPapers.length} papers`}. Edit it any time before Sunday 11:59 p.m.</p>
              <button className="btn btn-primary" onClick={() => { toast('Page filed with the editor'); nav('/front') }}>See the front page</button>
            </div>
          </div>
        </Overlay>
      )}
    </Screen>
  )
}

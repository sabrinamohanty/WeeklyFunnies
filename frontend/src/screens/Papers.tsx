import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { PublishedStoryCard, withStoryReaction } from '../components/EditionStories'
import { IconBookmark, IconChevron, IconClock, IconPlus, IconX } from '../components/Icons'
import { BRAND, Cover, Dots, MiniMast, Overlay, Screen, initials } from '../components/ui'
import { weekLabelFromIso } from '../data'
import { api, userMessage } from '../lib/api'
import { editionsReadyToPublish, recycleNote } from '../lib/page-flow'
import { ApiError, type EditionBundle, type EditionSummary } from '../lib/types'
import { toUiPaper, useActivePaper, useStore } from '../store'

const statusTag = { due: 'Due Sun', new: 'New', done: 'Done' } as const
const statusLine = { due: 'You haven’t posted this week', new: 'New edition ready to read', done: 'You posted this week' } as const

export function Papers() {
  const nav = useNavigate()
  const { state, set } = useStore()

  return (
    <Screen dock={<button className="btn btn-primary" onClick={() => nav('/papers/join')}>Join or start a paper</button>}>
      <MiniMast name={BRAND} back="/front" right={<button className="icon-btn" aria-label="Join or start a paper" onClick={() => nav('/papers/join')}><IconPlus /></button>} />
      <p className="kicker">Your newsstand</p>
      <h1 className="display">My papers</h1>
      <p className="lede">Each paper is its own friend group with its own weekly edition.</p>

      <div className="paper-list">
        {state.papers.length === 0 && (
          <p className="hint">No papers yet. Join with a 6-character code or start one.</p>
        )}
        {state.papers.map((p, i) => {
          const status = state.published.includes(p.id) ? 'done' : p.status
          return (
            <button key={p.id} className="card paper-card" style={{ animationDelay: `${i * 60}ms` }} onClick={() => { set({ activePaper: p.id }); nav('/front') }}>
              <div className="paper-card-top">
                <Cover mono={p.mono} swatch={p.swatch} />
                <span>
                  <b>{p.name}</b>
                  <i>{p.size ?? p.members.length} members · {p.role}</i>
                  <span>{statusLine[status]}</span>
                </span>
                <IconChevron />
              </div>
              <div className="paper-card-bottom">
                <Dots swatches={p.members} />
                <span className={`tag ${status === 'due' ? 'red' : status === 'new' ? 'ink' : ''}`}>{statusTag[status]}</span>
              </div>
            </button>
          )
        })}
      </div>

      <LogOut />
    </Screen>
  )
}

export function LogOut() {
  const nav = useNavigate()
  const { signOut } = useStore()
  return (
    <button className="link center" onClick={() => { void signOut(); nav('/welcome', { replace: true }) }}>
      Log out
    </button>
  )
}

export function JoinPaper() {
  const nav = useNavigate()
  const { state, set, toast } = useStore()
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [joining, setJoining] = useState(false)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<{ name: string; code: string } | null>(null)

  const join = async (e: FormEvent) => {
    e.preventDefault()
    const raw = code.trim().split('/').pop() ?? ''
    if (!raw) return setErr('Enter a 6-character code.')
    setJoining(true)
    setErr('')
    try {
      const { paper } = await api.joinPaper(raw)
      const ui = toUiPaper(paper, state.papers.length)
      set(s => ({ papers: s.papers.some(p => p.id === ui.id) ? s.papers : [...s.papers, ui], activePaper: ui.id }))
      toast(`You joined ${paper.name}`)
      nav('/papers')
    } catch (e) {
      setErr(e instanceof Error && 'code' in e && (e as { code: string }).code === 'not_found'
        ? 'No paper with that code. Check with your friend.'
        : userMessage(e))
    } finally {
      setJoining(false)
    }
  }

  const create = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    try {
      const { paper } = await api.createPaper(name.trim())
      const { invite } = await api.createInvite(paper.id)
      const ui = toUiPaper(paper, state.papers.length)
      set(s => ({ papers: [...s.papers, ui], activePaper: ui.id }))
      setCreated({ name: paper.name, code: invite.code })
    } catch (e) {
      toast(userMessage(e))
    } finally {
      setCreating(false)
    }
  }

  return (
    <Screen>
      <MiniMast name={BRAND} back="/papers" />
      <p className="kicker">Got an invite?</p>
      <h1 className="display">Join a paper</h1>
      <form onSubmit={e => void join(e)}>
        <label className="lede block" htmlFor="code">Paste a 6-character code</label>
        <div className="input-row">
          <input id="code" className="field code" value={code} placeholder="7KX2QM" autoCapitalize="characters" spellCheck={false}
            onChange={e => { setCode(e.target.value); setErr('') }} />
          <button className="btn btn-sm" type="submit" disabled={joining}>{joining ? 'Joining…' : 'Join'}</button>
        </div>
      </form>
      {err && <p className="error">{err}</p>}
      <p className="hint">Papers are private. You can only join with a code from a member. O reads as 0; I and L read as 1.</p>

      <div className="or-rule double"><span><i>or</i></span></div>

      <p className="kicker">Be the editor</p>
      <h2 className="display sm">Start a new paper</h2>
      {created ? (
        <section className="card pop">
          <div className="paper-card-top">
            <Cover mono={initials(created.name)} swatch="yellow" />
            <span><b>{created.name}</b><i>You're the editor</i><span>Closes Sunday 11:59 p.m.</span></span>
          </div>
          <label className="label" htmlFor="new-link">Send this code to your friends</label>
          <div className="input-row">
            <input id="new-link" className="field" readOnly value={created.code} onFocus={e => e.target.select()} />
            <button className="btn btn-sm" onClick={async () => {
              try { await navigator.clipboard.writeText(created.code); toast('Invite code copied') } catch { toast('Select the code to copy it') }
            }}>Copy</button>
          </div>
          <button className="btn" onClick={() => nav('/papers')}>Done</button>
        </section>
      ) : (
        <form className="form" onSubmit={e => void create(e)}>
          <label className="label" htmlFor="pname">Paper name</label>
          <div className="name-preview">
            <input id="pname" className="field" value={name} placeholder="e.g. Roommates Weekly" maxLength={60} onChange={e => setName(e.target.value)} />
            <Cover mono={initials(name)} swatch="yellow" size="sm" />
          </div>
          <button className="btn" type="submit" disabled={!name.trim() || creating}>{creating ? 'Creating…' : 'Create paper & get invite code'}</button>
          <p className="hint">You become the editor. Best with 4–8 friends. Editions close Sunday at 11:59 p.m.</p>
        </form>
      )}
    </Screen>
  )
}

export function BackIssues() {
  const { state, set, toast } = useStore()
  const paper = useActivePaper()
  const [editions, setEditions] = useState<EditionSummary[]>([])
  const [status, setStatus] = useState(paper ? 'Loading past editions…' : '')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [reading, setReading] = useState<EditionBundle | null>(null)
  const owner = paper?.role === 'Editor'
  const press = editionsReadyToPublish(editions)
  const onStands = editions.filter(edition => edition.status === 'published' && !edition.savedAt)
  const kept = editions.filter(edition => edition.status === 'published' && Boolean(edition.savedAt))
  const empty = !status && press.length === 0 && onStands.length === 0 && kept.length === 0

  const paperId = paper?.id
  useEffect(() => {
    if (!paperId) return
    let alive = true
    setEditions([])
    setStatus('Loading past editions…')
    api.listEditions(paperId).then(({ editions: rows }) => {
      if (!alive) return
      setEditions(rows)
      setStatus('')
    }).catch(e => {
      if (alive) setStatus(userMessage(e))
    })
    return () => { alive = false }
  }, [paperId])

  const publish = async (edition: EditionSummary) => {
    setBusyId(edition.id)
    try {
      const { edition: printed } = await api.publishEdition(edition.id)
      setEditions(rows => rows.map(row => row.id === printed.id ? printed : row))
      toast(`No. ${printed.issueNumber} is on the stands`)
    } catch (e) {
      toast(e instanceof ApiError && e.code === 'conflict'
        ? 'That edition is not ready to print. The Sunday deadline has to pass, and every panel has to finish inking.'
        : userMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  const toggleSave = async (edition: EditionSummary) => {
    const next = !edition.savedAt
    setBusyId(edition.id)
    try {
      const { edition: saved } = await api.saveEdition(edition.id, next)
      setEditions(rows => rows.map(row => row.id === saved.id ? saved : row))
      toast(next ? `No. ${saved.issueNumber} saved forever` : `No. ${saved.issueNumber} will be recycled on schedule`)
    } catch (e) {
      toast(userMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  const openEdition = async (edition: EditionSummary) => {
    setBusyId(edition.id)
    try {
      setReading((await api.editionBundle(edition.id)).bundle)
    } catch (e) {
      toast(userMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Screen>
      <MiniMast back="/front" />
      <p className="kicker">Back issues</p>
      <h1 className="display">Past editions</h1>
      <label className="label" htmlFor="paper">Paper</label>
      <select id="paper" className="field" value={state.activePaper} onChange={e => set({ activePaper: e.target.value })}>
        {state.papers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <div className="deadline">
        <IconClock size={22} />
        <p>Published editions stay for <b>14 days</b>, then they're recycled. The editor can tap <b>Save</b> to keep one forever.</p>
      </div>

      {!paper && <p className="hint">Join a paper to see its editions.</p>}
      {status && <p className="hint">{status}</p>}
      {empty && <p className="hint">No past editions yet. This week's paper is still open, and it prints after Sunday at 11:59 p.m.</p>}

      {press.length > 0 && (
        <>
          <h2 className="section-label">Ready for press</h2>
          <div className="issue-list">
            {press.map(edition => (
              <EditionCard key={edition.id} edition={edition} paperName={paper?.name ?? BRAND}
                note="The Sunday deadline has passed"
                action={owner ? (
                  <button className="btn btn-sm btn-primary" disabled={busyId === edition.id} onClick={() => void publish(edition)}>
                    {busyId === edition.id ? 'Printing…' : 'Publish'}
                  </button>
                ) : <span className="hint">Waiting for the editor</span>}
              />
            ))}
          </div>
        </>
      )}

      {onStands.length > 0 && (
        <>
          <h2 className="section-label">On the stands</h2>
          <div className="issue-list">
            {onStands.map(edition => (
              <EditionCard key={edition.id} edition={edition} paperName={paper?.name ?? BRAND}
                note={recycleNote(edition.expiresAt)} urgent
                onRead={() => void openEdition(edition)}
                save={owner ? { saved: false, busy: busyId === edition.id, onSave: () => void toggleSave(edition) } : undefined}
              />
            ))}
          </div>
        </>
      )}

      {kept.length > 0 && (
        <>
          <h2 className="section-label">Saved · kept forever</h2>
          <div className="issue-list">
            {kept.map(edition => (
              <EditionCard key={edition.id} edition={edition} paperName={paper?.name ?? BRAND} note="Kept forever"
                onRead={() => void openEdition(edition)}
                save={owner ? { saved: true, busy: busyId === edition.id, onSave: () => void toggleSave(edition) } : undefined}
              />
            ))}
          </div>
        </>
      )}

      {reading && (
        <Overlay>
          <div className="press-overlay" role="dialog" aria-modal="true" aria-label={`Issue ${reading.edition.issueNumber}`} onClick={() => setReading(null)}>
            <article className="reader pop" onClick={e => e.stopPropagation()}>
              <button className="icon-btn reader-close" aria-label="Close" onClick={() => setReading(null)}><IconX /></button>
              <div className="meta-row">
                <span>No. {reading.edition.issueNumber}</span>
                <span>{weekLabelFromIso(reading.edition.weekStart)}</span>
              </div>
              <div className="double-rule" />
              {reading.pages.length === 0 && <p className="hint">No approved pages made it into this edition.</p>}
              {reading.pages.flatMap(page => page.stories.map(story => (
                <PublishedStoryCard key={story.id} bundle={reading} page={page} story={story}
                  onReaction={(storyId, reactions, myReaction) => {
                    setReading(current => current ? withStoryReaction(current, storyId, reactions, myReaction) : current)
                    set(s => ({
                      bundle: s.bundle && s.bundle.edition.id === reading.edition.id
                        ? withStoryReaction(s.bundle, storyId, reactions, myReaction)
                        : s.bundle,
                    }))
                  }} />
              )))}
            </article>
          </div>
        </Overlay>
      )}
    </Screen>
  )
}

function EditionCard({
  edition,
  paperName,
  note,
  urgent,
  action,
  onRead,
  save,
}: {
  edition: EditionSummary
  paperName: string
  note: string
  urgent?: boolean
  action?: ReactNode
  onRead?: () => void
  save?: { saved: boolean; busy: boolean; onSave: () => void }
}) {
  return (
    <article className="card issue">
      <div className="issue-cover">
        <span className="issue-logo">{paperName}</span>
      </div>
      <div>
        <p className="eyebrow">No. {edition.issueNumber} · {weekLabelFromIso(edition.weekStart)}</p>
        <h3>{edition.status === 'published' ? 'On the stands' : 'Waiting for press'}</h3>
        <p className={`issue-note ${urgent && !save?.saved ? 'urgent' : ''}`}>{note}</p>
        <div className="btn-row">
          {onRead && <button className="btn btn-sm btn-primary" onClick={onRead}>Read</button>}
          {action}
          {save && (
            <button className={`btn btn-sm ${save.saved ? 'saved' : ''}`} aria-pressed={save.saved} disabled={save.busy} onClick={save.onSave}>
              <IconBookmark size={18} fill={save.saved ? 'currentColor' : 'none'} /> {save.saved ? 'Saved' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

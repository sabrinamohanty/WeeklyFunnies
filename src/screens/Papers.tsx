import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconBookmark, IconChevron, IconClock, IconPlus, IconX } from '../components/Icons'
import { BRAND, Cover, Dots, Halftone, Logo, MiniMast, Overlay, Screen, initials } from '../components/ui'
import { edition, findablePapers, issues, pendingInvite, savedIssues, swatchCycle, type Issue, type Paper } from '../data'
import { useActivePaper, useStore } from '../store'

const statusTag = { due: 'Due Sun', new: 'New', done: 'Done' } as const
const statusLine = { due: 'You haven’t posted this week', new: 'New edition ready to read', done: 'You posted 2 highlights' } as const

export function Papers() {
  const nav = useNavigate()
  const { state, set, toast } = useStore()

  const joinInvite = () => {
    const p = pendingInvite.paper
    set(s => ({ inviteHandled: true, activePaper: p.id, papers: [...s.papers, { ...p, role: 'Contributor', status: 'due', progress: '0 of 6 have posted' }] }))
    toast(`Welcome to ${p.name}!`)
  }

  return (
    <Screen dock={<button className="btn btn-primary" onClick={() => nav('/papers/join')}>Join or start a paper</button>}>
      <MiniMast name={BRAND} back="/front" right={<button className="icon-btn" aria-label="Join or start a paper" onClick={() => nav('/papers/join')}><IconPlus /></button>} />
      <p className="kicker">Your newsstand</p>
      <h1 className="display">My papers</h1>
      <p className="lede">Each paper is its own friend group with its own weekly edition.</p>

      <div className="paper-list">
        {state.papers.map((p, i) => {
          const status = state.published.includes(p.id) ? 'done' : p.status
          return (
            <button key={p.id} className="card paper-card" style={{ animationDelay: `${i * 60}ms` }} onClick={() => { set({ activePaper: p.id }); nav('/front') }}>
              <div className="paper-card-top">
                <Cover mono={p.mono} swatch={p.swatch} />
                <span>
                  <b>{p.name}</b>
                  <i>{p.size ?? p.members.length} members · {p.role}</i>
                  <span>{p.id === 'rw' || status !== 'done' ? statusLine[status] : 'You posted this week'}</span>
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

      {!state.inviteHandled && (
        <section className="invite-card">
          <p className="kicker">Pending invite</p>
          <p>{pendingInvite.from} invited you to <b>{pendingInvite.paper.name}</b> ({pendingInvite.paper.members.length} members)</p>
          <div className="btn-row split">
            <button className="btn btn-sm" onClick={() => { set({ inviteHandled: true }); toast('Invite declined') }}>Decline</button>
            <button className="btn btn-sm btn-primary" onClick={joinInvite}>Join</button>
          </div>
        </section>
      )}

      <LogOut />
    </Screen>
  )
}

export function LogOut() {
  const nav = useNavigate()
  const { set } = useStore()
  return (
    <button className="link center" onClick={() => { set({ authed: false }); nav('/welcome', { replace: true }) }}>
      Log out
    </button>
  )
}

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function JoinPaper() {
  const nav = useNavigate()
  const { state, set, toast } = useStore()
  const [code, setCode] = useState('')
  const [found, setFound] = useState<(typeof findablePapers)[string] | null>(null)
  const [err, setErr] = useState('')
  const [name, setName] = useState('')
  const [day, setDay] = useState('Saturday')
  const [created, setCreated] = useState<string | null>(null)

  const find = (e: FormEvent) => {
    e.preventDefault()
    const c = code.trim().split('/').pop()!.toUpperCase()
    const hit = findablePapers[c]
    setFound(hit ?? null)
    setErr(hit ? '' : c.length !== 6 ? 'Codes are 6 letters, like BOOKCL.' : 'No paper with that code. Check with your friend, or try BOOKCL.')
  }

  const join = () => {
    if (!found) return
    if (state.papers.some(p => p.id === found.id)) { toast('You’re already on this paper'); return }
    const paper: Paper = { ...found, role: 'Contributor', status: 'due', progress: `0 of ${found.members.length} have posted` }
    set(s => ({ papers: [...s.papers, paper], activePaper: paper.id }))
    toast(`You joined ${found.name}`)
    nav('/papers')
  }

  const create = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const slug = Math.random().toString(36).slice(2, 8).toUpperCase()
    const paper: Paper = {
      id: `p-${slug}`, name: name.trim(), mono: initials(name), swatch: swatchCycle[state.papers.length % swatchCycle.length]!,
      members: ['purple'], role: 'Editor', status: 'due', progress: 'Just you so far', pressDay: day,
    }
    set(s => ({ papers: [...s.papers, paper], activePaper: paper.id }))
    setCreated(`weeklyfunnies.app/join/${slug.toLowerCase()}`)
  }

  return (
    <Screen>
      <MiniMast name={BRAND} back="/papers" />
      <p className="kicker">Got an invite?</p>
      <h1 className="display">Join a paper</h1>
      <form onSubmit={find}>
        <label className="lede block" htmlFor="code">Paste an invite link or 6-letter code</label>
        <div className="input-row">
          <input id="code" className="field code" value={code} placeholder="BOOKCL" autoCapitalize="characters" spellCheck={false}
            onChange={e => { setCode(e.target.value); setErr('') }} />
          <button className="btn btn-sm" type="submit">Find</button>
        </div>
      </form>
      {err && <p className="error">{err}</p>}
      {found && (
        <section className="card found pop">
          <div className="paper-card-top">
            <Cover mono={found.mono} swatch={found.swatch} />
            <span><b>{found.name}</b><i>{found.members.length} members · editor: {found.editor}</i><span>Goes to press {found.pressDay}s</span></span>
          </div>
          <button className="btn btn-primary" onClick={join}>Join this paper</button>
        </section>
      )}
      <p className="hint">Papers are private. You can only join with an invite from a member.</p>

      <div className="or-rule double"><span><i>or</i></span></div>

      <p className="kicker">Be the editor</p>
      <h2 className="display sm">Start a new paper</h2>
      {created ? (
        <section className="card pop">
          <div className="paper-card-top">
            <Cover mono={initials(name)} swatch={swatchCycle[(state.papers.length - 1) % swatchCycle.length]!} />
            <span><b>{name}</b><i>You're the editor</i><span>Goes to press {day}s</span></span>
          </div>
          <label className="label" htmlFor="new-link">Send this to your friends</label>
          <div className="input-row">
            <input id="new-link" className="field" readOnly value={created} onFocus={e => e.target.select()} />
            <button className="btn btn-sm" onClick={async () => {
              try { await navigator.clipboard.writeText(`https://${created}`); toast('Invite link copied') } catch { toast('Select the link to copy it') }
            }}>Copy</button>
          </div>
          <button className="btn" onClick={() => nav('/papers')}>Done</button>
        </section>
      ) : (
        <form className="form" onSubmit={create}>
          <label className="label" htmlFor="pname">Paper name</label>
          <div className="name-preview">
            <input id="pname" className="field" value={name} placeholder="e.g. Roommates Weekly" maxLength={32} onChange={e => setName(e.target.value)} />
            <Cover mono={initials(name)} swatch={swatchCycle[state.papers.length % swatchCycle.length]!} size="sm" />
          </div>
          <label className="label" htmlFor="day">Goes to press every</label>
          <select id="day" className="field" value={day} onChange={e => setDay(e.target.value)}>
            {days.map(d => <option key={d}>{d}</option>)}
          </select>
          <button className="btn" type="submit" disabled={!name.trim()}>Create paper &amp; get invite link</button>
          <p className="hint">You become the editor. Best with 4–8 friends.</p>
        </form>
      )}
    </Screen>
  )
}

export function BackIssues() {
  const { state, set, toast } = useStore()
  const paper = useActivePaper()
  const [reading, setReading] = useState<Issue | null>(null)
  const all = [...issues, ...savedIssues]
  const saved = all.filter(i => state.saved.includes(i.no))

  const toggleSave = (no: number) => {
    const on = state.saved.includes(no)
    set(s => ({ saved: on ? s.saved.filter(n => n !== no) : [...s.saved, no] }))
    toast(on ? `No. ${no} will be recycled on schedule` : `No. ${no} saved forever`)
  }

  const recycleLabel = (i: Issue) => (i.no === edition.no ? 'This week’s edition' : i.recycleIn === 1 ? 'Recycled tomorrow' : `Recycled in ${i.recycleIn} days`)

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
        <p>Editions stay for <b>2 weeks</b>, then they're recycled. Tap <b>Save</b> to keep one forever.</p>
      </div>

      <h2 className="section-label">Last two weeks</h2>
      <div className="issue-list">
        {issues.map(i => (
          <IssueCard key={i.no} issue={i} paperName={paper?.name ?? BRAND} note={recycleLabel(i)} urgent={i.no !== edition.no}
            saved={state.saved.includes(i.no)} canSave={i.no !== edition.no} onRead={() => setReading(i)} onSave={() => toggleSave(i.no)} />
        ))}
      </div>

      <h2 className="section-label">Saved · kept forever</h2>
      <div className="issue-list">
        {saved.length === 0 && <p className="hint">Nothing saved yet.</p>}
        {saved.map(i => (
          <IssueCard key={i.no} issue={i} paperName={paper?.name ?? BRAND} note="Kept forever" saved canSave onRead={() => setReading(i)} onSave={() => toggleSave(i.no)} />
        ))}
      </div>

      {reading && (
        <Overlay>
          <div className="press-overlay" role="dialog" aria-modal="true" aria-label={`Issue ${reading.no}`} onClick={() => setReading(null)}>
            <article className="reader pop" onClick={e => e.stopPropagation()}>
              <button className="icon-btn reader-close" aria-label="Close" onClick={() => setReading(null)}><IconX /></button>
              <div className="meta-row"><span>No. {reading.no}</span><span>{reading.week}</span></div>
              <Logo size="md" />
              <div className="double-rule" />
              <h2 className="headline">{reading.headline}</h2>
              <Halftone swatch={reading.swatch} className="reader-photo"><span className="photo-tag">[Front page photo]</span></Halftone>
              <p className="story-body">The full archive reader is coming soon. For now, here's the front page as it ran.</p>
            </article>
          </div>
        </Overlay>
      )}
    </Screen>
  )
}

function IssueCard({ issue, paperName, note, urgent, saved, canSave, onRead, onSave }: { issue: Issue; paperName: string; note: string; urgent?: boolean; saved: boolean; canSave: boolean; onRead: () => void; onSave: () => void }) {
  return (
    <article className="card issue">
      <div className="issue-cover">
        <span className="issue-logo">{paperName}</span>
        <Halftone swatch={issue.swatch} className="issue-art" />
      </div>
      <div>
        <p className="eyebrow">No. {issue.no} · {issue.week}</p>
        <h3>{issue.headline}</h3>
        <p className={`issue-note ${urgent && !saved ? 'urgent' : ''}`}>{saved && issue.recycleIn !== Infinity ? 'Saved forever' : note}</p>
        <div className="btn-row">
          <button className="btn btn-sm btn-primary" onClick={onRead}>Read</button>
          {canSave && (
            <button className={`btn btn-sm ${saved ? 'saved' : ''}`} aria-pressed={saved} onClick={onSave}>
              <IconBookmark size={18} fill={saved ? 'currentColor' : 'none'} /> {saved ? 'Saved' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

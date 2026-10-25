import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Cartoon } from '../components/Cartoon'
import { IconBookmark, IconChevron, IconGear, IconPencil, IconPlus } from '../components/Icons'
import { BRAND, Cover, MiniMast, Screen } from '../components/ui'
import { api, userMessage } from '../lib/api'
import { ApiError } from '../lib/types'
import { useStore } from '../store'
import { lookFor } from './Onboarding'

/** Gear button that opens Settings; sits in the header of the reading pages. */
export function SettingsButton() {
  const nav = useNavigate()
  return (
    <button className="icon-btn settings-btn" aria-label="Settings" onClick={() => nav('/settings')}>
      <IconGear size={20} />
    </button>
  )
}

export function Settings() {
  const nav = useNavigate()
  const { state, set, toast, signOut } = useStore()
  const [leaving, setLeaving] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [savedCount, setSavedCount] = useState<number | null>(null)
  const onlyOne = state.papers.length <= 1
  const hasEditor = state.papers.some(p => p.role === 'Editor')

  useEffect(() => {
    let alive = true
    const ids = state.papers.map(p => p.id)
    if (ids.length === 0) {
      setSavedCount(0)
      return
    }
    Promise.all(ids.map(id => api.listEditions(id).then(({ editions }) => editions.filter(e => e.savedAt).length).catch(() => 0)))
      .then(counts => { if (alive) setSavedCount(counts.reduce((sum, n) => sum + n, 0)) })
      .catch(() => { if (alive) setSavedCount(null) })
    return () => { alive = false }
  }, [state.papers])

  const leave = async (id: string) => {
    const paper = state.papers.find(p => p.id === id)
    setBusy(true)
    try {
      await api.leavePaper(id)
      set(s => {
        const papers = s.papers.filter(p => p.id !== id)
        return {
          papers,
          activePaper: s.activePaper === id ? papers[0]?.id ?? '' : s.activePaper,
          selectedPapers: s.selectedPapers.filter(x => x !== id),
          published: s.published.filter(x => x !== id),
          bundle: s.bundle?.edition.paperId === id ? null : s.bundle,
        }
      })
      setLeaving(null)
      if (paper) toast(`You left ${paper.name}`)
    } catch (e) {
      toast(e instanceof ApiError && e.code === 'conflict'
        ? 'You can’t leave that paper. The editor stays, and you have to belong to at least one.'
        : userMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const savedLabel = savedCount === null
    ? 'Editions the editor kept'
    : `${savedCount} saved ${savedCount === 1 ? 'edition' : 'editions'}, kept forever`

  return (
    <Screen>
      <MiniMast back="/front" name={BRAND} />
      <p className="kicker">Your account</p>
      <h1 className="display">Settings</h1>

      <section className="settings-profile">
        <span className="avatar-circle c-purple">
          {state.avatarUrl
            ? <img src={state.avatarUrl} alt="" />
            : <Cartoon look={lookFor(state.avatar)} style={state.avatar.style} crop="face" />}
        </span>
        <span>
          <b>{state.profile.name.trim() || 'You'}</b>
          <i>{[state.profile.city, state.email].filter(Boolean).join(' · ') || 'Reporter'}</i>
        </span>
      </section>

      <div className="link-cards">
        <Link to="/onboarding/avatar" state={{ from: 'settings' }} className="link-card">
          <span className="settings-row"><IconPencil size={20} /><span><b>Edit my avatar</b><small>Retake your selfie or pick a new art style</small></span></span>
          <IconChevron />
        </Link>
        <Link to="/back-issues" className="link-card">
          <span className="settings-row"><IconBookmark size={20} /><span><b>Saved papers</b><small>{savedLabel}</small></span></span>
          <IconChevron />
        </Link>
        <Link to="/papers/join" className="link-card">
          <span className="settings-row"><IconPlus size={20} /><span><b>Join a paper</b><small>Use an invite code, or start your own</small></span></span>
          <IconChevron />
        </Link>
      </div>

      <h2 className="section-label">Leave a paper</h2>
      <ul className="leave-list">
        {state.papers.length === 0 && <li><span className="hint">You aren’t on a paper yet.</span></li>}
        {state.papers.map(p => {
          const editor = p.role === 'Editor'
          return (
            <li key={p.id}>
              <Cover mono={p.mono} swatch={p.swatch} size="sm" />
              {leaving === p.id ? (
                <div className="leave-confirm" role="alert">
                  <p>Leave <b>{p.name}</b>? You’ll stop getting its editions.</p>
                  <div className="btn-row">
                    <button className="btn btn-sm" disabled={busy} onClick={() => setLeaving(null)}>Cancel</button>
                    <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => void leave(p.id)}>{busy ? 'Leaving…' : 'Leave'}</button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="leave-name"><b>{p.name}</b><i>{p.size ?? p.members.length} members · {p.role}</i></span>
                  <button className="btn btn-sm" disabled={onlyOne || editor || busy} onClick={() => setLeaving(p.id)}>Leave</button>
                </>
              )}
            </li>
          )
        })}
      </ul>
      {onlyOne && state.papers.length > 0 && <p className="hint">You need to be in at least one paper. Join another before leaving this one.</p>}
      {hasEditor && <p className="hint">The editor stays with the paper.</p>}

      <button className="btn settings-logout" onClick={() => { void signOut(); nav('/welcome', { replace: true }) }}>Log out</button>
    </Screen>
  )
}

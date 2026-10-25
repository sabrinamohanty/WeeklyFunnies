import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { IconBookmark, IconChevron, IconGear, IconPencil, IconPlus } from '../components/Icons'
import { BRAND, Cover, MiniMast, Screen } from '../components/ui'
import { useStore } from '../store'
import { AvatarFace } from './Onboarding'

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
  const { state, set, toast } = useStore()
  const [leaving, setLeaving] = useState<string | null>(null)
  const onlyOne = state.papers.length <= 1

  const leave = (id: string) => {
    const paper = state.papers.find(p => p.id === id)
    set(s => {
      const papers = s.papers.filter(p => p.id !== id)
      return {
        papers,
        activePaper: s.activePaper === id ? papers[0]?.id ?? '' : s.activePaper,
        selectedPapers: s.selectedPapers.filter(x => x !== id),
        published: s.published.filter(x => x !== id),
      }
    })
    setLeaving(null)
    if (paper) toast(`You left ${paper.name}`)
  }

  return (
    <Screen>
      <MiniMast back="/front" name={BRAND} />
      <p className="kicker">Your account</p>
      <h1 className="display">Settings</h1>

      <section className="settings-profile">
        <span className="avatar-circle c-purple"><AvatarFace avatar={state.avatar} crop="face" /></span>
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
          <span className="settings-row"><IconBookmark size={20} /><span><b>Saved papers</b><small>{state.saved.length} saved {state.saved.length === 1 ? 'edition' : 'editions'}, kept forever</small></span></span>
          <IconChevron />
        </Link>
        <Link to="/papers/join" className="link-card">
          <span className="settings-row"><IconPlus size={20} /><span><b>Join a paper</b><small>Use an invite code, or start your own</small></span></span>
          <IconChevron />
        </Link>
      </div>

      <h2 className="section-label">Leave a paper</h2>
      <ul className="leave-list">
        {state.papers.map(p => (
          <li key={p.id}>
            <Cover mono={p.mono} swatch={p.swatch} size="sm" />
            {leaving === p.id ? (
              <div className="leave-confirm" role="alert">
                <p>Leave <b>{p.name}</b>? You’ll stop getting its editions.</p>
                <div className="btn-row">
                  <button className="btn btn-sm" onClick={() => setLeaving(null)}>Cancel</button>
                  <button className="btn btn-sm btn-danger" onClick={() => leave(p.id)}>Leave</button>
                </div>
              </div>
            ) : (
              <>
                <span className="leave-name"><b>{p.name}</b><i>{p.size ?? p.members.length} members · {p.role}</i></span>
                <button className="btn btn-sm" disabled={onlyOne} onClick={() => setLeaving(p.id)}>Leave</button>
              </>
            )}
          </li>
        ))}
      </ul>
      {onlyOne && <p className="hint">You need to be in at least one paper. Join another before leaving this one.</p>}

      <button className="btn settings-logout" onClick={() => { set({ authed: false }); nav('/welcome', { replace: true }) }}>Log out</button>
    </Screen>
  )
}

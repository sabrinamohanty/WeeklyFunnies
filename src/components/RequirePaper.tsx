import type { ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { BRAND, MiniMast, Screen } from './ui'
import { SettingsButton } from '../screens/Settings'
import { useActivePaper } from '../store'

/** Shown in place of any paper-specific screen once the reader has left every paper. */
function NoPapers({ tabs }: { tabs: boolean }) {
  const nav = useNavigate()
  return (
    <Screen tabs={tabs} dock={<button className="btn btn-primary" onClick={() => nav('/papers/join')}>Join or start a paper</button>}>
      <MiniMast name={BRAND} right={<SettingsButton />} />
      <div className="no-papers">
        <p className="kicker">Nothing on the newsstand</p>
        <h1 className="display">You haven’t joined any papers</h1>
        <p className="lede">Join with a friend’s invite code, or start a paper of your own.</p>
      </div>
    </Screen>
  )
}

/** Renders its screen only when the reader is in a paper; otherwise the empty state, or a redirect when given one. */
export function RequirePaper({ children, tabs = false, redirect }: { children: ReactNode; tabs?: boolean; redirect?: string }) {
  const paper = useActivePaper()
  if (paper) return <>{children}</>
  return redirect ? <Navigate to={redirect} replace /> : <NoPapers tabs={tabs} />
}

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconCheck, IconGear, IconPlus } from './Icons'
import { Cover, Overlay } from './ui'
import { useStore } from '../store'

/** How close to the left edge a swipe has to start, and how far it has to travel, to count. */
const EDGE_PX = 24
const SWIPE_PX = 60

/** Opens the drawer when a swipe starts at the left screen edge and moves right. */
export function useEdgeSwipe(onOpen: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    let start: { x: number; y: number } | null = null
    const down = (e: TouchEvent) => {
      const t = e.touches[0]
      start = t && t.clientX <= EDGE_PX ? { x: t.clientX, y: t.clientY } : null
    }
    const up = (e: TouchEvent) => {
      const t = e.changedTouches[0]
      if (start && t && t.clientX - start.x > SWIPE_PX && Math.abs(t.clientY - start.y) < SWIPE_PX) onOpen()
      start = null
    }
    window.addEventListener('touchstart', down, { passive: true })
    window.addEventListener('touchend', up, { passive: true })
    return () => { window.removeEventListener('touchstart', down); window.removeEventListener('touchend', up) }
  }, [onOpen, enabled])
}

/** Slide-in list of the reader's papers: switch between them, or join or manage them. */
export function PaperDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate()
  const { state, set } = useStore()

  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open, onClose])

  // Swiping the panel back to the left closes it.
  const swipe = { x: 0 }
  const go = (to: string) => { onClose(); nav(to) }

  return (
    <Overlay>
      <div className={`drawer-root ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="drawer-backdrop" onClick={onClose} />
        <aside className="drawer" role="dialog" aria-label="Your papers"
          onTouchStart={e => { swipe.x = e.touches[0]?.clientX ?? 0 }}
          onTouchEnd={e => { if (swipe.x - (e.changedTouches[0]?.clientX ?? swipe.x) > SWIPE_PX) onClose() }}>
          <p className="kicker">Your papers</p>
          <div className="drawer-list">
            {state.papers.map(p => {
              const active = p.id === state.activePaper
              return (
                <button key={p.id} className={`drawer-paper ${active ? 'active' : ''}`} tabIndex={open ? 0 : -1}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => { set({ activePaper: p.id }); onClose() }}>
                  <Cover mono={p.mono} swatch={p.swatch} size="sm" />
                  <span><b>{p.name}</b><i>{p.size ?? p.members.length} members · {p.role}</i></span>
                  {active && <IconCheck size={20} />}
                </button>
              )
            })}
          </div>
          <button className="btn btn-primary" tabIndex={open ? 0 : -1} onClick={() => go('/papers/join')}><IconPlus size={18} /> Join or start a paper</button>
          <button className="link center" tabIndex={open ? 0 : -1} onClick={() => go('/papers')}>Manage my papers</button>
          <button className="icon-btn drawer-gear" aria-label="Settings" tabIndex={open ? 0 : -1} onClick={() => go('/settings')}>
            <IconGear size={26} />
          </button>
        </aside>
      </div>
    </Overlay>
  )
}

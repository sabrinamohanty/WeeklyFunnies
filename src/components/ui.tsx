import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { IconBack, IconComics, IconFront, IconMoon, IconMyWeek, IconStar, IconSunSmall } from './Icons'
import { useActivePaper, useIsDark, useStore } from '../store'
import { demoNow, type Swatch } from '../data'

/** The three reading pages, for swiping and arrow keys. */
const READING = ['/front', '/comics', '/stars']

export function Screen({ children, tabs, dock, className = '' }: { children: ReactNode; tabs?: boolean; dock?: ReactNode; className?: string }) {
  const main = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  const nav = useNavigate()

  // On the reading pages, swipe or use the arrow keys to turn to the next or previous page.
  useEffect(() => {
    const at = READING.indexOf(pathname)
    if (at < 0) return
    const turn = (step: number) => {
      const to = READING[at + step]
      if (to) nav(to)
    }
    const busy = (target: EventTarget | null) =>
      !!document.querySelector('.lightbox, .press-overlay') ||
      (target instanceof Element && !!target.closest('input, textarea, select, [contenteditable], .weather-scroll, .combo'))

    let start: { x: number; y: number } | null = null
    const onStart = (e: TouchEvent) => {
      start = busy(e.target) || e.touches.length > 1 ? null : { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY }
    }
    const onEnd = (e: TouchEvent) => {
      if (!start) return
      const dx = e.changedTouches[0]!.clientX - start.x
      const dy = e.changedTouches[0]!.clientY - start.y
      start = null
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) turn(dx < 0 ? 1 : -1)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || busy(e.target)) return
      if (e.key === 'ArrowRight') turn(1)
      if (e.key === 'ArrowLeft') turn(-1)
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('keydown', onKey)
    }
  }, [pathname, nav])

  return (
    <>
      <main ref={main} className={`screen ${tabs ? 'has-tabs' : ''} ${dock ? 'has-dock' : ''} ${className}`}>{children}</main>
      {dock && <div className="dock">{dock}</div>}
      {tabs && <TabBar />}
    </>
  )
}

/** Overlays render at the body so they sit above the dock and tab bar. */
export function Overlay({ children }: { children: ReactNode }) {
  return createPortal(children, document.body)
}

export const BRAND = 'Meanwhile'

/** Nameplate. Inside a paper it shows that paper's name; before sign-in it shows the app name. */
export function Logo({ size = 'sm', name }: { size?: 'sm' | 'md' | 'lg'; name?: string }) {
  const { state } = useStore()
  const paper = useActivePaper()
  const text = name ?? (state.authed && paper ? paper.name : BRAND)
  const len = text.length > 24 ? 'xl' : text.length > 14 ? 'l' : undefined
  return <span className={`logo logo-${size}`} data-len={len}>{text}</span>
}

/** Compact header used on most inner screens. */
export function MiniMast({ back, right, rule = 'double', name }: { back?: string | true; right?: ReactNode; rule?: 'double' | 'single'; name?: string }) {
  const nav = useNavigate()
  return (
    <header className={`minimast rule-${rule}`}>
      <div className="minimast-side">
        {back && (
          <button className="icon-btn" aria-label="Back" onClick={() => (back === true ? nav(-1) : nav(back))}>
            <IconBack />
          </button>
        )}
      </div>
      <Logo name={name} />
      <div className="minimast-side right">{right}</div>
    </header>
  )
}

export function ThemeToggle() {
  const { set } = useStore()
  const dark = useIsDark()
  return (
    <button className="theme-toggle" onClick={() => set({ theme: dark ? 'light' : 'dark' })}
      aria-label={dark ? 'Switch to day edition' : 'Switch to night edition'}>
      {dark ? <IconSunSmall size={16} /> : <IconMoon size={16} />}
      <span>{dark ? 'Day' : 'Night'} ed.</span>
    </button>
  )
}

const tabs = [
  { to: '/front', label: 'Front', Icon: IconFront },
  { to: '/comics', label: 'Comics', Icon: IconComics },
  { to: '/stars', label: 'Stars', Icon: IconStar },
  { to: '/my-week', label: 'My Week', Icon: IconMyWeek },
]

export function TabBar() {
  return (
    <nav className="tabbar" aria-label="Sections">
      {tabs.map(({ to, label, Icon }) => (
        <NavLink key={to} to={to} end={to !== '/my-week'} className="tab">
          <Icon size={26} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

export function MetaRow({ left, right }: { left: ReactNode; right: ReactNode }) {
  return <div className="meta-row"><span>{left}</span><span>{right}</span></div>
}

export function StepBar({ step, label }: { step: number; label: string }) {
  return (
    <div className="stepbar">
      <MetaRow left={`Step ${step} of 3`} right={label} />
      <div className="stepbar-track" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step}>
        {[1, 2, 3].map(i => <span key={i} className={i <= step ? 'on' : ''} />)}
      </div>
    </div>
  )
}

export function Checkbox({ checked, onChange, label, className = '' }: { checked: boolean; onChange: (v: boolean) => void; label?: string; className?: string }) {
  return (
    <input type="checkbox" className={`check ${className}`} checked={checked} aria-label={label}
      onChange={e => onChange(e.target.checked)} />
  )
}

export function Halftone({ swatch, className = '', children, ...rest }: { swatch: Swatch; className?: string; children?: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return <div className={`ht c-${swatch} ${className}`} {...rest}>{children}</div>
}

export function Cover({ mono, swatch, size = 'md' }: { mono: string; swatch: Swatch; size?: 'md' | 'sm' }) {
  return (
    <Halftone swatch={swatch} className={`cover cover-${size}`}>
      <span className="cover-mono">{mono}</span>
    </Halftone>
  )
}

export function Dots({ swatches }: { swatches: Swatch[] }) {
  return (
    <div className="dots">
      {swatches.map((s, i) => <span key={i} className={`dot c-${s}`} style={{ animationDelay: `${i * 50}ms` }} />)}
    </div>
  )
}

export function OrRule({ children }: { children: ReactNode }) {
  return <div className="or-rule"><span>{children}</span></div>
}

export function useCountdown(target: Date) {
  const [now, setNow] = useState(() => demoNow().getTime())
  useEffect(() => {
    const t = window.setInterval(() => setNow(demoNow().getTime()), 1000)
    return () => window.clearInterval(t)
  }, [])
  const ms = Math.max(0, target.getTime() - now)
  const d = Math.floor(ms / 86_400_000)
  const h = Math.floor((ms / 3_600_000) % 24)
  const m = Math.floor((ms / 60_000) % 60)
  return { ms, label: ms === 0 ? 'closed' : d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m` }
}

export function initials(name: string) {
  return name.replace(/^the\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || 'WF'
}

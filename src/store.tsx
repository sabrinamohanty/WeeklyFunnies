import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { initialPapers, type Mood, type Paper, type Swatch } from './data'

export type ArtStyle = 'classic' | 'manga' | 'hero' | 'sketch'

export interface Highlight {
  id: string
  text: string
  photos: string[] // object URLs, or swatch names for demo placeholders
  serious: boolean
  inComic: boolean
}

export interface DraftStory { highlightId: string; headline: string; article: string; alt: number }
export interface DraftPanel {
  id: string; swatch: Swatch; mood: Mood; caption: string
  /** Set when the comic was drawn by the image model: the picture, and the script it came from. */
  image?: string; scene?: string; characters?: string[]; loading?: boolean
}

export interface State {
  authed: boolean
  email: string
  profile: { name: string; city: string; birthday: string }
  avatar: { style: ArtStyle; hair: number; glasses: boolean; outfit: number; /** Drawn avatar, as a server image path. */ image?: string }
  theme: 'light' | 'dark' | null
  papers: Paper[]
  /** The paper being read; its name heads every in-paper screen. */
  activePaper: string
  inviteHandled: boolean
  selectedPapers: string[]
  highlights: Highlight[]
  draft: { stories: DraftStory[]; panels: DraftPanel[] } | null
  published: string[]
  saved: number[]
}

let seq = 0
export const uid = (p = 'id') => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`

const initial: State = {
  authed: false,
  email: '',
  profile: { name: '', city: '', birthday: '' },
  avatar: { style: 'classic', hair: 0, glasses: false, outfit: 0 },
  theme: null,
  papers: initialPapers,
  activePaper: 'lc',
  inviteHandled: false,
  selectedPapers: ['lc'],
  highlights: [
    { id: 'h1', text: 'Adopted a puppy named Biscuit from the shelter on Tuesday!', photos: ['yellow', 'blue'], serious: false, inComic: true },
    { id: 'h2', text: '', photos: [], serious: false, inComic: true },
  ],
  draft: null,
  published: [],
  saved: [36],
}

const KEY = 'meanwhile:v1'
// Being signed in lasts for the browser session only, so a fresh visit starts at the welcome page.
const SESSION_KEY = 'meanwhile:session'

function signedIn() {
  try { return sessionStorage.getItem(SESSION_KEY) === '1' } catch { return false }
}

/**
 * Everything a person entered is cleared when they're signed out, so the next sign-in starts fresh.
 * Only the day/night setting is a device preference and survives.
 */
const signedOutState = (theme: State['theme']): State => ({ ...initial, theme })

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<State>) : {}
    if (!signedIn()) return signedOutState(parsed.theme ?? null)
    // Object URLs don't survive a reload, so drop uploaded photos.
    const highlights = (parsed.highlights ?? initial.highlights).map(h => ({
      ...h, photos: h.photos.filter(p => !p.startsWith('blob:')),
    }))
    return { ...initial, ...parsed, highlights, authed: true }
  } catch {
    return initial
  }
}

interface Ctx {
  state: State
  set: (patch: Partial<State> | ((s: State) => Partial<State>)) => void
  toast: (msg: string) => void
}

const StoreCtx = createContext<Ctx | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(load)
  const [toastMsg, setToastMsg] = useState<{ msg: string; key: number } | null>(null)
  const timer = useRef<number>()

  useEffect(() => {
    const { authed, ...rest } = state
    try {
      localStorage.setItem(KEY, JSON.stringify(rest))
      if (authed) sessionStorage.setItem(SESSION_KEY, '1')
      else sessionStorage.removeItem(SESSION_KEY)
    } catch { /* storage unavailable */ }
  }, [state])

  useEffect(() => {
    const root = document.documentElement
    if (state.theme) root.dataset.theme = state.theme
    else delete root.dataset.theme
  }, [state.theme])

  const set = useCallback<Ctx['set']>(patch => {
    setState(s => {
      const next = { ...s, ...(typeof patch === 'function' ? patch(s) : patch) }
      return s.authed && !next.authed ? signedOutState(next.theme) : next
    })
  }, [])

  const toast = useCallback((msg: string) => {
    window.clearTimeout(timer.current)
    setToastMsg({ msg, key: Date.now() })
    timer.current = window.setTimeout(() => setToastMsg(null), 2600)
  }, [])

  return (
    <StoreCtx.Provider value={{ state, set, toast }}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toastMsg && <div key={toastMsg.key} className="toast">{toastMsg.msg}</div>}
      </div>
    </StoreCtx.Provider>
  )
}

export function useStore() {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('useStore outside StoreProvider')
  return ctx
}

export function useActivePaper() {
  const { state } = useStore()
  return state.papers.find(p => p.id === state.activePaper) ?? state.papers[0] ?? null
}

export function useIsDark() {
  const { state } = useStore()
  const [sysDark, setSysDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => setSysDark(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return state.theme ? state.theme === 'dark' : sysDark
}

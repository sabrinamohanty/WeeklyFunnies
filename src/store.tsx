import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { initialPapers, type Mood, type Paper, type Swatch } from './data'
import { seedPaper } from './demoSeed'

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

export interface ComicComment { id: string; name: string; text: string }

export interface State {
  /** Which seed (preset roster and papers) this saved state was written against. */
  seed: number
  authed: boolean
  email: string
  profile: { name: string; city: string; birthday: string }
  avatar: { style: ArtStyle; hair: number; glasses: boolean; outfit: number; /** Drawn avatar, as a server image path. */ image?: string }
  theme: 'light' | 'dark' | null
  papers: Paper[]
  /** The paper being read; its name heads every in-paper screen. */
  activePaper: string
  selectedPapers: string[]
  highlights: Highlight[]
  /** `coverId` is the highlight chosen as the cover story; the first story leads when unset. */
  draft: { stories: DraftStory[]; panels: DraftPanel[]; coverId?: string } | null
  /** The reader's own reaction to each comic, and the comments they've left, by comic id. */
  comicReactions: Record<string, ('ha' | 'aww' | 'hooray')[]>
  comments: Record<string, ComicComment[]>
  published: string[]
  /** Papers whose finished edition was opened early with "Preview the edition". */
  previewed: string[]
  saved: number[]
}

let seq = 0
export const uid = (p = 'id') => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`

/** Bump when the preset roster or papers change, so older saved state is migrated on load. */
export const SEED_VERSION = 2

const initial: State = {
  seed: SEED_VERSION,
  authed: false,
  email: '',
  profile: { name: '', city: '', birthday: '' },
  avatar: { style: 'classic', hair: 0, glasses: false, outfit: 0 },
  theme: null,
  papers: initialPapers,
  activePaper: seedPaper.id,
  selectedPapers: [seedPaper.id],
  highlights: [
    { id: 'h1', text: '', photos: [], serious: false, inComic: true },
    { id: 'h2', text: '', photos: [], serious: false, inComic: true },
  ],
  draft: null,
  comicReactions: {},
  comments: {},
  published: [],
  previewed: [],
  saved: [],
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

/** The puppy highlight the old build seeded into every new test user. */
const OLD_SEED_HIGHLIGHT = 'Adopted a puppy named Biscuit from the shelter on Tuesday!'

/**
 * Brings state saved before the current seed up to date. The old people, papers and saved issues are dropped;
 * the test user's own profile, avatar, theme, highlights and draft are kept. Work published to the old
 * Longhorn Crew ('lc') carries over to The Snoozers, the same friend group under its new name.
 */
function migrate(parsed: Partial<State> & { published?: string[] }): Partial<State> {
  if (parsed.seed === SEED_VERSION) return parsed
  const { papers: _p, activePaper: _a, selectedPapers: _s, saved: _v, seed: _d, ...mine } = parsed as Record<string, unknown>
  const highlights = (parsed.highlights ?? []).map(h =>
    h.text === OLD_SEED_HIGHLIGHT ? { ...h, text: '', photos: [] } : { ...h, photos: h.photos.filter(p => !/^[a-z]+$/.test(p)) })
  return {
    ...(mine as Partial<State>),
    ...(parsed.highlights ? { highlights } : {}),
    published: parsed.published?.includes('lc') ? [seedPaper.id] : [],
  }
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    const stored = raw ? (JSON.parse(raw) as Partial<State>) : {}
    if (!signedIn()) return signedOutState(stored.theme ?? null)
    const parsed = migrate(stored)
    // Object URLs don't survive a reload, so drop uploaded photos.
    const highlights = (parsed.highlights ?? initial.highlights).map(h => ({
      ...h, photos: h.photos.filter(p => !p.startsWith('blob:')),
    }))
    return { ...initial, ...parsed, highlights, seed: SEED_VERSION, authed: true }
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

    // The browser/iOS chrome behind the status bar takes its tint from theme-color, so keep it in step with the paper color.
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => {
      const dark = state.theme ? state.theme === 'dark' : mq.matches
      document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
        m.removeAttribute('media')
        m.setAttribute('content', dark ? '#17140F' : '#F3EFE4')
      })
    }
    sync()
    // In the iOS app, tell the native layer too (it tints the status bar's fade). Elsewhere there's no handler.
    ;(window as unknown as { webkit?: { messageHandlers?: { theme?: { postMessage: (m: string) => void } } } })
      .webkit?.messageHandlers?.theme?.postMessage(state.theme ?? 'system')
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
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

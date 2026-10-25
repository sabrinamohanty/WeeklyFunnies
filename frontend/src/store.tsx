import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { api } from './lib/api'
import { supabase } from './lib/auth'
import { cityLabel, type Profile, type StyleKey } from './lib/types'
import { swatchCycle, type Mood, type Paper, type Swatch } from './data'

export type ArtStyle = StyleKey

export interface Highlight {
  id: string
  text: string
  photos: string[]
  serious: boolean
  inComic: boolean
}

export interface DraftStory { highlightId: string; headline: string; article: string; alt: number }
export interface DraftPanel { id: string; swatch: Swatch; mood: Mood; caption: string }

export interface ProfileForm {
  name: string
  city: string
  cityId: number | null
  birthday: string
}

export interface State {
  ready: boolean
  authed: boolean
  email: string
  profile: ProfileForm
  style: StyleKey
  avatar: { style: ArtStyle; hair: number; glasses: boolean; outfit: number }
  theme: 'light' | 'dark' | null
  papers: Paper[]
  activePaper: string
  selectedPapers: string[]
  highlights: Highlight[]
  draft: { stories: DraftStory[]; panels: DraftPanel[] } | null
  published: string[]
  saved: number[]
}

let seq = 0
export const uid = (p = 'id') => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`

const THEME_KEY = 'meanwhile:theme'
const LOCAL_KEY = 'meanwhile:local'

function emptyHighlight(): Highlight {
  return { id: uid('h'), text: '', photos: [], serious: false, inComic: true }
}

const blankProfile: ProfileForm = { name: '', city: '', cityId: null, birthday: '' }

function defaultState(theme: State['theme'] = null): State {
  return {
    ready: false,
    authed: false,
    email: '',
    profile: blankProfile,
    style: 'classic',
    avatar: { style: 'classic', hair: 0, glasses: false, outfit: 0 },
    theme,
    papers: [],
    activePaper: '',
    selectedPapers: [],
    highlights: [emptyHighlight()],
    draft: null,
    published: [],
    saved: [],
  }
}

function readTheme(): State['theme'] {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

function toUiPaper(p: { id: string; name: string; role: 'owner' | 'member'; memberCount: number }, i: number): Paper {
  const swatches = Array.from({ length: Math.min(p.memberCount, 6) }, (_, n) => swatchCycle[n % swatchCycle.length]!)
  return {
    id: p.id,
    name: p.name,
    mono: p.name.replace(/^the\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || 'WF',
    swatch: swatchCycle[i % swatchCycle.length]!,
    members: swatches,
    size: p.memberCount,
    role: p.role === 'owner' ? 'Editor' : 'Contributor',
    status: 'due',
    progress: p.memberCount <= 1 ? 'Just you so far' : `${p.memberCount} members`,
    pressDay: 'Sunday',
  }
}

function fromApiProfile(p: Profile): Pick<State, 'profile' | 'style' | 'avatar'> {
  return {
    profile: {
      name: p.name ?? '',
      city: p.city ? cityLabel(p.city) : '',
      cityId: null,
      birthday: p.birthday ?? '',
    },
    style: p.style,
    avatar: { style: p.style, hair: 0, glasses: false, outfit: 0 },
  }
}

interface Ctx {
  state: State
  set: (patch: Partial<State> | ((s: State) => Partial<State>)) => void
  toast: (msg: string) => void
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const StoreCtx = createContext<Ctx | null>(null)

async function loadAccount(session: Session | null, theme: State['theme']): Promise<State> {
  if (!session) return { ...defaultState(theme), ready: true }
  try {
    const [{ profile }, { papers }] = await Promise.all([api.me(), api.papers()])
    const ui = papers.map(toUiPaper)
    const local = readLocal()
    return {
      ...defaultState(theme),
      ready: true,
      authed: true,
      email: session.user.email ?? '',
      ...fromApiProfile(profile),
      papers: ui,
      activePaper: ui[0]?.id ?? '',
      selectedPapers: ui[0] ? [ui[0].id] : [],
      highlights: local.highlights.length ? local.highlights : [emptyHighlight()],
      draft: local.draft,
      published: local.published,
      saved: local.saved,
    }
  } catch {
    return { ...defaultState(theme), ready: true, authed: true, email: session.user.email ?? '' }
  }
}

function readLocal(): Pick<State, 'highlights' | 'draft' | 'published' | 'saved'> {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return { highlights: [], draft: null, published: [], saved: [] }
    const parsed = JSON.parse(raw) as Partial<State>
    const highlights = (parsed.highlights ?? []).map(h => ({
      ...h, photos: (h.photos ?? []).filter(p => !p.startsWith('blob:')),
    }))
    return {
      highlights,
      draft: parsed.draft ?? null,
      published: parsed.published ?? [],
      saved: parsed.saved ?? [],
    }
  } catch {
    return { highlights: [], draft: null, published: [], saved: [] }
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(() => ({ ...defaultState(readTheme()), ready: false }))
  const [toastMsg, setToastMsg] = useState<{ msg: string; key: number } | null>(null)
  const timer = useRef<number>()

  const applySession = useCallback(async (session: Session | null) => {
    const next = await loadAccount(session, readTheme())
    setState(next)
  }, [])

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (alive) void applySession(data.session)
    })
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return
      void applySession(session)
    })
    return () => {
      alive = false
      data.subscription.unsubscribe()
    }
  }, [applySession])

  useEffect(() => {
    try { if (state.theme) localStorage.setItem(THEME_KEY, state.theme); else localStorage.removeItem(THEME_KEY) } catch { /* */ }
    const root = document.documentElement
    if (state.theme) root.dataset.theme = state.theme
    else delete root.dataset.theme
  }, [state.theme])

  useEffect(() => {
    if (!state.authed) return
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify({
        highlights: state.highlights,
        draft: state.draft,
        published: state.published,
        saved: state.saved,
      }))
    } catch { /* */ }
  }, [state.authed, state.highlights, state.draft, state.published, state.saved])

  const set = useCallback<Ctx['set']>(patch => {
    setState(s => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }))
  }, [])

  const toast = useCallback((msg: string) => {
    window.clearTimeout(timer.current)
    setToastMsg({ msg, key: Date.now() })
    timer.current = window.setTimeout(() => setToastMsg(null), 2600)
  }, [])

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    await applySession(data.session)
  }, [applySession])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    try { localStorage.removeItem(LOCAL_KEY) } catch { /* */ }
    setState({ ...defaultState(readTheme()), ready: true })
  }, [])

  return (
    <StoreCtx.Provider value={{ state, set, toast, refresh, signOut }}>
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

export function isProfileReady(state: State) {
  return Boolean(state.profile.name.trim() && state.profile.city.trim() && state.profile.birthday)
}

export { toUiPaper }

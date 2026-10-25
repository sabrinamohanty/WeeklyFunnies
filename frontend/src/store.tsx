import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { api } from './lib/api'
import { supabase } from './lib/auth'
import { endSession } from './lib/session'
import { appendUnsavedHighlights, parseLocalDraft, reconcileHighlights } from './lib/page-flow'
import { cityLabel, isUuid, PAGE_LIMITS, type ApiPage, type EditionBundle, type Profile, type StyleKey } from './lib/types'
import { moodCycle, swatchCycle, type Mood, type Paper, type Swatch } from './data'

export type ArtStyle = StyleKey

export interface HighlightPhoto {
  id?: string
  url: string
  file?: File
}

export interface Highlight {
  id: string
  text: string
  photos: HighlightPhoto[]
  serious: boolean
  inComic: boolean
}

export interface DraftStory { id: string; highlightId: string; headline: string; article: string }
export interface DraftPanel {
  index: number
  swatch: Swatch
  mood: Mood
  caption: string
  url: string | null
  status: 'pending' | 'generating' | 'ready' | 'failed'
  photos: string[]
}

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
  avatarUrl: string | null
  theme: 'light' | 'dark' | null
  papers: Paper[]
  activePaper: string
  selectedPapers: string[]
  page: ApiPage | null
  bundle: EditionBundle | null
  highlights: Highlight[]
  draft: { stories: DraftStory[]; panels: DraftPanel[]; title: string } | null
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
    avatarUrl: null,
    theme,
    papers: [],
    activePaper: '',
    selectedPapers: [],
    page: null,
    bundle: null,
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

function fromApiProfile(p: Profile): Pick<State, 'profile' | 'style' | 'avatar' | 'avatarUrl'> {
  return {
    profile: {
      name: p.name ?? '',
      city: p.city ? cityLabel(p.city) : '',
      cityId: null,
      birthday: p.birthday ?? '',
    },
    style: p.style,
    avatar: { style: p.style, hair: 0, glasses: false, outfit: 0 },
    avatarUrl: p.avatarUrl,
  }
}

export function toUiHighlights(page: ApiPage | null): Highlight[] {
  if (!page?.highlights.length) return []
  return page.highlights.map(h => ({
    id: h.id,
    text: h.text,
    photos: h.photos.map(p => ({ id: p.id, url: p.url })),
    serious: h.serious,
    inComic: h.inComic,
  }))
}

export function toUiDraft(page: ApiPage | null): State['draft'] {
  if (!page || page.stories.length === 0) return null
  return {
    title: page.comic?.title ?? '',
    stories: page.stories.map(s => ({
      id: s.id,
      highlightId: s.highlightId,
      headline: s.headline,
      article: s.body,
    })),
    panels: (page.comic?.panels ?? []).map((p, i) => ({
      index: p.index,
      swatch: swatchCycle[i % swatchCycle.length]!,
      mood: moodCycle[i % moodCycle.length]!,
      caption: p.caption ?? '',
      url: p.image.url,
      status: p.image.status,
      photos: p.photos,
    })),
  }
}

export function pageFields(page: ApiPage | null, keepHighlights?: Highlight[]): Partial<State> {
  const server = toUiHighlights(page)
  const merged = keepHighlights ? reconcileHighlights(server, keepHighlights) : server
  const highlights = merged.length ? merged.slice(0, PAGE_LIMITS.highlights) : [emptyHighlight()]
  return {
    page,
    selectedPapers: page?.papers.map(p => p.paperId) ?? [],
    highlights,
    draft: toUiDraft(page),
    published: page?.status === 'approved' ? page.papers.map(p => p.paperId) : [],
  }
}

interface Ctx {
  state: State
  set: (patch: Partial<State> | ((s: State) => Partial<State>)) => void
  toast: (msg: string) => void
  refresh: () => Promise<void>
  signOut: () => Promise<void>
  loadBundle: (paperId: string) => Promise<void>
}

const StoreCtx = createContext<Ctx | null>(null)

export async function loadAccount(session: Session | null, theme: State['theme']): Promise<State> {
  if (!session) return { ...defaultState(theme), ready: true }
  try {
    const [{ profile }, { papers }, current] = await Promise.all([
      api.me(),
      api.papers(),
      api.currentPage().catch(() => ({ page: null as ApiPage | null })),
    ])
    const ui = papers.map(toUiPaper)
    const local = readLocal()
    const page = current.page
    const selected = page?.papers.map(p => p.paperId) ?? (ui[0] ? [ui[0].id] : [])
    let bundle: EditionBundle | null = null
    const paperId = selected[0] ?? ui[0]?.id
    if (paperId) {
      try {
        const { edition } = await api.currentEdition(paperId)
        bundle = (await api.editionBundle(edition.id)).bundle
      } catch { /* Front can retry */ }
    }
    return {
      ...defaultState(theme),
      ready: true,
      authed: true,
      email: session.user.email ?? '',
      ...fromApiProfile(profile),
      papers: ui,
      activePaper: paperId ?? '',
      ...pageFields(page),
      highlights: (() => {
        const saved = toUiHighlights(page)
        const merged = appendUnsavedHighlights(saved, local.highlights)
        return merged.length ? merged : [emptyHighlight()]
      })(),
      selectedPapers: selected,
      bundle,
      saved: local.saved,
    }
  } catch {
    return { ...defaultState(theme), ready: true, authed: true, email: session.user.email ?? '' }
  }
}

function readLocal(): Pick<State, 'highlights' | 'saved'> {
  try {
    return parseLocalDraft(localStorage.getItem(LOCAL_KEY))
  } catch {
    return { highlights: [], saved: [] }
  }
}

export function StoreProvider({ children, initial }: { children: ReactNode; initial?: Partial<State> }) {
  const skipSession = useRef(initial?.ready === true)
  const [state, setState] = useState<State>(() => ({ ...defaultState(readTheme()), ready: false, ...initial }))
  const [toastMsg, setToastMsg] = useState<{ msg: string; key: number } | null>(null)
  const timer = useRef<number>()

  const applySession = useCallback(async (session: Session | null) => {
    const next = await loadAccount(session, readTheme())
    setState(next)
  }, [])

  useEffect(() => {
    if (skipSession.current) return
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
        highlights: state.highlights
          .filter(h => !isUuid(h.id) && h.text.trim())
          .map(h => ({ ...h, photos: [] })),
        saved: state.saved,
      }))
    } catch { /* */ }
  }, [state.authed, state.highlights, state.saved])

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

  const loadBundle = useCallback(async (paperId: string) => {
    if (!paperId) {
      setState(s => ({ ...s, bundle: null }))
      return
    }
    try {
      const { edition } = await api.currentEdition(paperId)
      const { bundle } = await api.editionBundle(edition.id)
      setState(s => ({ ...s, bundle, activePaper: paperId }))
    } catch {
      setState(s => (s.bundle?.edition.paperId === paperId ? s : { ...s, bundle: null }))
    }
  }, [])

  const signOut = useCallback(async () => {
    await endSession(() => api.logout(), () => supabase.auth.signOut())
    try { localStorage.removeItem(LOCAL_KEY) } catch { /* */ }
    setState({ ...defaultState(readTheme()), ready: true })
  }, [])

  return (
    <StoreCtx.Provider value={{ state, set, toast, refresh, signOut, loadBundle }}>
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

export function useEditionBundle() {
  const { state, loadBundle } = useStore()
  const paperId = state.activePaper || state.papers[0]?.id || ''
  useEffect(() => {
    if (paperId) void loadBundle(paperId)
  }, [paperId, loadBundle])
  return state.bundle
}

export { toUiPaper, emptyHighlight }

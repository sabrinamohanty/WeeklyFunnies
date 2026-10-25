import { useEffect, useId, useRef, useState } from 'react'

interface Place { id: number; label: string; detail: string }

const US_STATES: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT',
  Delaware: 'DE', 'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL',
  Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT',
  Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA',
  'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT',
  Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
  'Puerto Rico': 'PR',
}

interface GeoResult { id: number; name: string; admin1?: string; admin2?: string; country?: string; country_code?: string }

/** "Austin, TX" for US cities, "Austin, Manitoba, Canada" elsewhere. */
function toPlace(r: GeoResult): Place {
  if (r.country_code === 'US') {
    const st = r.admin1 ? US_STATES[r.admin1] ?? r.admin1 : ''
    return { id: r.id, label: st ? `${r.name}, ${st}` : r.name, detail: [r.admin2, 'United States'].filter(Boolean).join(' · ') }
  }
  return { id: r.id, label: [r.name, r.admin1, r.country].filter(Boolean).join(', '), detail: r.admin2 ?? '' }
}

/** City search box backed by Open-Meteo's free geocoding API (no key, browser-friendly). */
export function CityPicker({ id, value, onChange, onPick, autoFocus }: { id: string; value: string; onChange?: (city: string) => void; onPick?: (city: string) => void; autoFocus?: boolean }) {
  const [query, setQuery] = useState(value)
  const [places, setPlaces] = useState<Place[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [status, setStatus] = useState<'idle' | 'loading' | 'empty' | 'error'>('idle')
  // The last place chosen from the list; no need to search again until the text changes.
  const [picked, setPicked] = useState(value)
  const listId = useId()
  const wrap = useRef<HTMLDivElement>(null)

  // Search as the person types, after a short pause.
  useEffect(() => {
    const q = query.trim()
    if (!open || q.length < 2 || q === picked) { setPlaces([]); setStatus('idle'); return }
    const ctrl = new AbortController()
    // Drop results for the previous text so Enter can't pick a stale match.
    setPlaces([])
    setActive(-1)
    setStatus('loading')
    const t = window.setTimeout(async () => {
      try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`, { signal: ctrl.signal })
        const j = await r.json() as { results?: GeoResult[] }
        const seen = new Set<string>()
        // The geocoder also matches on alternate names (typing "Austin" can return "Ardmore"); keep only real name matches.
        const results = (j.results ?? []).filter(r => r.name.toLowerCase().startsWith(q.toLowerCase()))
        const list = results.map(toPlace).filter(p => !seen.has(p.label) && seen.add(p.label))
        setPlaces(list)
        setActive(list.length ? 0 : -1)
        setStatus(list.length ? 'idle' : 'empty')
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setStatus('error')
      }
    }, 250)
    return () => { window.clearTimeout(t); ctrl.abort() }
  }, [query, open, picked])

  // Close when clicking anywhere else.
  useEffect(() => {
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [])

  const choose = (p: Place) => {
    setQuery(p.label)
    setPicked(p.label)
    onChange?.(p.label)
    onPick?.(p.label)
    setOpen(false)
    setPlaces([])
  }

  const showList = open && (places.length > 0 || status !== 'idle')

  return (
    <div className="combo" ref={wrap}>
      <input id={id} className="field" value={query} autoFocus={autoFocus} placeholder="Search for your city" autoComplete="off" spellCheck={false}
        role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={active >= 0 && places[active] ? `${listId}-${active}` : undefined}
        onFocus={() => setOpen(true)}
        onChange={e => { setQuery(e.target.value); onChange?.(e.target.value); setOpen(true) }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(i => Math.min(i + 1, places.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
          else if (e.key === 'Enter' && open && places[active]) { e.preventDefault(); choose(places[active]!) }
          else if (e.key === 'Escape') setOpen(false)
        }} />
      {showList && (
        <ul id={listId} className="combo-list" role="listbox">
          {places.map((p, i) => (
            <li key={p.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              className={i === active ? 'active' : ''} onPointerEnter={() => setActive(i)}
              onPointerDown={e => { e.preventDefault(); choose(p) }}>
              <b>{p.label}</b>{p.detail && <span>{p.detail}</span>}
            </li>
          ))}
          {places.length === 0 && (
            <li className="combo-note" role="presentation">
              {status === 'loading' ? 'Searching…' : status === 'empty' ? 'No places found. Check the spelling.' : 'Couldn’t search right now. You can type your city instead.'}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

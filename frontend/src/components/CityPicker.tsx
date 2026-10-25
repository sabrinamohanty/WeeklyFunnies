import { useEffect, useId, useRef, useState } from 'react'
import { api } from '../lib/api'
import { cityLabel, type CityCandidate } from '../lib/types'

export interface PickedCity {
  id: number
  label: string
}

export function CityPicker({
  id, value, onChange, onPick, autoFocus,
}: {
  id: string
  value: string
  onChange?: (city: string) => void
  onPick?: (city: PickedCity) => void
  autoFocus?: boolean
}) {
  const [query, setQuery] = useState(value)
  const [places, setPlaces] = useState<CityCandidate[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [status, setStatus] = useState<'idle' | 'loading' | 'empty' | 'error'>('idle')
  const [picked, setPicked] = useState(value)
  const listId = useId()
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => { setQuery(value) }, [value])

  useEffect(() => {
    const q = query.trim()
    if (!open || q.length < 2 || q === picked) { setPlaces([]); setStatus('idle'); return }
    const ctrl = new AbortController()
    setPlaces([])
    setActive(-1)
    setStatus('loading')
    const t = window.setTimeout(async () => {
      try {
        const { results } = await api.geocode(q)
        if (ctrl.signal.aborted) return
        setPlaces(results)
        setActive(results.length ? 0 : -1)
        setStatus(results.length ? 'idle' : 'empty')
      } catch (e) {
        if (ctrl.signal.aborted || (e as Error).name === 'AbortError') return
        setStatus('error')
      }
    }, 400)
    return () => { window.clearTimeout(t); ctrl.abort() }
  }, [query, open, picked])

  useEffect(() => {
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [])

  const choose = (c: CityCandidate) => {
    const label = cityLabel(c)
    setQuery(label)
    setPicked(label)
    onChange?.(label)
    onPick?.({ id: c.id, label })
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
              <b>{cityLabel(p)}</b>{p.country && <span>{p.country}</span>}
            </li>
          ))}
          {places.length === 0 && (
            <li className="combo-note" role="presentation">
              {status === 'loading' ? 'Searching…' : status === 'empty' ? 'No places found. Check the spelling.' : 'Couldn’t search right now. Try again in a moment.'}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

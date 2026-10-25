import { useEffect, useState } from 'react'
import type { WeatherReport } from './lib/types'

export type Sky = 'sun' | 'partly' | 'cloud' | 'rain' | 'storm'

export interface Forecast {
  location: string
  unit: 'F' | 'C'
  current: { temp: number | null; sky: string }
  days: { day: string; date?: string; high: number | null; low: number | null; sky: string }[]
}

export interface WeekDay {
  key: string
  label: string
  date: number
  today: boolean
  high: number | null
  low: number | null
  sky: Sky
  text: string
}

export function skyOf(text: string): Sky {
  const t = text.toLowerCase()
  if (/thunder|storm/.test(t)) return 'storm'
  if (/rain|shower|drizzle|snow|sleet/.test(t)) return 'rain'
  if (/partly|mostly sunny|few clouds|scattered clouds/.test(t)) return 'partly'
  if (/cloud|overcast|fog|haze|mist/.test(t)) return 'cloud'
  return 'sun'
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Weekday label for a calendar date, read as UTC so the day number does not shift. */
function calendarParts(iso: string): { label: string; date: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (Number.isNaN(utc.getTime())) return null
  return { label: DAYS[utc.getUTCDay()]!, date: utc.getUTCDate() }
}

function isoInZone(now: Date, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
    const year = parts.find(p => p.type === 'year')?.value
    const month = parts.find(p => p.type === 'month')?.value
    const day = parts.find(p => p.type === 'day')?.value
    return year && month && day ? `${year}-${month}-${day}` : null
  } catch {
    return null
  }
}

export function toWeek(f: Forecast, now = new Date(), timeZone?: string): WeekDay[] {
  const today = timeZone ? isoInZone(now, timeZone) : null
  return f.days.slice(0, 7).map((d, i) => {
    const parsed = d.date ? calendarParts(d.date) : null
    const shifted = new Date(now)
    shifted.setDate(now.getDate() + i)
    return {
      key: d.date ?? shifted.toDateString(),
      label: parsed?.label ?? DAYS[shifted.getDay()]!,
      date: parsed?.date ?? shifted.getDate(),
      today: d.date ? d.date === today : i === 0,
      high: d.high, low: d.low, sky: skyOf(d.sky), text: d.sky,
    }
  })
}

/** Austin, used when the reader has no city or that city's forecast cannot be loaded. */
export const AUSTIN_COORDS = { lat: '30.27', lon: '-97.74' }

/** Celsius forecast from GET /api/weather, rounded for the paper's day cells. */
export function fromWeather(report: WeatherReport, placeFallback: string): Forecast {
  return {
    location: report.place ?? placeFallback,
    unit: 'C',
    current: report.current
      ? { temp: Math.round(report.current.tempC), sky: report.current.summary }
      : { temp: null, sky: '' },
    days: report.days.map(d => ({
      day: d.date,
      date: d.date,
      high: Math.round(d.tempMaxC),
      low: Math.round(d.tempMinC),
      sky: d.summary,
    })),
  }
}

/** Browser location rounded to two decimals, or null when the reader declines. */
export function browserCoords(): Promise<{ lat: string; lon: string } | null> {
  const geo = navigator.geolocation
  if (!geo?.getCurrentPosition) return Promise.resolve(null)
  return new Promise(resolve => {
    let settled = false
    const finish = (value: { lat: string; lon: string } | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      resolve(value)
    }
    const timer = window.setTimeout(() => finish(null), 4000)
    try {
      geo.getCurrentPosition(
        pos => finish({
          lat: pos.coords.latitude.toFixed(2),
          lon: pos.coords.longitude.toFixed(2),
        }),
        () => finish(null),
        { timeout: 4000, maximumAge: 10 * 60_000 },
      )
    } catch {
      finish(null)
    }
  })
}

const CITY_KEY = 'meanwhile:city'
const cacheKey = (city: string) => `meanwhile:weather:${city.toLowerCase()}`
const read = <T,>(k: string): T | null => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') } catch { return null } }
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage unavailable */ } }

/**
 * Asks the browser for a position and names it the way the city search does:
 * "New York, NY" in the US, "Toronto, Ontario, Canada" elsewhere. Resolves null if unavailable.
 */
export async function locateCity(): Promise<string | null> {
  const cached = read<{ at: number; city: string }>(CITY_KEY)
  if (cached && Date.now() - cached.at < 30 * 60_000) return cached.city
  if (!('geolocation' in navigator)) return null
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10_000, maximumAge: 10 * 60_000 }))
    const { latitude, longitude } = pos.coords
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`)
    const j = await r.json()
    const name = j.city || j.locality
    if (!name) return null
    const state = String(j.principalSubdivisionCode ?? '').split('-')[1]
    const city = j.countryCode === 'US' && state
      ? `${name}, ${state}`
      : [name, j.principalSubdivision, j.countryName].filter(Boolean).join(', ')
    write(CITY_KEY, { at: Date.now(), city })
    return city
  } catch {
    return null
  }
}

type Status = 'loading' | 'ready' | 'no_key' | 'error' | 'need_city'

/** Weather for the city the reader chose in their profile. */
export function useCityWeather(city: string) {
  const [state, setState] = useState<{ status: Status; city: string; forecast: Forecast | null }>({ status: 'loading', city, forecast: null })

  useEffect(() => {
    let alive = true
    const c = city.trim()
    if (!c) { setState({ status: 'need_city', city: '', forecast: null }); return }
    const cached = read<{ at: number; forecast: Forecast }>(cacheKey(c))
    if (cached && Date.now() - cached.at < 3_600_000) {
      setState({ status: 'ready', city: c, forecast: cached.forecast })
      return
    }
    setState({ status: 'loading', city: c, forecast: null })
    ;(async () => {
      try {
        const r = await fetch(`/api/weather?city=${encodeURIComponent(c)}`)
        const body = await r.json()
        if (!alive) return
        if (!r.ok) return setState({ status: body.error === 'no_key' ? 'no_key' : 'error', city: c, forecast: null })
        write(cacheKey(c), { at: Date.now(), forecast: body })
        setState({ status: 'ready', city: c, forecast: body })
      } catch {
        if (alive) setState({ status: 'error', city: c, forecast: null })
      }
    })()
    return () => { alive = false }
  }, [city])

  return state
}

/** Shown until Phase 5 replaces the sample forecast. */
export const SAMPLE_WEATHER_NOTE = 'Sample · live weather comes from the API next'

/** Placeholder week shown when no API key is configured, so the layout can still be reviewed. */
export function sampleForecast(city: string): Forecast {
  const skies = ['Sunny', 'Partly cloudy', 'Sunny', 'Scattered showers', 'Cloudy', 'Sunny', 'Thunderstorms', 'Sunny']
  return {
    location: city, unit: 'F', current: { temp: 84, sky: 'Sunny' },
    days: skies.map((sky, i) => ({ day: '', high: 84 - (i % 3) * 2 + (i === 3 ? -6 : 0), low: 66 - (i % 2) * 3, sky })),
  }
}

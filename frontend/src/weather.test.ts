import { describe, expect, it } from 'vitest'
import type { WeatherReport } from './lib/types'
import { fromWeather, toWeek } from './weather'

const report: WeatherReport = {
  source: 'profile_city',
  place: 'Austin',
  timezone: 'America/Chicago',
  fetchedAt: '2026-10-25T04:00:00.000Z',
  current: null,
  days: [
    { date: '2026-10-24', tempMaxC: 28.6, tempMinC: 15.2, precipitationChance: null, weatherCode: 0, summary: 'Clear sky' },
    { date: '2026-10-25', tempMaxC: 19, tempMinC: 10, precipitationChance: 80, weatherCode: 95, summary: 'Thunderstorm' },
  ],
}

describe('fromWeather', () => {
  it('keeps the calendar date in the forecast timezone', () => {
    const now = new Date('2026-10-25T04:00:00.000Z')
    const week = toWeek(fromWeather(report, 'Austin'), now, 'America/Chicago')
    expect(week.map(d => ({ label: d.label, date: d.date, today: d.today, high: d.high, low: d.low, sky: d.sky }))).toEqual([
      { label: 'Sat', date: 24, today: true, high: 29, low: 15, sky: 'sun' },
      { label: 'Sun', date: 25, today: false, high: 19, low: 10, sky: 'storm' },
    ])
  })
})
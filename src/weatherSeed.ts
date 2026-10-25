// Stored forecasts for demo cities, used when the live weather API can't be reached (no key, offline, or an error).
// Days run from the day the forecast was captured; the app labels them with the real dates when it shows them.
import type { Forecast } from './weather'

/** New York, captured from Google Weather on Sunday, Oct 25, 2026. */
const newYork: Forecast = {
  location: 'New York, NY',
  unit: 'F',
  current: { temp: 48, sky: 'Clear' },
  days: [
    { day: 'Sun', high: 65, low: 46, sky: 'Sunny' },
    { day: 'Mon', high: 70, low: 47, sky: 'Sunny' },
    { day: 'Tue', high: 61, low: 46, sky: 'Sunny' },
    { day: 'Wed', high: 59, low: 46, sky: 'Partly cloudy' },
    { day: 'Thu', high: 67, low: 51, sky: 'Sunny' },
    { day: 'Fri', high: 73, low: 56, sky: 'Sunny' },
    { day: 'Sat', high: 68, low: 55, sky: 'Partly cloudy' },
    { day: 'Sun', high: 67, low: 57, sky: 'Partly cloudy' },
  ],
}

/** Austin, captured from Google Weather on Sunday, Oct 25, 2026. */
const austin: Forecast = {
  location: 'Austin, TX',
  unit: 'F',
  current: { temp: 66, sky: 'Cloudy' },
  days: [
    { day: 'Sun', high: 79, low: 59, sky: 'Cloudy' },
    { day: 'Mon', high: 81, low: 58, sky: 'Cloudy' },
    { day: 'Tue', high: 78, low: 64, sky: 'Partly cloudy' },
    { day: 'Wed', high: 81, low: 65, sky: 'Light rain' },
    { day: 'Thu', high: 79, low: 66, sky: 'Light rain' },
    { day: 'Fri', high: 74, low: 65, sky: 'Showers' },
    { day: 'Sat', high: 81, low: 66, sky: 'Light rain' },
    { day: 'Sun', high: 84, low: 70, sky: 'Partly cloudy' },
  ],
}

/** The stored forecast for a city the reader picked ("New York, NY", "New York, New York, United States", …), if there is one. */
export function seededForecast(city: string): Forecast | null {
  if (/^new york(\s+city)?(,\s*(ny|new york))?\b/i.test(city.trim())) return newYork
  if (/^austin(,\s*(tx|texas))?\b/i.test(city.trim())) return austin
  return null
}

import type { Swatch } from '../data'

// One hand-drawn glyph per sign, e.g. ../assets/zodiac/scorpio.svg
const glyphs = import.meta.glob<string>('../assets/zodiac/*.svg', { eager: true, query: '?url', import: 'default' })

/** Colored circle with the sign's zodiac glyph. Falls back to the two-letter abbreviation if a glyph is missing. */
export function SignBadge({ sign, abbr, swatch, big }: { sign: string; abbr: string; swatch: Swatch; big?: boolean }) {
  const src = glyphs[`../assets/zodiac/${sign.toLowerCase()}.svg`]
  return (
    <span className={`sign-badge ${big ? 'big' : ''} c-${swatch}`} role="img" aria-label={sign}>
      {src ? <img src={src} alt="" /> : abbr}
    </span>
  )
}

import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 24, children, ...rest }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  )
}

export const IconFront = (p: P) => <Svg {...p}><rect x="3" y="4" width="18" height="16" /><path d="M7 8h10M7 12h4M7 16h4" /><rect x="13" y="11" width="4" height="5" /></Svg>
export const IconComics = (p: P) => <Svg {...p}><rect x="3" y="4" width="8" height="16" /><rect x="13" y="4" width="8" height="7" /><rect x="13" y="13" width="8" height="7" /></Svg>
export const IconStar = (p: P) => <Svg {...p}><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" /></Svg>
export const IconPencil = (p: P) => <Svg {...p}><path d="M15.5 4.5l4 4L8 20H4v-4z" /><path d="M13 7l4 4" /></Svg>
export const IconBack = (p: P) => <Svg {...p}><path d="M15 5l-7 7 7 7" /></Svg>
export const IconChevron = (p: P) => <Svg {...p}><path d="M9 5l7 7-7 7" /></Svg>
export const IconArrow = (p: P) => <Svg {...p}><path d="M4 12h15M13 6l6 6-6 6" /></Svg>
export const IconCamera = (p: P) => <Svg {...p}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></Svg>
export const IconClock = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>
export const IconMail = (p: P) => <Svg {...p}><rect x="3" y="5" width="18" height="14" /><path d="M3 6l9 7 9-7" /></Svg>
export const IconRefresh = (p: P) => <Svg {...p}><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></Svg>
export const IconBookmark = (p: P) => <Svg {...p}><path d="M6 3h12v18l-6-4-6 4z" /></Svg>
export const IconPlus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
export const IconX = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>
export const IconCheck = (p: P) => <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7" /></Svg>
export const IconMoon = (p: P) => <Svg {...p}><path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z" /></Svg>
export const IconSunSmall = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>
export const IconShare = (p: P) => <Svg {...p}><path d="M12 15V3M7 8l5-5 5 5" /><path d="M5 12v9h14v-9" /></Svg>
export const IconEye = (p: P) => <Svg {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>
export const IconGear = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Svg>
export const IconGrip = (p: P) => <Svg {...p}><circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" /></Svg>

export function IconSun({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true" className="sun-spin">
      <circle cx="16" cy="16" r="5.5" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4
        return <line key={i} x1={16 + Math.cos(a) * 9} y1={16 + Math.sin(a) * 9} x2={16 + Math.cos(a) * 12.5} y2={16 + Math.sin(a) * 12.5} />
      })}
    </svg>
  )
}

export function IconCloud({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 3.5v1.5M4.5 12H3M6.3 6.3l1 1M17.7 6.3l-1 1" />
      <path d="M10 25h13a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.3 1.3A4 4 0 0 0 10 25z" fill="var(--paper)" />
    </svg>
  )
}

const cloudPath = 'M9 22h14a5 5 0 0 0 .6-10 7 7 0 0 0-13.2 1.6A4.3 4.3 0 0 0 9 22z'

export function SkyIcon({ sky, size = 32 }: { sky: 'sun' | 'partly' | 'cloud' | 'rain' | 'storm'; size?: number }) {
  if (sky === 'sun') return <IconSun size={size} />
  if (sky === 'partly') return <IconCloud size={size} />
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={cloudPath} fill="var(--paper)" />
      {sky === 'rain' && <path d="M12 25l-1.5 3M17 25l-1.5 3M22 25l-1.5 3" className="rain-fall" />}
      {sky === 'storm' && <path d="M17 23l-3 4h4l-2 4" />}
    </svg>
  )
}

export function IconCake({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden="true">
      <path d="M8 46h40M11 46V30h34v16" />
      <path d="M11 37c4 4 8-4 11.3 0s8 4 11.4 0 7.3-4 11.3 0" />
      <path d="M20 22v6M28 22v6M36 22v6" />
      <path d="M20 14q2 3 0 5M28 14q2 3 0 5M36 14q2 3 0 5" strokeWidth={2.4} className="flicker" />
    </svg>
  )
}

export function GoogleMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.8 6C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.5 5.8c4.4-4.1 6.8-10.1 6.8-17.3z" />
      <path fill="#FBBC05" d="M10.5 28.8A14.5 14.5 0 0 1 9.5 24c0-1.7.3-3.3.9-4.8l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6C6.6 42.6 14.6 48 24 48z" />
    </svg>
  )
}

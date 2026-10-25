import type { ArtStyle } from '../store'
import type { Look, Mood } from '../data'

interface Props {
  look: Look
  mood?: Mood
  style?: ArtStyle
  /** 'full' shows head and shoulders for panels; 'face' crops to the head for avatars. */
  crop?: 'full' | 'face'
  className?: string
}

const INK = '#1C1916'

export function Cartoon({ look, mood = 'smile', style = 'classic', crop = 'full', className }: Props) {
  const sketch = style === 'sketch'
  const stroke = sketch ? { stroke: INK, strokeWidth: 2, strokeDasharray: '3 2.5' } : { stroke: INK, strokeWidth: 3 }
  const hair = sketch ? '#7A6A5C' : look.hair
  const viewBox = crop === 'face' ? '26 32 48 48' : '0 0 100 120'

  return (
    <svg viewBox={viewBox} className={className} aria-hidden="true" preserveAspectRatio="xMidYMax meet">
      {crop === 'full' && (
        <path d="M20 121 Q20 84 50 84 Q80 84 80 121 Z" fill={sketch ? '#F3E6D6' : look.shirt} {...stroke} />
      )}
      <circle cx="50" cy="58" r="18" fill={look.skin} {...stroke} />
      {look.hat ? (
        <path d="M31.5 56 Q31 37 50 37 Q69 37 68.5 56 Q60 50 50 50 Q40 50 31.5 56 Z" fill={hair} {...stroke} />
      ) : (
        <path d="M32 58 Q30 38 50 38 Q70 38 68 58 Q64 47 52 47 Q40 47 32 58 Z" fill={hair} stroke={INK} strokeWidth={sketch ? 0 : 1.5} />
      )}
      {style === 'superhero' && <path d="M33 56 h34 v8 q-17 4 -34 0 z" fill={INK} />}
      <Eyes style={style} />
      {look.glasses && (
        <g fill="none" stroke={INK} strokeWidth={2}>
          <circle cx="43.5" cy="60" r="5" /><circle cx="56.5" cy="60" r="5" /><path d="M48.5 60h3" />
        </g>
      )}
      <Mouth mood={mood} />
    </svg>
  )
}

function Eyes({ style }: { style: ArtStyle }) {
  if (style === 'manga') {
    return (
      <g>
        <circle cx="43.5" cy="60" r="4.2" fill={INK} /><circle cx="56.5" cy="60" r="4.2" fill={INK} />
        <circle cx="45" cy="58.4" r="1.4" fill="#fff" /><circle cx="58" cy="58.4" r="1.4" fill="#fff" />
      </g>
    )
  }
  const fill = style === 'superhero' ? '#fff' : INK
  return <g fill={fill}><circle cx="44" cy="60" r="2.2" /><circle cx="56" cy="60" r="2.2" /></g>
}

function Mouth({ mood }: { mood: Mood }) {
  switch (mood) {
    case 'o': return <circle cx="50" cy="69" r="2.6" fill="none" stroke={INK} strokeWidth={2.4} />
    case 'flat': return <path d="M45 69h10" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
    case 'grin': return <path d="M43 66 Q50 76 57 66 Z" fill={INK} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
    default: return <path d="M44 67 Q50 72.5 56 67" fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
  }
}

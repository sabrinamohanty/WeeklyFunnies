import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Cartoon, FriendFace } from '../components/Cartoon'
import { SignBadge } from '../components/SignBadge'
import { IconArrow, IconCamera, IconCheck, IconRefresh, IconShare } from '../components/Icons'
import { Halftone, MiniMast, Overlay, Screen, StepBar } from '../components/ui'
import defaultAvatar from '../assets/Sabrina_AI-Hero.png'
import { crew, signFor, youColor, type Look } from '../data'
import { seedPaper } from '../demoSeed'
import { useStore, type ArtStyle, type State } from '../store'
import { CityPicker } from '../components/CityPicker'
import { locateCity } from '../weather'
import { apiStyle, generateAvatar, imageSrc, photoToDataUrl } from '../api'

export function Profile() {
  const nav = useNavigate()
  const { state, set } = useStore()
  const [p, setP] = useState(state.profile)
  const sign = p.birthday ? signFor(p.birthday) : null
  const ok = p.name.trim().length > 0
  const [located, setLocated] = useState<'idle' | 'finding' | 'filled'>('idle')

  // Start the City field at the reader's current location; they can change it to any city.
  useEffect(() => {
    if (state.profile.city) return
    let alive = true
    setLocated('finding')
    locateCity().then(city => {
      if (!alive) return
      setLocated(city ? 'filled' : 'idle')
      if (city) setP(v => (v.city ? v : { ...v, city }))
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Screen dock={<button className="btn btn-primary" disabled={!ok} onClick={() => { set({ profile: p }); nav('/onboarding/avatar') }}>Continue</button>}>
      <MiniMast />
      <StepBar step={1} label="About you" />
      <p className="kicker">Reporter profile</p>
      <h1 className="display">Tell us a little about you</h1>
      <div className="form">
        <label className="label" htmlFor="name">Name in the paper</label>
        <input id="name" className="field" value={p.name} placeholder="e.g. Alex R." autoComplete="name" maxLength={24}
          onChange={e => setP({ ...p, name: e.target.value })} />
        <p className="hint">{p.name.trim() ? <>Byline preview: <i>By {p.name.trim()}</i></> : 'Shown in bylines and on your comic strip.'}</p>

        <label className="label" htmlFor="city">City</label>
        {/* Remount once the location arrives so the box shows it. */}
        <CityPicker key={located} id="city" value={p.city} onChange={city => setP(v => ({ ...v, city }))} />
        <p className="hint">
          {located === 'finding' ? 'Finding your location…'
            : 'Your weather in the paper follows this city.'}
        </p>

        <label className="label" htmlFor="bday">Birthday</label>
        <input id="bday" className="field" type="date" value={p.birthday} max="2015-12-31" onChange={e => setP({ ...p, birthday: e.target.value })} />
        {sign ? (
          <p className="sign-chip pop">
            <SignBadge sign={sign.sign} abbr={sign.abbr} swatch={(['pink', 'yellow', 'blue', 'green', 'purple'] as const)[sign.sign.length % 5]!} />
            <span>You're {/^[AEIOU]/.test(sign.sign) ? 'an' : 'a'} <b>{sign.sign}</b>. Your horoscope is in Monday's paper.</span>
          </p>
        ) : (
          <p className="hint">Gives you a horoscope and a birthday shout-out. The year is never shown.</p>
        )}
      </div>
    </Screen>
  )
}

const styles: { id: ArtStyle; name: string }[] = [
  { id: 'classic', name: 'Retro' },
  { id: 'manga', name: 'Manga' },
  { id: 'hero', name: 'Superhero' },
  { id: 'sketch', name: 'Sketch' },
]
const hairs = ['#2A1D16', '#8A4B2A', '#D9A441', '#B8261F', '#6B5444']
const outfits = ['#E89A3A', '#4A8CC4', '#6FA36F', '#9A82C8', '#E8968A']

export function lookFor(avatar: State['avatar']): Look {
  return { skin: '#C98A5E', hair: hairs[avatar.hair]!, shirt: outfits[avatar.outfit]!, glasses: avatar.glasses }
}

const hairNames = ['black hair', 'auburn brown hair', 'blonde hair', 'bright red hair', 'dark brown hair']
const outfitNames = ['orange', 'blue', 'green', 'purple', 'pink']

/** The fixed look text the image model gets for every drawing of this person. */
export function describeLook(avatar: State['avatar']) {
  return `warm tan skin, ${hairNames[avatar.hair]}, ${avatar.glasses ? 'round glasses, ' : ''}${outfitNames[avatar.outfit]} t-shirt`
}

/** An avatar face: the drawn picture when there is one, otherwise the built-in cartoon. */
export function AvatarFace({ avatar, crop, mood }: { avatar: State['avatar']; crop?: 'full' | 'face'; mood?: 'smile' | 'grin' }) {
  return avatar.image
    ? <img src={imageSrc(avatar.image)} alt="Your cartoon avatar" />
    : <Cartoon look={lookFor(avatar)} style={avatar.style} crop={crop} mood={mood} />
}

/** Empty-state portrait: a head-and-shoulders outline with a sparkle, shown until an avatar is drawn. */
function PortraitPlaceholder({ filled }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className="portrait-ph" aria-hidden="true">
      <circle cx="50" cy="38" r="17" fill={filled ? '#1c1916' : 'none'} stroke="#1c1916" strokeWidth="3" strokeDasharray={filled ? undefined : '5 4'} />
      <path d="M17 100 Q17 66 50 66 Q83 66 83 100" fill={filled ? '#1c1916' : 'none'} stroke="#1c1916" strokeWidth="3" strokeDasharray={filled ? undefined : '5 4'} />
      <path d="M80 14 l2.4 6.6 6.6 2.4 -6.6 2.4 -2.4 6.6 -2.4 -6.6 -6.6 -2.4 6.6 -2.4z" fill="#1c1916" />
      <path d="M20 22 l1.6 4.4 4.4 1.6 -4.4 1.6 -1.6 4.4 -1.6 -4.4 -4.4 -1.6 4.4 -1.6z" fill="#1c1916" />
    </svg>
  )
}

const drawSteps = ['Sketching…', 'Inking…', 'Adding color…', 'Almost done…']

/** A pencil that scribbles a head and shoulders into the frame while the artist works. */
function DrawingProgress() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => setI(v => Math.min(v + 1, drawSteps.length - 1)), 1500)
    return () => window.clearInterval(t)
  }, [])
  return (
    <div className="drawing-progress" role="status" aria-live="polite">
      <svg viewBox="0 0 100 100" className="scribble" aria-hidden="true">
        <path className="stroke s1" pathLength={1} d="M70 38 A20 20 0 1 1 69.9 37.5" />
        <path className="stroke s2" pathLength={1} d="M17 100 Q17 66 50 66 Q83 66 83 100" />
        <g className="pencil">
          <path d="M0 0 L-3 -9 L3 -9 Z" fill="#1c1916" />
          <rect x="-3" y="-23" width="6" height="14" fill="#e6a23c" stroke="#1c1916" strokeWidth="1.2" />
          <rect x="-3" y="-27" width="6" height="4" fill="#e8968a" stroke="#1c1916" strokeWidth="1.2" />
        </g>
        <g className="spark sp1"><path d="M84 18 l2 5.5 5.5 2 -5.5 2 -2 5.5 -2 -5.5 -5.5 -2 5.5 -2z" fill="#1c1916" /></g>
        <g className="spark sp2"><path d="M16 26 l1.6 4.4 4.4 1.6 -4.4 1.6 -1.6 4.4 -1.6 -4.4 -4.4 -1.6 4.4 -1.6z" fill="#1c1916" /></g>
      </svg>
      <span key={i} className="inking">{drawSteps[i]}</span>
      <span className="draw-bar"><i /></span>
    </div>
  )
}

export function AvatarStep() {
  const nav = useNavigate()
  const { state, set, toast } = useStore()
  // Opened from Settings to change the avatar later, rather than during sign-up.
  const fromSettings = (useLocation().state as { from?: string } | null)?.from === 'settings'
  const [a, setA] = useState(state.avatar)
  const [selfie, setSelfie] = useState<string | null>(null)
  // The shrunken selfie sent to the artist. Kept in memory only, never saved.
  const photoData = useRef<string | undefined>()
  const [drawing, setDrawing] = useState(false)
  const [picking, setPicking] = useState(false)
  const [hasPhoto, setHasPhoto] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const styleName = styles.find(s => s.id === a.style)!.name

  const redraw = async (patch: Partial<State['avatar']> = {}, fresh = false) => {
    const next = { ...a, ...patch }
    setDrawing(true)
    const started = Date.now()
    let image = defaultAvatar
    try {
      const { avatarUrl } = await generateAvatar({ style: apiStyle(next.style), look: describeLook(next), photo: photoData.current, fresh })
      if (avatarUrl) image = avatarUrl
    } catch { /* No server or key, or the artist failed: the prepared default avatar stands in. */ }
    // A quick answer (or quick failure) still gets a moment of the drawing animation.
    await new Promise(r => window.setTimeout(r, Math.max(0, 2800 - (Date.now() - started))))
    setA({ ...next, image })
    setDrawing(false)
  }
  const onFile = async (f?: File) => {
    setPicking(false)
    if (!f) return
    setSelfie(URL.createObjectURL(f))
    photoData.current = await photoToDataUrl(f).catch(() => undefined)
    setHasPhoto(true)
  }
  // Choosing a style only selects it; the artist starts when the reader presses Draw.
  const pickStyle = (id: ArtStyle) => setA(v => ({ ...v, style: id }))

  return (
    <Screen dock={<button className="btn btn-primary" disabled={!a.image || drawing} onClick={() => {
      set({ avatar: a })
      if (fromSettings) { toast('Avatar updated'); nav('/settings') } else nav('/onboarding/joined')
    }}>{a.image || drawing ? 'Looks like me!' : 'Add a selfie to continue'}</button>}>
      <MiniMast back={fromSettings ? '/settings' : '/onboarding/profile'} />
      {!fromSettings && <StepBar step={2} label="Your avatar" />}
      <p className="kicker">Staff portrait</p>
      <h1 className="display">Become a cartoon</h1>
      <p className="lede">Take a selfie, pick an art style, and we'll draw the character who stars in your comic strip.</p>

      <div className="portrait-row">
        <figure>
          <button className={`portrait selfie ${selfie ? '' : 'empty'}`} onClick={() => setPicking(true)} aria-label={selfie ? 'Change your selfie' : 'Add a selfie'}>
            {selfie ? <img src={selfie} alt="Your selfie" /> : (
              <>
                <PortraitPlaceholder />
                <span className="add-badge"><IconCamera size={22} /> Add selfie</span>
              </>
            )}
          </button>
          <figcaption>Your selfie</figcaption>
        </figure>
        <IconArrow size={28} />
        <figure>
          <Halftone swatch={a.style === 'sketch' ? 'gray' : a.style === 'hero' ? 'blue' : 'yellow'} className={`portrait art ${drawing ? 'drawing' : ''}`}>
            {a.image
              ? <img src={imageSrc(a.image)} alt="Your cartoon avatar" onError={e => { if (!e.currentTarget.src.includes('Sabrina_AI-Hero')) setA(v => ({ ...v, image: defaultAvatar })) }} />
              : <PortraitPlaceholder filled />}
            {drawing && <DrawingProgress />}
          </Halftone>
          <figcaption>{styleName}</figcaption>
        </figure>
      </div>

      <h2 className="section-label">Pick an art style</h2>
      <div className="style-grid" role="radiogroup" aria-label="Art style">
        {styles.map(s => (
          <button key={s.id} role="radio" aria-checked={a.style === s.id} className={`style-card ${a.style === s.id ? 'selected' : ''}`}
            onClick={() => pickStyle(s.id)}>
            <b>{s.name}</b>
            {a.style === s.id && <span className="selected-badge"><IconCheck size={16} /></span>}
          </button>
        ))}
      </div>

      <div className="stack">
        {/* Draw is for the first portrait only; after that it's Redraw or approve. */}
        <button className="btn btn-primary" disabled={drawing || !hasPhoto || !!a.image} onClick={() => redraw({}, true)}>{drawing ? 'Drawing…' : 'Draw'}</button>
        <button className="btn" disabled={drawing || !hasPhoto || !a.image} onClick={() => redraw({}, true)}><IconRefresh size={18} /> Redraw</button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="user" hidden onChange={e => { onFile(e.target.files?.[0]); e.target.value = '' }} />
      <input ref={libraryRef} type="file" accept="image/*" hidden onChange={e => { onFile(e.target.files?.[0]); e.target.value = '' }} />
      <p className="hint">We delete your selfie as soon as you approve your avatar.</p>

      {picking && (
        <Overlay>
          <div className="press-overlay sheet-overlay" role="dialog" aria-modal="true" aria-label="Add a selfie" onClick={() => setPicking(false)}>
            <div className="sheet pop" onClick={e => e.stopPropagation()}>
              <button className="btn btn-primary" onClick={() => cameraRef.current?.click()}><IconCamera size={22} /> Take a photo</button>
              <button className="btn" onClick={() => libraryRef.current?.click()}>Choose from library</button>
              <button className="link center" onClick={() => setPicking(false)}>Cancel</button>
            </div>
          </div>
        </Overlay>
      )}
    </Screen>
  )
}

export function Joined() {
  const nav = useNavigate()
  const { state, toast } = useStore()
  const link = 'weeklyfunnies.app/join/abc123'
  const editor = crew.find(f => f.role === 'Editor') ?? crew[0]

  const copy = async () => {
    try { await navigator.clipboard.writeText(`https://${link}`); toast('Invite link copied') }
    catch {
      // Older webviews block the clipboard API; selecting the field and copying works there.
      const el = document.getElementById('invite') as HTMLInputElement | null
      el?.select()
      toast(document.execCommand?.('copy') ? 'Invite link copied' : 'Invite link selected')
    }
  }
  const share = async () => {
    try { await navigator.share({ title: `Join ${seedPaper.name}`, url: `https://${link}` }) } catch { /* dismissed */ }
  }

  return (
    <Screen dock={
      <>
        <button className="btn btn-primary" onClick={() => nav('/front')}>Go to {seedPaper.name}</button>
        <button className="link center" onClick={() => nav('/my-week')}>Or add my highlights first</button>
      </>
    }>
      <MiniMast back="/onboarding/avatar" />
      <StepBar step={3} label="Join" />
      <p className="kicker">Breaking news</p>
      <h1 className="display stamp-in">You're on the staff!</h1>
      <p className="lede">{editor?.first ?? 'Your editor'} invited you to <b>{seedPaper.name}</b>. New editions go to press every {seedPaper.pressDay}.</p>

      <section className="masthead-list">
        <h2 className="section-label">Masthead · {crew.length + 1} contributors</h2>
        <ul>
          {crew.map((f, i) => (
            <li key={f.id} style={{ animationDelay: `${i * 70}ms` }}>
              <span className={`avatar-circle c-${f.color}`}><FriendFace friend={f} /></span>
              <b>{f.name}</b><i>{f.role}</i>
            </li>
          ))}
          <li className="you" style={{ animationDelay: '280ms' }}>
            <span className={`avatar-circle c-${youColor}`}><AvatarFace avatar={state.avatar} crop="face" /></span>
            <b>{state.profile.name.trim() || 'You'}</b><i className="new-hire">New hire</i>
          </li>
        </ul>
      </section>

      <label className="label" htmlFor="invite">Invite more friends</label>
      <div className="input-row">
        <input id="invite" className="field" readOnly value={link} onFocus={e => e.target.select()} />
        <button className="btn btn-sm" onClick={copy}>Copy</button>
        {'share' in navigator && <button className="btn btn-sm icon-only" aria-label="Share" onClick={share}><IconShare size={20} /></button>}
      </div>
    </Screen>
  )
}

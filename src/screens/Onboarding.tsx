import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Cartoon } from '../components/Cartoon'
import { SignBadge } from '../components/SignBadge'
import { IconArrow, IconCamera, IconCheck, IconRefresh, IconShare } from '../components/Icons'
import { Halftone, MiniMast, Screen, StepBar } from '../components/ui'
import { friends, signFor, type Look } from '../data'
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
        <input id="name" className="field" value={p.name} placeholder="e.g. Diego R." autoComplete="name" maxLength={24}
          onChange={e => setP({ ...p, name: e.target.value })} />
        <p className="hint">{p.name.trim() ? <>Byline preview: <i>By {p.name.trim()}</i></> : 'Shown in bylines and on your comic strip.'}</p>

        <label className="label" htmlFor="city">City</label>
        {/* Remount once the location arrives so the box shows it. */}
        <CityPicker key={located} id="city" value={p.city} onChange={city => setP(v => ({ ...v, city }))} />
        <p className="hint">
          {located === 'finding' ? 'Finding your location…'
            : located === 'filled' ? 'Filled in from your location. Pick any city; your weather follows it.'
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
  { id: 'classic', name: 'Classic strip' },
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
  const [mood, setMood] = useState<'smile' | 'grin'>('smile')
  const cameraRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const styleName = styles.find(s => s.id === a.style)!.name

  const redraw = async (patch: Partial<State['avatar']> = {}, fresh = false) => {
    const next = { ...a, ...patch }
    setDrawing(true)
    try {
      const { avatarUrl } = await generateAvatar({ style: apiStyle(next.style), look: describeLook(next), photo: photoData.current, fresh })
      setA({ ...next, image: avatarUrl })
    } catch {
      // No server or key yet: keep the built-in cartoon so the screen still works.
      setA({ ...next, image: undefined })
      toast("Couldn't reach the artist. Showing the sketch version.")
    }
    setMood(m => (m === 'smile' ? 'grin' : 'smile'))
    setDrawing(false)
  }
  const onFile = async (f?: File) => {
    if (!f) return
    setSelfie(URL.createObjectURL(f))
    photoData.current = await photoToDataUrl(f).catch(() => undefined)
    redraw({}, true)
  }

  return (
    <Screen dock={<button className="btn btn-primary" onClick={() => {
      set({ avatar: a })
      if (fromSettings) { toast('Avatar updated'); nav('/settings') } else nav('/onboarding/joined')
    }}>Looks like me!</button>}>
      <MiniMast back={fromSettings ? '/settings' : '/onboarding/profile'} />
      {!fromSettings && <StepBar step={2} label="Your avatar" />}
      <p className="kicker">Staff portrait</p>
      <h1 className="display">Become a cartoon</h1>
      <p className="lede">Take a selfie, pick an art style, and we'll draw the character who stars in your comic strip.</p>

      <div className="portrait-row">
        <figure>
          <button className="ht c-gray portrait selfie" onClick={() => cameraRef.current?.click()} aria-label="Take a selfie">
            {selfie ? <img src={selfie} alt="Your selfie" /> : <IconCamera size={52} />}
          </button>
          <figcaption>Your selfie</figcaption>
        </figure>
        <IconArrow size={28} />
        <figure>
          <Halftone swatch={a.style === 'sketch' ? 'gray' : a.style === 'hero' ? 'blue' : 'yellow'} className={`portrait art ${drawing ? 'drawing' : ''}`}>
            <AvatarFace avatar={a} mood={mood} />
            {drawing && <span className="inking">Inking…</span>}
          </Halftone>
          <figcaption>{styleName}</figcaption>
        </figure>
      </div>

      <h2 className="section-label">Pick an art style</h2>
      <div className="style-grid" role="radiogroup" aria-label="Art style">
        {styles.map(s => (
          <button key={s.id} role="radio" aria-checked={a.style === s.id} className={`style-card ${a.style === s.id ? 'selected' : ''}`}
            onClick={() => a.style !== s.id && redraw({ style: s.id })}>
            <b>{s.name}</b>
            {a.style === s.id && <span className="selected-badge"><IconCheck size={16} /></span>}
          </button>
        ))}
      </div>

      <div className="btn-row three">
        <button className="btn btn-sm" onClick={() => cameraRef.current?.click()}>Take selfie</button>
        <button className="btn btn-sm" onClick={() => uploadRef.current?.click()}>Upload</button>
        <button className="btn btn-sm" disabled={drawing} onClick={() => redraw({}, true)}><IconRefresh size={18} /> Redraw</button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="user" hidden onChange={e => onFile(e.target.files?.[0])} />
      <input ref={uploadRef} type="file" accept="image/*" hidden onChange={e => onFile(e.target.files?.[0])} />

      <h2 className="subhead">Not quite you? Tweak it</h2>
      <div className="chips">
        <button className="chip" onClick={() => setA({ ...a, hair: (a.hair + 1) % hairs.length })}>
          <span className="chip-swatch" style={{ background: hairs[a.hair] }} /> Hair
        </button>
        <button className={`chip ${a.glasses ? 'on' : ''}`} aria-pressed={a.glasses} onClick={() => setA({ ...a, glasses: !a.glasses })}>Glasses</button>
        <button className="chip" onClick={() => setA({ ...a, outfit: (a.outfit + 1) % outfits.length })}>
          <span className="chip-swatch" style={{ background: outfits[a.outfit] }} /> Outfit
        </button>
      </div>
      <p className="hint">We delete your selfie as soon as you approve your avatar.</p>
    </Screen>
  )
}

export function Joined() {
  const nav = useNavigate()
  const { state, toast } = useStore()
  const link = 'weeklyfunnies.app/join/abc123'
  const crew = ['lauren', 'diego', 'maya', 'priya'].map(id => friends[id]!)

  const copy = async () => {
    try { await navigator.clipboard.writeText(`https://${link}`); toast('Invite link copied') }
    catch { toast('Copy failed. Select the link to copy it.') }
  }
  const share = async () => {
    try { await navigator.share({ title: 'Join The Longhorn Crew', url: `https://${link}` }) } catch { /* dismissed */ }
  }

  return (
    <Screen dock={
      <>
        <button className="btn btn-primary" onClick={() => nav('/front')}>Read this week's edition</button>
        <button className="link center" onClick={() => nav('/my-week')}>Or add my highlights first</button>
      </>
    }>
      <MiniMast back="/onboarding/avatar" />
      <StepBar step={3} label="Join" />
      <p className="kicker">Breaking news</p>
      <h1 className="display stamp-in">You're on the staff!</h1>
      <p className="lede">Lauren invited you to <b>The Longhorn Crew</b>. New editions go to press every Saturday.</p>

      <section className="masthead-list">
        <h2 className="section-label">Masthead · 5 contributors</h2>
        <ul>
          {crew.map((f, i) => (
            <li key={f.id} style={{ animationDelay: `${i * 70}ms` }}>
              <span className={`avatar-circle c-${f.color}`}><Cartoon look={f.look} crop="face" /></span>
              <b>{f.name}</b><i>{f.id === 'lauren' ? 'Editor' : 'Contributor'}</i>
            </li>
          ))}
          <li className="you" style={{ animationDelay: '280ms' }}>
            <span className="avatar-circle c-purple"><AvatarFace avatar={state.avatar} crop="face" /></span>
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

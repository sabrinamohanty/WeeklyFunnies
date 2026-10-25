import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cartoon } from '../components/Cartoon'
import { SignBadge } from '../components/SignBadge'
import { IconArrow, IconCamera, IconCheck, IconRefresh } from '../components/Icons'
import { Halftone, MiniMast, Screen, StepBar } from '../components/ui'
import { signFor, type Look } from '../data'
import { api, userMessage } from '../lib/api'
import { useStore, type ArtStyle, type State } from '../store'
import { CityPicker } from '../components/CityPicker'

export function Profile() {
  const nav = useNavigate()
  const { state, set } = useStore()
  const [p, setP] = useState(state.profile)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const sign = p.birthday ? signFor(p.birthday) : null
  const ok = p.name.trim().length > 0 && p.cityId !== null && Boolean(p.birthday)

  const save = async () => {
    if (!ok || p.cityId === null) return
    setBusy(true)
    setErr('')
    try {
      const { profile } = await api.updateMe({ name: p.name.trim(), cityId: p.cityId, birthday: p.birthday })
      set({
        profile: { ...p, name: profile.name ?? p.name, city: p.city, cityId: p.cityId, birthday: profile.birthday ?? p.birthday },
      })
      nav('/onboarding/avatar')
    } catch (e) {
      setErr(userMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen dock={<button className="btn btn-primary" disabled={!ok || busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Continue'}</button>}>
      <MiniMast />
      <StepBar step={1} label="About you" />
      <p className="kicker">Reporter profile</p>
      <h1 className="display">Tell us a little about you</h1>
      <div className="form">
        <label className="label" htmlFor="name">Name in the paper</label>
        <input id="name" className="field" value={p.name} placeholder="e.g. Diego R." autoComplete="name" maxLength={60}
          onChange={e => setP({ ...p, name: e.target.value })} />
        <p className="hint">{p.name.trim() ? <>Byline preview: <i>By {p.name.trim()}</i></> : 'Shown in bylines and on your comic strip.'}</p>

        <label className="label" htmlFor="city">City</label>
        <CityPicker id="city" value={p.city} onChange={city => setP(v => ({ ...v, city, cityId: city === v.city ? v.cityId : null }))}
          onPick={c => setP(v => ({ ...v, city: c.label, cityId: c.id }))} />
        <p className="hint">Pick a city from the list. The year of your birthday is never shown to others.</p>

        <label className="label" htmlFor="bday">Birthday</label>
        <input id="bday" className="field" type="date" value={p.birthday} max={new Date().toISOString().slice(0, 10)} min="1900-01-01"
          onChange={e => setP({ ...p, birthday: e.target.value })} />
        {sign ? (
          <p className="sign-chip pop">
            <SignBadge sign={sign.sign} abbr={sign.abbr} swatch={(['pink', 'yellow', 'blue', 'green', 'purple'] as const)[sign.sign.length % 5]!} />
            <span>You're {/^[AEIOU]/.test(sign.sign) ? 'an' : 'a'} <b>{sign.sign}</b>. Your horoscope is in Monday's paper.</span>
          </p>
        ) : (
          <p className="hint">Gives you a horoscope and a birthday shout-out. The year is never shown.</p>
        )}
        {err && <p className="error">{err}</p>}
      </div>
    </Screen>
  )
}

const styles: { id: ArtStyle; name: string }[] = [
  { id: 'classic', name: 'Classic strip' },
  { id: 'manga', name: 'Manga' },
  { id: 'superhero', name: 'Superhero' },
  { id: 'sketch', name: 'Sketch' },
]
const hairs = ['#2A1D16', '#8A4B2A', '#D9A441', '#B8261F', '#6B5444']
const outfits = ['#E89A3A', '#4A8CC4', '#6FA36F', '#9A82C8', '#E8968A']

export function lookFor(avatar: State['avatar']): Look {
  return { skin: '#C98A5E', hair: hairs[avatar.hair]!, shirt: outfits[avatar.outfit]!, glasses: avatar.glasses }
}

export function AvatarStep() {
  const nav = useNavigate()
  const { state, set, toast } = useStore()
  const [a, setA] = useState(state.avatar)
  const [selfie, setSelfie] = useState<string | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [mood, setMood] = useState<'smile' | 'grin'>('smile')
  const cameraRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const look = lookFor(a)
  const styleName = styles.find(s => s.id === a.style)!.name

  const redraw = (patch: Partial<State['avatar']> = {}) => {
    setDrawing(true)
    window.setTimeout(() => { setA(v => ({ ...v, ...patch })); setMood(m => (m === 'smile' ? 'grin' : 'smile')); setDrawing(false) }, 650)
  }
  const onFile = (f?: File) => {
    if (!f) return
    setSelfie(URL.createObjectURL(f))
    redraw()
  }

  return (
    <Screen dock={<button className="btn btn-primary" onClick={() => void (async () => {
      set({ avatar: a, style: a.style })
      try { await api.updateMe({ style: a.style }) } catch (e) { toast(userMessage(e)) }
      nav('/onboarding/joined')
    })()}>Looks like me!</button>}>
      <MiniMast back="/onboarding/profile" />
      <StepBar step={2} label="Your avatar" />
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
          <Halftone swatch={a.style === 'sketch' ? 'gray' : a.style === 'superhero' ? 'blue' : 'yellow'} className={`portrait art ${drawing ? 'drawing' : ''}`}>
            <Cartoon look={look} style={a.style} mood={mood} />
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
        <button className="btn btn-sm" onClick={() => redraw()}><IconRefresh size={18} /> Redraw</button>
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
  const { state } = useStore()
  const paper = state.papers[0]

  return (
    <Screen dock={
      <>
        {paper
          ? <button className="btn btn-primary" onClick={() => nav('/front')}>Read this week's edition</button>
          : <button className="btn btn-primary" onClick={() => nav('/papers/join')}>Join or start a paper</button>}
        <button className="link center" onClick={() => nav(paper ? '/my-week' : '/papers')}>
          {paper ? 'Or add my highlights first' : 'See my newsstand'}
        </button>
      </>
    }>
      <MiniMast back="/onboarding/avatar" />
      <StepBar step={3} label="Join" />
      <p className="kicker">Breaking news</p>
      <h1 className="display stamp-in">You're on the staff!</h1>
      <p className="lede">
        {paper
          ? <>You're on <b>{paper.name}</b>. Editions close Sunday at 11:59 p.m.</>
          : <>Your profile is saved. Join a paper with a 6-character code, or start one and invite friends.</>}
      </p>

      <section className="masthead-list">
        <h2 className="section-label">You</h2>
        <ul>
          <li className="you">
            <span className="avatar-circle c-purple"><Cartoon look={lookFor(state.avatar)} style={state.avatar.style} crop="face" /></span>
            <b>{state.profile.name.trim() || 'You'}</b><i className="new-hire">{paper ? paper.role : 'New hire'}</i>
          </li>
        </ul>
      </section>
    </Screen>
  )
}

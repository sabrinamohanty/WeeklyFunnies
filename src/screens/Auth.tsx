import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GoogleMark, IconEye, IconMail } from '../components/Icons'
import { BRAND, Halftone, Logo, MiniMast, OrRule, Screen } from '../components/ui'
import { crew } from '../data'
import { seedPaper } from '../demoSeed'
import { useStore } from '../store'
import classicPreview from '../assets/preview/classic.svg'
import mangaPreview from '../assets/preview/manga.svg'
import sketchPreview from '../assets/preview/sketch.svg'
import laurenPortrait from '../assets/lauren.png'
import heroPreview from '../assets/preview/superhero.svg'

// Generic sample front pages for the welcome animation. Deliberately separate from the seeded paper's stories in data.ts.
const previewArt = [
  { src: classicPreview, label: 'Retro', section: 'Pets', headline: 'Local woman excited to get New Cat!' },
  { src: mangaPreview, label: 'Manga', section: 'Social', headline: 'Jenny Gets Engaged!' },
  { src: sketchPreview, label: 'Painterly sketch', section: 'Food', headline: 'Sam Day Dreams About Some Great Food' },
  { src: heroPreview, label: 'Superhero comic', section: 'Sports', headline: 'John Runs First Marathon!' },
]

export function Welcome() {
  const nav = useNavigate()
  return (
    <Screen className="welcome">
      <header className="masthead">
        <div className="meta-row"><span>Vol. 1 · No. 1</span><span>Free to friends</span></div>
        <h1 className="nameplate"><Logo size="lg" name={BRAND} /></h1>
        <div className="double-rule" />
        <p className="eyebrow center">Extra! Extra! Your friends' week, in print</p>
      </header>
      <PressPreview />
      <p className="pitch">Write a few highlights. Get a newspaper and a comic strip about your whole crew.</p>
      <div className="invite-row">
        <span className="avatar-circle c-pink"><img src={laurenPortrait} alt="Lauren" /></span>
        <p>{crew.find(f => f.role === 'Editor')?.first ?? 'A friend'} invited you to <b>{seedPaper.name}</b></p>
      </div>
      <div className="stack">
        <button className="btn btn-primary" onClick={() => nav('/signup')}>Create account</button>
        <button className="btn" onClick={() => nav('/login')}>I already have an account</button>
      </div>
    </Screen>
  )
}

/** Animated stand-in for the front page: a tiny paper that keeps reprinting this week's headlines. */
function PressPreview() {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = window.setInterval(() => setI(v => (v + 1) % previewArt.length), 3200)
    return () => window.clearInterval(t)
  }, [])
  const art = previewArt[i]!
  return (
    <Halftone swatch="yellow" className="press-preview" aria-label="Preview of a front page">
      <div key={i} className="mini-paper">
        <div className="mini-logo">{BRAND}</div>
        <div className="mini-rule" />
        <div className="mini-kicker">{art.section} · {art.label}</div>
        <div className="mini-headline">{art.headline}</div>
        <div className="mini-body">
          <div className="mini-photo"><img src={art.src} alt={`${art.label} avatar illustration`} /></div>
          <div className="mini-lines"><i /><i /><i /><i /><i style={{ width: '60%' }} /></div>
        </div>
      </div>
    </Halftone>
  )
}

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

function GoogleButton() {
  const nav = useNavigate()
  const { set } = useStore()
  return (
    <button className="btn btn-google" onClick={() => { set({ authed: true, email: 'you@gmail.com' }); nav('/onboarding/profile') }}>
      <GoogleMark /> Continue with Google
    </button>
  )
}

function PasswordField({ value, onChange, placeholder, autoComplete, showMeter }: { value: string; onChange: (v: string) => void; placeholder: string; autoComplete: string; showMeter?: boolean }) {
  const [show, setShow] = useState(false)
  const score = [value.length >= 8, /[A-Z]/.test(value) && /[a-z]/.test(value), /\d|[^\w]/.test(value)].filter(Boolean).length
  return (
    <>
      <div className="field-wrap">
        <input id="password" className="field" type={show ? 'text' : 'password'} value={value} placeholder={placeholder}
          autoComplete={autoComplete} onChange={e => onChange(e.target.value)} />
        <button type="button" className="field-action" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow(s => !s)}>
          <IconEye size={20} />
        </button>
      </div>
      {showMeter && value && (
        <div className="meter" aria-live="polite">
          <div className="meter-track">{[0, 1, 2].map(i => <span key={i} className={i < score ? `on s${score}` : ''} />)}</div>
          <span>{value.length < 8 ? `${8 - value.length} more characters` : ['', 'Fine', 'Good', 'Front-page worthy'][score]}</span>
        </div>
      )}
    </>
  )
}

export function SignUp() {
  const nav = useNavigate()
  const { set } = useStore()
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [touched, setTouched] = useState(false)
  const valid = emailOk(email) && pw.length >= 8

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!valid) return
    set({ authed: true, email })
    nav('/onboarding/profile')
  }

  return (
    <Screen>
      <MiniMast back="/welcome" />
      <p className="kicker">Join the staff</p>
      <h1 className="display">Create your account</h1>
      <p className="lede">You'll join <b>{seedPaper.name}</b> right after.</p>
      <GoogleButton />
      <OrRule><i>or use email</i></OrRule>
      <form className="form" onSubmit={submit} noValidate>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" className="field" type="email" value={email} placeholder="you@example.com" autoComplete="email"
          aria-invalid={touched && !emailOk(email)} onChange={e => setEmail(e.target.value)} />
        {touched && !emailOk(email) && <p className="error">That doesn't look like an email address.</p>}
        <label className="label" htmlFor="password">Password</label>
        <PasswordField value={pw} onChange={setPw} placeholder="At least 8 characters" autoComplete="new-password" showMeter />
        <button className="btn btn-primary" type="submit">Create account</button>
      </form>
      <button className="link center" onClick={() => { set({ email: emailOk(email) ? email : '' }); nav('/check-email') }}>
        Skip the password: email me a sign-in link
      </button>
      <div className="foot">
        <p className="fine">By continuing you agree to the <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>. Photos are only visible to people in your paper.</p>
        <p>Already have an account? <Link to="/login" className="link strong">Log in</Link></p>
      </div>
    </Screen>
  )
}

export function Login() {
  const nav = useNavigate()
  const { set } = useStore()
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!emailOk(email)) return setErr('Enter the email you signed up with.')
    if (!pw) return setErr('Enter your password.')
    set({ authed: true, email })
    nav('/front')
  }

  return (
    <Screen>
      <MiniMast back="/welcome" />
      <p className="kicker">Subscribers</p>
      <h1 className="display">Welcome back</h1>
      <p className="lede">Log in to read this week's edition.</p>
      <GoogleButton />
      <OrRule><i>or use email</i></OrRule>
      <form className="form" onSubmit={submit} noValidate>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" className="field" type="email" value={email} placeholder="you@example.com" autoComplete="email" onChange={e => { setEmail(e.target.value); setErr('') }} />
        <div className="label-row">
          <label className="label" htmlFor="password">Password</label>
          <button type="button" className="link small" onClick={() => { set({ email }); nav('/check-email') }}>Forgot password?</button>
        </div>
        <PasswordField value={pw} onChange={v => { setPw(v); setErr('') }} placeholder="Your password" autoComplete="current-password" />
        {err && <p className="error">{err}</p>}
        <button className="btn btn-primary" type="submit">Log in</button>
      </form>
      <button className="link center" onClick={() => { set({ email: emailOk(email) ? email : '' }); nav('/check-email') }}>Email me a sign-in link instead</button>
      <div className="foot">
        <p>New here? <Link to="/signup" className="link strong">Create an account</Link></p>
      </div>
    </Screen>
  )
}

export function CheckEmail() {
  const nav = useNavigate()
  const { state, set, toast } = useStore()
  const [left, setLeft] = useState(30)

  useEffect(() => {
    if (left <= 0) return
    const t = window.setTimeout(() => setLeft(l => l - 1), 1000)
    return () => window.clearTimeout(t)
  }, [left])

  return (
    <Screen className="center-screen" dock={
      <>
        <a className="btn btn-primary" href="mailto:">Open my email app</a>
        <button className="btn btn-sm" disabled={left > 0} onClick={() => { setLeft(30); toast('A fresh link is on its way.') }}>
          {left > 0 ? `Resend link (available in 0:${String(left).padStart(2, '0')})` : 'Resend link'}
        </button>
        <button className="link center" onClick={() => nav('/signup')}>Use a different email</button>
      </>
    }>
      <MiniMast back />
      <Halftone swatch="blue" className="envelope"><IconMail size={64} /></Halftone>
      <p className="kicker center">Special delivery</p>
      <h1 className="display center">Check your email</h1>
      <p className="lede center">We sent a sign-in link to <b>{state.email || 'you@example.com'}</b>. Tap the link on this phone to continue.</p>
      <button className="demo-box" onClick={() => { set({ authed: true }); nav('/onboarding/profile') }}>
        <b>Demo shortcut</b>
        <span>For the hackathon, tap here to open step 1 of your profile, just like the emailed link would.</span>
      </button>
    </Screen>
  )
}
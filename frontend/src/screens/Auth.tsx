import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Cartoon } from '../components/Cartoon'
import { GoogleMark, IconEye, IconMail } from '../components/Icons'
import { BRAND, Halftone, Logo, MiniMast, OrRule, Screen } from '../components/ui'
import { friends, stories } from '../data'
import { supabase } from '../lib/auth'
import { isProfileReady, useStore } from '../store'

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

function afterSignIn(nav: ReturnType<typeof useNavigate>, ready: boolean) {
  nav(ready ? '/front' : '/onboarding/profile', { replace: true })
}

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
      <div className="stack">
        <button className="btn btn-primary" onClick={() => nav('/signup')}>Create account</button>
        <button className="btn" onClick={() => nav('/login')}>I already have an account</button>
      </div>
    </Screen>
  )
}

function PressPreview() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => setI(v => (v + 1) % 3), 3200)
    return () => window.clearInterval(t)
  }, [])
  const story = stories[i]!
  const friend = friends[story.author]!
  return (
    <Halftone swatch="yellow" className="press-preview" aria-label="Preview of a front page">
      <div key={i} className="mini-paper">
        <div className="mini-logo">{BRAND}</div>
        <div className="mini-rule" />
        <div className="mini-kicker">{story.section}</div>
        <div className="mini-headline">{story.headline}</div>
        <div className="mini-body">
          <Halftone swatch={story.swatch} className="mini-photo"><Cartoon look={friend.look} mood="grin" /></Halftone>
          <div className="mini-lines"><i /><i /><i /><i /><i style={{ width: '60%' }} /></div>
        </div>
      </div>
    </Halftone>
  )
}

function GoogleButton() {
  const { toast } = useStore()
  const [busy, setBusy] = useState(false)
  const start = async () => {
    setBusy(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    setBusy(false)
    if (error) toast(error.message.includes('provider') ? 'Google sign-in isn’t set up on this server yet. Use email.' : error.message)
  }
  return (
    <button className="btn btn-google" type="button" disabled={busy} onClick={() => void start()}>
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
  const { set, toast } = useStore()
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const valid = emailOk(email) && pw.length >= 8

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!valid) return
    setBusy(true)
    setErr('')
    const { data, error } = await supabase.auth.signUp({ email, password: pw })
    setBusy(false)
    if (error) return setErr(error.message)
    set({ email })
    if (!data.session) nav('/check-email')
  }

  return (
    <Screen>
      <MiniMast back="/welcome" />
      <p className="kicker">Join the staff</p>
      <h1 className="display">Create your account</h1>
      <p className="lede">Sign in with the same account you’ll use for your papers.</p>
      <GoogleButton />
      <OrRule><i>or use email</i></OrRule>
      <form className="form" onSubmit={e => void submit(e)} noValidate>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" className="field" type="email" value={email} placeholder="you@example.com" autoComplete="email"
          aria-invalid={touched && !emailOk(email)} onChange={e => setEmail(e.target.value)} />
        {touched && !emailOk(email) && <p className="error">That doesn't look like an email address.</p>}
        <label className="label" htmlFor="password">Password</label>
        <PasswordField value={pw} onChange={setPw} placeholder="At least 8 characters" autoComplete="new-password" showMeter />
        {err && <p className="error">{err}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>
      <button className="link center" onClick={() => {
        if (!emailOk(email)) return toast('Enter an email first.')
        set({ email })
        nav('/check-email')
      }}>
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
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!emailOk(email)) return setErr('Enter the email you signed up with.')
    if (!pw) return setErr('Enter your password.')
    setBusy(true)
    setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
    setBusy(false)
    if (error) return setErr(error.message)
  }

  return (
    <Screen>
      <MiniMast back="/welcome" />
      <p className="kicker">Subscribers</p>
      <h1 className="display">Welcome back</h1>
      <p className="lede">Log in to read this week's edition.</p>
      <GoogleButton />
      <OrRule><i>or use email</i></OrRule>
      <form className="form" onSubmit={e => void submit(e)} noValidate>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" className="field" type="email" value={email} placeholder="you@example.com" autoComplete="email" onChange={e => { setEmail(e.target.value); setErr('') }} />
        <div className="label-row">
          <label className="label" htmlFor="password">Password</label>
          <button type="button" className="link small" onClick={() => { set({ email }); nav('/check-email') }}>Forgot password?</button>
        </div>
        <PasswordField value={pw} onChange={v => { setPw(v); setErr('') }} placeholder="Your password" autoComplete="current-password" />
        {err && <p className="error">{err}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Log in'}</button>
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
  const { state, toast } = useStore()
  const [left, setLeft] = useState(0)
  const [sending, setSending] = useState(false)
  const email = state.email

  const send = async () => {
    if (!emailOk(email)) return toast('Go back and enter your email first.')
    setSending(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setSending(false)
    if (error) return toast(error.message)
    setLeft(30)
    toast('A sign-in link is on its way.')
  }

  useEffect(() => {
    if (emailOk(email)) void send()
    // send once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (left <= 0) return
    const t = window.setTimeout(() => setLeft(l => l - 1), 1000)
    return () => window.clearTimeout(t)
  }, [left])

  return (
    <Screen className="center-screen" dock={
      <>
        <a className="btn btn-primary" href="mailto:">Open my email app</a>
        <button className="btn btn-sm" disabled={left > 0 || sending} onClick={() => void send()}>
          {left > 0 ? `Resend link (available in 0:${String(left).padStart(2, '0')})` : sending ? 'Sending…' : 'Resend link'}
        </button>
        <button className="link center" onClick={() => nav('/signup')}>Use a different email</button>
      </>
    }>
      <MiniMast back />
      <Halftone swatch="blue" className="envelope"><IconMail size={64} /></Halftone>
      <p className="kicker center">Special delivery</p>
      <h1 className="display center">Check your email</h1>
      <p className="lede center">
        {emailOk(email)
          ? <>We sent a sign-in link to <b>{email}</b>. Tap the link on this phone to continue. Local mail is in Inbucket at port 54324.</>
          : 'Go back and enter your email so we can send a sign-in link.'}
      </p>
    </Screen>
  )
}

export function AuthCallback() {
  const nav = useNavigate()
  const { state } = useStore()
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!state.ready) return
    if (state.authed) {
      afterSignIn(nav, isProfileReady(state))
      return
    }
    const t = window.setTimeout(() => setErr('That link didn’t sign you in. Request a new one.'), 4000)
    return () => window.clearTimeout(t)
  }, [state.ready, state.authed, state, nav])

  return (
    <Screen className="center-screen">
      <MiniMast back="/login" />
      <p className="kicker center">Signing in</p>
      <h1 className="display center">{err || 'Opening the paper…'}</h1>
      {err && <button className="btn btn-primary" onClick={() => nav('/login')}>Back to log in</button>}
    </Screen>
  )
}


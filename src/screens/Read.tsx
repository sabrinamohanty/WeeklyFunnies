import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Cartoon } from '../components/Cartoon'
import { SignBadge } from '../components/SignBadge'
import { IconCake, IconCamera, IconChevron, SkyIcon } from '../components/Icons'
import { Lightbox, type LightboxItem } from '../components/Lightbox'
import { BRAND, Halftone, Logo, Screen, ThemeToggle, useCountdown } from '../components/ui'
import { addDays, edition, friends, horoscopes, signFor, signReadings, stories, strips, swatchCycle, type Story } from '../data'
import { useActivePaper, useStore } from '../store'
import { sampleForecast, toWeek, useCityWeather } from '../weather'
import { CityPicker } from '../components/CityPicker'
import { LogOut } from './Papers'

/** Deterministic shuffle so story order is stable within an edition but changes between editions. */
function seededShuffle<T>(arr: T[], seed: number) {
  const out = [...arr]
  let s = seed
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280
    const j = Math.floor((s / 233280) * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

export function Front() {
  const nav = useNavigate()
  const { state } = useStore()
  const paper = useActivePaper()
  const [open, setOpen] = useState<Story | null>(null)
  const ordered = useMemo(() => seededShuffle(stories, edition.no), [])
  const mine = state.draft && paper && state.published.includes(paper.id) ? state.draft.stories : []
  // Papers started in this session have no back catalog yet.
  const fresh = paper?.id.startsWith('p-') ?? false

  return (
    <Screen tabs>
      <header className="masthead">
        <div className="meta-row"><span>Vol. {edition.vol} · No. {fresh ? 1 : edition.no}</span><ThemeToggle /></div>
        <h1 className="nameplate"><Logo size="lg" /></h1>
        <div className="double-rule" />
        <button className="dateline" onClick={() => nav('/papers')}>{edition.date} · {BRAND}</button>
      </header>

      <WeatherWeek />


      {mine.map(s => (
        <article key={s.highlightId} className="story fresh">
          <p className="kicker">Hot off the press · You</p>
          <h2 className="headline">{s.headline}</h2>
          <p className="byline">By {state.profile.name.trim() || 'You'}</p>
          <p className="story-body">{s.article}</p>
        </article>
      ))}

      {fresh && mine.length === 0 && (
        <section className="empty-edition">
          <p className="kicker">Coming soon</p>
          <h2 className="headline">The first edition prints {paper!.pressDay}</h2>
          <p className="story-body">Invite your friends, then add your highlights. Every story lands here.</p>
          <Link to="/my-week" className="btn btn-primary">Add my highlights</Link>
        </section>
      )}

      {!fresh && ordered.map((s, i) => (
        <article key={s.id} className="story" style={{ animationDelay: `${i * 60}ms` }}>
          <p className="kicker">{s.section}</p>
          <h2 className="headline">{s.headline}</h2>
          <p className="byline">By {friends[s.author]!.name}</p>
          <button className={`ht c-${s.swatch} story-photo`} onClick={() => setOpen(s)} aria-label={`See ${s.photos} photo${s.photos > 1 ? 's' : ''}`}>
            <span className="photo-tag">[{friends[s.author]!.first}’s photo: {s.caption}]</span>
            <span className="photo-count"><IconCamera size={18} /> {s.photos} photo{s.photos > 1 ? 's' : ''}</span>
          </button>
          <p className="story-body">{s.body}</p>
          <Reactions story={s} />
        </article>
      ))}

      <div className="link-cards">
        <Link to="/comics" className="link-card">
          <span><span className="section-label">Inside this edition</span><b>Sunday Funnies · Stars · Birthdays</b></span><IconChevron />
        </Link>
        <Link to="/back-issues" className="link-card">
          <span><span className="section-label">Back issues</span><b>Past editions & saved papers</b></span><IconChevron />
        </Link>
      </div>
      <LogOut />

      {open && (
        <Lightbox title={open.headline} onClose={() => setOpen(null)}
          items={Array.from({ length: open.photos }, (_, k) => ({
            swatch: swatchCycle[(swatchCycle.indexOf(open.swatch) + k) % swatchCycle.length]!,
            label: `${friends[open.author]!.first}’s photo ${k + 1} of ${open.photos}`,
            caption: k === 0 ? open.caption[0]!.toUpperCase() + open.caption.slice(1) : undefined,
          }))} />
      )}
    </Screen>
  )
}

function WeatherWeek() {
  const { state, set } = useStore()
  const [changing, setChanging] = useState(false)
  const wx = useCityWeather(state.profile.city)
  const scroller = useRef<HTMLDivElement>(null)
  const sample = wx.status === 'no_key' || wx.status === 'error'
  const forecast = wx.forecast ?? (sample ? sampleForecast(wx.city) : null)
  const week = forecast ? toWeek(forecast) : []
  const place = (forecast?.location ?? wx.city).split(',')[0]
  const pickCity = (city: string) => { set(s => ({ profile: { ...s.profile, city } })); setChanging(false) }

  // Bring today into view without scrolling the page itself.
  useEffect(() => {
    const el = scroller.current
    const today = el?.querySelector<HTMLElement>('.wx-day.today')
    if (el && today) el.scrollLeft = today.offsetLeft - el.offsetLeft - 8
  }, [week.length])

  const status = wx.status === 'loading' ? 'Loading…'
    : wx.status === 'no_key' ? 'Sample · add API key'
    : wx.status === 'error' ? 'Sample · live weather unavailable'
    : forecast?.current.temp != null ? `Now ${forecast.current.temp}° · ${forecast.current.sky}` : ''

  return (
    <section className="weather-week" aria-label={place ? `Weather this week in ${place}` : 'Weather this week'} aria-busy={!forecast}>
      <div className="weather-head">
        <span className="eyebrow">{place ? `${place} weather` : 'Your weather'}</span>
        <span className={`weather-status ${sample ? 'warn' : ''}`}>{status}</span>
      </div>

      {wx.status === 'need_city' ? (
        <div className="wx-need">
          <p>Pick your city to see your weather.</p>
          <CityPicker id="wx-city" value="" onPick={pickCity} />
        </div>
      ) : (
        <>
          <div className="wx-source">
            <span>{state.profile.city}</span>
            <button className="link small" aria-expanded={changing} onClick={() => setChanging(c => !c)}>{changing ? 'Cancel' : 'Change'}</button>
          </div>
          {changing && <CityPicker id="wx-city" value="" autoFocus onPick={pickCity} />}
          <div className="weather-scroll" ref={scroller} tabIndex={0} aria-label="Daily forecast, scroll sideways">
            {forecast
              ? week.map(d => (
                <div key={d.key} className={`wx-day ${d.today ? 'today' : ''}`} title={d.text}>
                  <span className="eyebrow">{d.today ? 'Today' : d.label}</span>
                  <span className="wx-date">{d.label} {d.date}</span>
                  <SkyIcon sky={d.sky} />
                  <b>{d.high ?? '–'}<sup>°</sup></b>
                  <span className="wx-low">{d.low ?? '–'}°</span>
                </div>
              ))
              : Array.from({ length: 7 }, (_, i) => <div key={i} className="wx-day skeleton" />)}
          </div>
        </>
      )}
    </section>
  )
}

const reactionLabels = { ha: 'Ha!', aww: 'Aww', hooray: 'Hooray' } as const

function Reactions({ story }: { story: Story }) {
  const [mine, setMine] = useState<keyof typeof reactionLabels | null>(null)
  return (
    <div className="reactions" role="group" aria-label="Reactions">
      {(Object.keys(reactionLabels) as (keyof typeof reactionLabels)[]).map(k => (
        <button key={k} className={`reaction ${mine === k ? 'on' : ''}`} aria-pressed={mine === k}
          onClick={() => setMine(m => (m === k ? null : k))}>
          {reactionLabels[k]} <span>{story.reactions[k] + (mine === k ? 1 : 0)}</span>
        </button>
      ))}
    </div>
  )
}

export function Comics() {
  const [open, setOpen] = useState<{ strip: number; panel: number } | null>(null)

  const items = (si: number): LightboxItem[] => {
    const st = strips[si]!
    const f = friends[st.author]!
    return st.panels.map((p, k) => ({
      swatch: p.swatch, label: `Panel ${k + 1} · ${p.photos} real photo${p.photos > 1 ? 's' : ''}`, caption: p.caption,
      art: <Cartoon look={f.look} mood={p.mood} className="lightbox-art" />,
    }))
  }

  return (
    <Screen tabs>
      <header className="minimast rule-single solo"><Logo /></header>
      <h1 className="comic-title">Sunday Funnies</h1>
      <p className="note">Tap any panel to see the real photos</p>
      {strips.map((st, si) => {
        const f = friends[st.author]!
        return (
          <section key={st.id} className="strip" style={{ animationDelay: `${si * 90}ms` }}>
            <div className="strip-head"><h2>{st.title}</h2><span>by {f.name}</span></div>
            <div className="strip-frame">
              {st.panels.map((p, k) => (
                <button key={k} className={`ht c-${p.swatch} panel`} onClick={() => setOpen({ strip: si, panel: k })}
                  aria-label={`${st.title}, panel ${k + 1}: ${p.caption}`}>
                  <Cartoon look={f.look} mood={p.mood} />
                  <span className="panel-count"><IconCamera size={15} /> {p.photos}</span>
                </button>
              ))}
            </div>
          </section>
        )
      })}
      <Link to="/stars" className="next-link">Next: Stars &amp; Birthdays <IconChevron size={18} /></Link>
      {open && <Lightbox title={strips[open.strip]!.title} items={items(open.strip)} start={open.panel} onClose={() => setOpen(null)} />}
    </Screen>
  )
}

export function Stars() {
  const { state, toast } = useStore()
  const [cheered, setCheered] = useState(false)
  const press = useCountdown(edition.nextPress)
  const mySign = state.profile.birthday ? signFor(state.profile.birthday) : null

  const cheer = () => {
    setCheered(true)
    toast('Taco nomination sent to Maya 🌮')
  }

  return (
    <Screen tabs>
      <header className="minimast rule-single solo"><Logo /></header>
      <h1 className="display center">Stars &amp; Birthdays</h1>
      <p className="note">For entertainment only. Mostly.</p>

      <Halftone swatch="yellow" className={`bday ${cheered ? 'cheered' : ''}`}>
        <IconCake />
        <div>
          <p className="eyebrow dark">Birthdays this week</p>
          <h2>Maya turns 21 on {addDays(edition.monday, 2).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</h2>
          <p>The crew is accepting taco nominations.</p>
          <button className="btn btn-sm on-color" onClick={cheer} disabled={cheered}>{cheered ? 'Nominated!' : 'Nominate a taco'}</button>
        </div>
        {cheered && <div className="confetti" aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div>}
      </Halftone>

      <div className="rule-heading"><span>Your horoscopes</span></div>
      <ul className="horoscopes">
        {mySign && (
          <li className="mine">
            <SignBadge sign={mySign.sign} abbr={mySign.abbr} swatch="purple" big />
            <div>
              <div className="horo-head"><h3>{mySign.sign}</h3><span className="you-tag">You</span></div>
              <p>{signReadings[mySign.sign]}</p>
              <p className="lucky">Lucky number {new Date(state.profile.birthday).getUTCDate()}</p>
            </div>
          </li>
        )}
        {horoscopes.map(h => (
          <li key={h.sign}>
            <SignBadge sign={h.sign} abbr={h.abbr} swatch={h.swatch} big />
            <div>
              <div className="horo-head"><h3>{h.sign}</h3><span>{friends[h.friend]!.first}</span></div>
              <p>{h.text}</p>
              <p className="lucky">Lucky number {h.lucky}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="press-note">Next edition goes to press {edition.nextPressLabel}{press.ms > 0 && <> · in {press.label}</>}</p>
    </Screen>
  )
}

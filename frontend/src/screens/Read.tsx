import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Cartoon } from '../components/Cartoon'
import { SignBadge } from '../components/SignBadge'
import { IconCake, IconCamera, IconChevron, SkyIcon } from '../components/Icons'
import { Lightbox, type LightboxItem } from '../components/Lightbox'
import { BRAND, Halftone, Logo, Screen, ThemeToggle, useCountdown } from '../components/ui'
import { addDays, edition, friends, horoscopes, signFor, signReadings, strips } from '../data'
import { api, userMessage } from '../lib/api'
import { useActivePaper, useStore } from '../store'
import { sampleForecast, toWeek } from '../weather'
import { CityPicker } from '../components/CityPicker'
import { LogOut } from './Papers'

export function Front() {
  const nav = useNavigate()
  const { state } = useStore()
  const paper = useActivePaper()
  const mine = state.draft && paper && state.published.includes(paper.id) ? state.draft.stories : []
  const emptyStand = state.papers.length === 0
  const fresh = Boolean(paper)

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

      {emptyStand && (
        <section className="empty-edition">
          <p className="kicker">Your newsstand</p>
          <h2 className="headline">Join a paper to start reading</h2>
          <p className="story-body">Ask a friend for a 6-character code, or start a paper and invite them.</p>
          <Link to="/papers/join" className="btn btn-primary">Join or start a paper</Link>
        </section>
      )}

      {fresh && !emptyStand && mine.length === 0 && (
        <section className="empty-edition">
          <p className="kicker">Coming soon</p>
          <h2 className="headline">This week's edition of {paper!.name} is still being written</h2>
          <p className="story-body">Stories and comics from the API land here once everyone approves. You can still write a local preview of your week.</p>
          <Link to="/my-week" className="btn btn-primary">Add my highlights</Link>
        </section>
      )}

      <div className="link-cards">
        <Link to="/comics" className="link-card">
          <span><span className="section-label">Inside this edition</span><b>Sunday Funnies · Stars · Birthdays</b></span><IconChevron />
        </Link>
        <Link to="/back-issues" className="link-card">
          <span><span className="section-label">Back issues</span><b>Past editions & saved papers</b></span><IconChevron />
        </Link>
      </div>
      <LogOut />
    </Screen>
  )
}

function WeatherWeek() {
  const { state, set, toast } = useStore()
  const [changing, setChanging] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const forecast = sampleForecast(state.profile.city || 'Your city')
  const week = toWeek(forecast)
  const place = (state.profile.city || forecast.location).split(',')[0]
  const pickCity = (city: { id: number; label: string }) => {
    set(s => ({ profile: { ...s.profile, city: city.label, cityId: city.id } }))
    setChanging(false)
    void api.updateMe({ cityId: city.id }).catch(e => toast(userMessage(e)))
  }

  // Bring today into view without scrolling the page itself.
  useEffect(() => {
    const el = scroller.current
    const today = el?.querySelector<HTMLElement>('.wx-day.today')
    if (el && today) el.scrollLeft = today.offsetLeft - el.offsetLeft - 8
  }, [week.length])

  const status = 'Sample · live weather comes from the API next'

  return (
    <section className="weather-week" aria-label={place ? `Weather this week in ${place}` : 'Weather this week'}>
      <div className="weather-head">
        <span className="eyebrow">{place ? `${place} weather` : 'Your weather'}</span>
        <span className="weather-status warn">{status}</span>
      </div>

      {!state.profile.city ? (
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

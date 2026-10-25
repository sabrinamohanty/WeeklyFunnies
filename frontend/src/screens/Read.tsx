import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Cartoon } from '../components/Cartoon'
import { PublishedStoryCard } from '../components/EditionStories'
import { SignBadge } from '../components/SignBadge'
import { IconCake, IconCamera, IconChevron, SkyIcon } from '../components/Icons'
import { Lightbox, type LightboxItem } from '../components/Lightbox'
import { BRAND, Halftone, Logo, MiniMast, Screen, ThemeToggle, useCountdown } from '../components/ui'
import { edition, dayOfMonth, monthDayLabel, signFor, signReadings, swatchCycle, weekLabelFromIso, zodiac } from '../data'
import { api, userMessage } from '../lib/api'
import { draftStoriesForPaper, editionsReadyToPublish, frontEmptyState, lightboxItems, showOwnDraftComic } from '../lib/page-flow'
import { ApiError, type EditionBundle, type EditionSummary, type PublishedPage } from '../lib/types'
import { useActivePaper, useEditionBundle, useStore } from '../store'
import { AUSTIN_COORDS, browserCoords, fromWeather, toWeek, type Forecast } from '../weather'
import { CityPicker } from '../components/CityPicker'
import { lookFor } from './Onboarding'
import { LogOut } from './Papers'
import { SettingsButton } from './Settings'

function memberOf(bundle: EditionBundle, userId: string) {
  return bundle.members.find(m => m.userId === userId) ?? null
}

export function Front() {
  const nav = useNavigate()
  const { state } = useStore()
  const paper = useActivePaper()
  const bundle = useEditionBundle()
  const published = bundle?.edition.status === 'published'
  const pages = bundle?.pages ?? []
  const mine = draftStoriesForPaper(published, paper?.id, state.page?.papers, state.draft?.stories)
  const empty = frontEmptyState({
    paperCount: state.papers.length,
    published,
    publishedPageCount: pages.length,
    ownStoryCount: mine.length,
  })

  return (
    <Screen tabs>
      <header className="masthead">
        <div className="meta-row">
          <span>Vol. 1 · No. {bundle?.edition.issueNumber ?? 1}</span>
          <span className="meta-actions"><ThemeToggle /><SettingsButton /></span>
        </div>
        <h1 className="nameplate"><Logo size="lg" /></h1>
        <div className="double-rule" />
        <button className="dateline" onClick={() => nav('/papers')}>
          {bundle ? `${weekLabelFromIso(bundle.edition.weekStart)} · ${bundle.edition.paperName}` : `${edition.date} · ${BRAND}`}
        </button>
      </header>

      <WeatherWeek />

      {paper && bundle?.viewer.role === 'owner' && <PressControl paperId={paper.id} />}

      {published && pages.flatMap(page => page.stories.map(story => (
        <PublishedStoryCard key={story.id} bundle={bundle!} page={page} story={story} />
      )))}

      {mine.map(s => (
        <article key={s.id} className="story fresh">
          <p className="kicker">Your page · waiting for press</p>
          <h2 className="headline">{s.headline}</h2>
          <p className="byline">By {state.profile.name.trim() || 'You'}</p>
          <p className="story-body">{s.article}</p>
        </article>
      ))}

      {empty === 'join' && (
        <section className="empty-edition">
          <p className="kicker">Your newsstand</p>
          <h2 className="headline">Join a paper to start reading</h2>
          <p className="story-body">Ask a friend for a 6-character code, or start a paper and invite them.</p>
          <Link to="/papers/join" className="btn btn-primary">Join or start a paper</Link>
        </section>
      )}

      {empty === 'published-empty' && (
        <section className="empty-edition">
          <p className="kicker">Coming soon</p>
          <h2 className="headline">This week's edition of {paper?.name} has no pages yet</h2>
          <p className="story-body">Approved pages appear here after the editor goes to press.</p>
          <Link to="/my-week" className="btn btn-primary">Add my highlights</Link>
        </section>
      )}

      {empty === 'draft-empty' && (
        <section className="empty-edition">
          <p className="kicker">Coming soon</p>
          <h2 className="headline">This week's edition of {paper?.name} is still being written</h2>
          <p className="story-body">Stories and comics appear here after the editor publishes. You can still write and approve your page.</p>
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

function PressControl({ paperId }: { paperId: string }) {
  const { loadBundle, toast } = useStore()
  const [waiting, setWaiting] = useState<EditionSummary[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    api.listEditions(paperId).then(({ editions }) => {
      if (alive) setWaiting(editionsReadyToPublish(editions))
    }).catch(() => {})
    return () => { alive = false }
  }, [paperId])

  if (waiting.length === 0) return null

  const publish = async (edition: EditionSummary) => {
    setBusy(true)
    try {
      await api.publishEdition(edition.id)
      toast(`No. ${edition.issueNumber} is on the stands`)
      setWaiting(rows => rows.filter(row => row.id !== edition.id))
      await loadBundle(paperId)
    } catch (e) {
      toast(e instanceof ApiError && e.code === 'conflict'
        ? 'That edition is not ready to print. The Sunday deadline has to pass, and every panel has to finish inking.'
        : userMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="empty-edition">
      <p className="kicker">Editor</p>
      <h2 className="headline">A closed week is ready for press</h2>
      <p className="story-body">The Sunday deadline has passed. Publishing puts every approved page on the stands. This week's paper stays open until next Sunday at 11:59 p.m.</p>
      {waiting.map(edition => (
        <button key={edition.id} className="btn btn-primary" disabled={busy} onClick={() => void publish(edition)}>
          {busy ? 'Printing…' : `Publish the week of ${weekLabelFromIso(edition.weekStart)}`}
        </button>
      ))}
    </section>
  )
}

function WeatherWeek() {
  const { state, set, toast } = useStore()
  const [changing, setChanging] = useState(false)
  const [live, setLive] = useState<{ forecast: Forecast; timeZone: string; status: string } | null>(null)
  const [status, setStatus] = useState('Loading the forecast…')
  const scroller = useRef<HTMLDivElement>(null)
  const forecast = live?.forecast ?? null
  const week = forecast ? toWeek(forecast, new Date(), live?.timeZone) : []
  const place = (forecast?.location || state.profile.city || '').split(',')[0]
  const pickCity = (city: { id: number; label: string }) => {
    set(s => ({ profile: { ...s.profile, city: city.label, cityId: city.id } }))
    setChanging(false)
    void api.updateMe({ cityId: city.id }).catch(e => toast(userMessage(e)))
  }

  useEffect(() => {
    let alive = true
    setLive(null)
    setStatus('Loading the forecast…')
    void (async () => {
      try {
        const coords = await browserCoords()
        let { weather } = await api.weather(coords ?? undefined)
        let austin = false
        if (!weather) {
          weather = (await api.weather(AUSTIN_COORDS)).weather
          austin = true
        }
        if (!alive) return
        if (!weather) {
          setStatus('Weather is unavailable right now.')
          return
        }
        const where = austin ? 'Austin' : (weather.place ?? 'Near you')
        setLive({
          forecast: fromWeather(weather, where),
          timeZone: weather.timezone,
          status: austin ? 'Austin · °C' : weather.source === 'location' ? 'Near you · °C' : '°C',
        })
      } catch {
        if (!alive) return
        try {
          const { weather } = await api.weather(AUSTIN_COORDS)
          if (!alive) return
          if (!weather) {
            setStatus('Weather is unavailable right now.')
            return
          }
          setLive({
            forecast: fromWeather(weather, 'Austin'),
            timeZone: weather.timezone,
            status: 'Austin · °C',
          })
        } catch {
          if (alive) setStatus('Weather is unavailable right now.')
        }
      }
    })()
    return () => { alive = false }
  }, [state.profile.city, state.profile.cityId])

  useEffect(() => {
    const el = scroller.current
    const today = el?.querySelector<HTMLElement>('.wx-day.today')
    if (el && today) el.scrollLeft = today.offsetLeft - el.offsetLeft - 8
  }, [week.length])

  const statusText = live?.status || status

  return (
    <section className="weather-week" aria-label={place ? `Weather this week in ${place}` : 'Weather this week'}>
      <div className="weather-head">
        <span className="eyebrow">{place ? `${place} weather` : 'Your weather'}</span>
        <span className={`weather-status ${live ? '' : 'warn'}`}>{statusText}</span>
      </div>

      {!forecast && status !== 'Loading the forecast…' && !state.profile.city ? (
        <div className="wx-need">
          <p>Pick your city to see your weather.</p>
          <CityPicker id="wx-city" value="" onPick={pickCity} />
        </div>
      ) : (
        <>
          <div className="wx-source">
            <span>{state.profile.city || forecast?.location}</span>
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
  const { state } = useStore()
  const bundle = useEditionBundle()
  const [open, setOpen] = useState<{ page: number; panel: number } | null>(null)
  const look = lookFor(state.avatar)
  const published = bundle?.edition.status === 'published'
  const strips = (bundle?.pages ?? []).filter(p => p.comic)
  const own = showOwnDraftComic(published, state.draft?.panels.length ?? 0, Boolean(state.page?.comic)) && state.page?.comic
    ? [{ title: state.page.comic.title || 'Your strip', author: state.profile.name.trim() || 'You', comic: state.page.comic, style: state.style, avatarUrl: state.avatarUrl }]
    : []

  const itemsFor = (page: PublishedPage, startPanel: number): { items: LightboxItem[]; start: number } => {
    const built = lightboxItems(
      (page.comic?.panels ?? []).map(p => ({ caption: p.caption, photos: p.photos, imageUrl: p.image.url })),
      startPanel,
    )
    return {
      start: built.start,
      items: built.items.map(item => ({
        swatch: swatchCycle[item.panelIndex % swatchCycle.length]!,
        label: item.label,
        caption: item.caption,
        image: item.image,
      })),
    }
  }

  return (
    <Screen tabs>
      <MiniMast rule="single" right={<SettingsButton />} />
      <h1 className="comic-title">Sunday Funnies</h1>
      <p className="note">{published ? 'Tap any panel to see the real photos' : 'Comics print after the editor publishes.'}</p>

      {published && strips.map((page, si) => {
        const author = memberOf(bundle!, page.authorId)
        const comic = page.comic!
        return (
          <section key={page.pageId} className="strip" style={{ animationDelay: `${si * 90}ms` }}>
            <div className="strip-head"><h2>{comic.title}</h2><span>by {author?.name || 'Staff'}</span></div>
            <div className="strip-frame">
              {comic.panels.map((p, k) => (
                <button key={k} className={`ht c-${swatchCycle[k % swatchCycle.length]} panel`} onClick={() => setOpen({ page: si, panel: k })}
                  aria-label={`${comic.title}, panel ${k + 1}: ${p.caption ?? ''}`}>
                  {p.image.url
                    ? <img className="panel-art" src={p.image.url} alt="" />
                    : author?.avatarUrl
                      ? <img className="panel-art" src={author.avatarUrl} alt="" />
                      : <Cartoon look={look} style={page.style} />}
                  {p.photos.length > 0 && <span className="panel-count"><IconCamera size={15} /> {p.photos.length}</span>}
                  {p.caption && <span className="panel-caption">{p.caption}</span>}
                </button>
              ))}
            </div>
          </section>
        )
      })}

      {own.map(st => (
        <section key="mine" className="strip">
          <div className="strip-head"><h2>{st.title}</h2><span>by {st.author}</span></div>
          <div className="strip-frame">
            {st.comic.panels.map((p, k) => (
              <div key={k} className={`ht c-${swatchCycle[k % swatchCycle.length]} panel`}>
                {p.image.url
                  ? <img className="panel-art" src={p.image.url} alt="" />
                  : <Cartoon look={look} style={st.style} />}
                {p.caption && <span className="panel-caption">{p.caption}</span>}
              </div>
            ))}
          </div>
        </section>
      ))}

      {strips.length === 0 && own.length === 0 && (
        <section className="empty-edition">
          <p className="kicker">The funny pages</p>
          <h2 className="headline">No comics in this edition yet</h2>
          <p className="story-body">Approved strips appear here after the editor publishes.</p>
          <Link to="/my-week" className="btn btn-primary">Write my week</Link>
        </section>
      )}

      <Link to="/stars" className="next-link">Next: Stars &amp; Birthdays <IconChevron size={18} /></Link>
      {open && bundle && strips[open.page] && (() => {
        const { items, start } = itemsFor(strips[open.page]!, open.panel)
        return items.length ? <Lightbox title={strips[open.page]!.comic!.title} items={items} start={start} onClose={() => setOpen(null)} /> : null
      })()}
    </Screen>
  )
}

export function Stars() {
  const { state } = useStore()
  const bundle = useEditionBundle()
  const pressTarget = bundle?.edition.deadline ? new Date(bundle.edition.deadline) : edition.nextPress
  const press = useCountdown(pressTarget)
  const mySign = state.profile.birthday ? signFor(state.profile.birthday) : null
  const birthdays = bundle?.birthdays ?? []
  const horoscopes = bundle?.horoscopes ?? []

  return (
    <Screen tabs>
      <MiniMast rule="single" right={<SettingsButton />} />
      <h1 className="display center">Stars &amp; Birthdays</h1>
      <p className="note">For entertainment only. Mostly.</p>

      {birthdays.length > 0 ? birthdays.map(b => (
        <Halftone key={b.userId} swatch="yellow" className="bday">
          <IconCake />
          <div>
            <p className="eyebrow dark">Birthdays this week</p>
            <h2>{b.name} on {monthDayLabel(b.monthDay)}</h2>
            <p>The year stays off the record.</p>
          </div>
        </Halftone>
      )) : (
        <Halftone swatch="yellow" className="bday">
          <IconCake />
          <div>
            <p className="eyebrow dark">Birthdays this week</p>
            <h2>No birthdays in this edition</h2>
            <p>When someone on the paper has a birthday this week, it lands here.</p>
          </div>
        </Halftone>
      )}

      <div className="rule-heading"><span>Your horoscopes</span></div>
      <ul className="horoscopes">
        {mySign && (
          <li className="mine">
            <SignBadge sign={mySign.sign} abbr={mySign.abbr} swatch="purple" big />
            <div>
              <div className="horo-head"><h3>{mySign.sign}</h3><span className="you-tag">You</span></div>
              <p>{horoscopes.find(h => h.sign.toLowerCase() === mySign.sign.toLowerCase())?.text ?? signReadings[mySign.sign]}</p>
              <p className="lucky">Lucky number {horoscopes.find(h => h.sign.toLowerCase() === mySign.sign.toLowerCase())?.luckyNumber ?? dayOfMonth(state.profile.birthday) ?? '—'}</p>
            </div>
          </li>
        )}
        {horoscopes.filter(h => h.sign.toLowerCase() !== mySign?.sign.toLowerCase()).map(h => {
          const named = zodiac.find(z => z.sign.toLowerCase() === h.sign.toLowerCase())
          const names = h.userIds.map(id => bundle ? memberOf(bundle, id)?.name : null).filter(Boolean).join(', ')
          return (
            <li key={h.sign}>
              <SignBadge sign={named?.sign ?? h.sign} abbr={named?.abbr ?? h.sign.slice(0, 2)} swatch="blue" big />
              <div>
                <div className="horo-head"><h3>{named?.sign ?? h.sign}</h3>{names && <span>{names}</span>}</div>
                <p>{h.text}</p>
                <p className="lucky">Lucky number {h.luckyNumber}</p>
              </div>
            </li>
          )
        })}
      </ul>
      {horoscopes.length === 0 && <p className="hint">Crew horoscopes show up here once birthdays are on file.</p>}
      <p className="press-note">
        {bundle
          ? <>This edition {bundle.edition.status === 'published' ? 'is on the stands' : `closes ${press.ms > 0 ? `in ${press.label}` : 'now'}`}</>
          : <>Next edition goes to press {edition.nextPressLabel}{press.ms > 0 && <> · in {press.label}</>}</>}
      </p>
    </Screen>
  )
}

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { lookFor } from './Onboarding'
import { imageSrc } from '../api'
import { Cartoon } from '../components/Cartoon'
import { SignBadge } from '../components/SignBadge'
import { PaperDrawer, useEdgeSwipe } from '../components/PaperDrawer'
import { IconCake, IconCamera, IconChevron, IconComment, IconSidebar, SkyIcon } from '../components/Icons'
import { Lightbox, type LightboxItem } from '../components/Lightbox'
import { BRAND, Halftone, Logo, MiniMast, Screen, ThemeToggle, useCountdown } from '../components/ui'
import { comics, crew, edition, friends, signFor, signReadings, stories, upcomingBirthdays, youColor, type Story } from '../data'
import { uid, useActivePaper, useStore } from '../store'
import { defaultComicSrc } from '../demoSeed'
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
  const { state } = useStore()
  const paper = useActivePaper()
  const [open, setOpen] = useState<Story | null>(null)
  const [drawer, setDrawer] = useState(false)
  useEdgeSwipe(() => setDrawer(true), !drawer && !open)
  // One headline per person: their cover story, which is their first highlight unless they chose another.
  const ordered = useMemo(() => seededShuffle(stories.filter((s, i) => stories.findIndex(x => x.author === s.author) === i), edition.no), [])
  const draft = state.draft && paper && state.published.includes(paper.id) ? state.draft : null
  const cover = draft ? draft.stories.find(x => x.highlightId === draft.coverId) ?? draft.stories[0] : undefined
  const mine = cover ? [cover] : []
  // Papers started in this session have no back catalog yet.
  const fresh = paper?.id.startsWith('p-') ?? false
  const locked = useLocked(!fresh)

  return (
    <Screen tabs>
      <header className="masthead">
        <div className="meta-row"><span className="meta-lead"><button className="paper-caret" aria-label="Your papers" onClick={() => setDrawer(true)}><IconSidebar size={20} /></button>Vol. {edition.vol} · No. {fresh ? 1 : edition.no}</span><span className="meta-actions"><ThemeToggle /></span></div>
        <h1 className="nameplate"><Logo size="lg" /></h1>
        <div className="double-rule" />
        <p className="dateline">{edition.date} · {BRAND}</p>
      </header>
      <PaperDrawer open={drawer} onClose={() => setDrawer(false)} />

      <WeatherWeek />


      {mine.map(s => {
        const photo = state.highlights.find(h => h.id === s.highlightId)?.photos.find(p => p.startsWith('data:') || p.startsWith('blob:'))
        return (
          <article key={s.highlightId} className="story fresh">
            <p className="kicker">Hot off the press · You</p>
            <h2 className="headline">{s.headline}</h2>
            <p className="byline">By {state.profile.name.trim() || 'You'}</p>
            {photo && <img className="story-img" src={photo} alt={`Photo from ${state.profile.name.trim() || 'your'} highlight`} />}
            <p className="story-body">{s.article}</p>
          </article>
        )
      })}

      {locked && <ComingSoon />}

      {fresh && mine.length === 0 && (
        <section className="empty-edition">
          <p className="kicker">Coming soon</p>
          <h2 className="headline">The first edition prints {paper!.pressDay}</h2>
          <p className="story-body">Invite your friends, then add your highlights. Every story lands here.</p>
          <Link to="/my-week" className="btn btn-primary">Add my highlights</Link>
        </section>
      )}

      {!fresh && !locked && ordered.map((s, i) => (
        <article key={s.id} className="story" style={{ animationDelay: `${i * 60}ms` }}>
          <p className="kicker">{s.section}</p>
          <h2 className="headline">{s.headline}</h2>
          <p className="byline">By {friends[s.author]?.name ?? 'Staff'}</p>
          {s.photos.length > 0 && (
            <button className="story-photo has-img" onClick={() => setOpen(s)}
              aria-label={`See ${s.photos.length} photo${s.photos.length > 1 ? 's' : ''}`}>
              <img src={s.photos[0]} alt={`${friends[s.author]?.first ?? 'Staff'}’s photo: ${s.caption}`} loading="lazy" />
              <span className="photo-count"><IconCamera size={18} /> {s.photos.length} photo{s.photos.length > 1 ? 's' : ''}</span>
            </button>
          )}
          <p className="story-body">{s.body}</p>
          <StoryReactions story={s} />
        </article>
      ))}

      <div className="link-cards">
        <Link to="/comics" className="link-card">
          <span><span className="section-label">Inside this edition</span><b>The Funnies · Stars · Birthdays</b></span><IconChevron />
        </Link>
        <Link to="/back-issues" className="link-card">
          <span><span className="section-label">Back issues</span><b>Past editions & saved papers</b></span><IconChevron />
        </Link>
      </div>
      <LogOut />

      {open && (
        <Lightbox title={open.headline} onClose={() => setOpen(null)}
          items={open.photos.map((src, k) => ({
            swatch: open.swatch, src,
            label: `${friends[open.author]?.first ?? 'Staff'}’s photo ${k + 1} of ${open.photos.length}`,
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
    : !sample && forecast?.current.temp != null ? `Now ${forecast.current.temp}° · ${forecast.current.sky}` : ''

  return (
    <section className="weather-week" aria-label={place ? `Weather this week in ${place}` : 'Weather this week'} aria-busy={!forecast}>
      <div className="weather-head">
        <span className="eyebrow">{place ? `${place} weather` : 'Your weather'}</span>
        <span className="weather-status">{status}</span>
      </div>

      <div className="wx-source">
        <span>{wx.city}</span>
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
    </section>
  )
}

const reactionLabels = { ha: 'Ha!', aww: 'Aww', hooray: 'Hooray' } as const

type ReactionKey = keyof typeof reactionLabels

function Reactions({ base, mine, onToggle }: { base: Record<ReactionKey, number>; mine: ReactionKey[]; onToggle: (k: ReactionKey) => void }) {
  return (
    <div className="reactions" role="group" aria-label="Reactions">
      {(Object.keys(reactionLabels) as ReactionKey[]).map(k => {
        const on = mine.includes(k)
        return (
          <button key={k} className={`reaction ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => onToggle(k)}>
            {reactionLabels[k]} <span>{base[k] + (on ? 1 : 0)}</span>
          </button>
        )
      })}
    </div>
  )
}

const toggleIn = (list: ReactionKey[], k: ReactionKey) => (list.includes(k) ? list.filter(x => x !== k) : [...list, k])

function StoryReactions({ story }: { story: Story }) {
  const [mine, setMine] = useState<ReactionKey[]>([])
  return <Reactions base={story.reactions} mine={mine} onToggle={k => setMine(m => toggleIn(m, k))} />
}

/** Reactions and comments for one comic. Both are saved with the reader's session. */
function ComicSocial({ id }: { id: string }) {
  const { state, set } = useStore()
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const comments = state.comments[id] ?? []
  // Older saved state held a single reaction as a string.
  const saved: ReactionKey[] | ReactionKey | undefined = state.comicReactions[id]
  const mine: ReactionKey[] = Array.isArray(saved) ? saved : saved ? [saved] : []
  const who = state.profile.name.trim() || 'You'
  const toggle = (k: ReactionKey) => set(s => {
    const cur: ReactionKey[] | ReactionKey | undefined = s.comicReactions[id]
    const list = Array.isArray(cur) ? cur : cur ? [cur] : []
    return { comicReactions: { ...s.comicReactions, [id]: toggleIn(list, k) } }
  })
  const post = (e: FormEvent) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    set(s => ({ comments: { ...s.comments, [id]: [...(s.comments[id] ?? []), { id: uid('c'), name: who, text: t }] } }))
    setText('')
  }
  return (
    <div className="comic-social">
      <div className="social-row">
        <Reactions base={{ ha: 0, aww: 0, hooray: 0 }} mine={mine} onToggle={toggle} />
        <button className={`comment-toggle ${open ? 'on' : ''}`} aria-expanded={open} aria-label={`Comments${comments.length ? `, ${comments.length}` : ''}`}
          onClick={() => setOpen(o => !o)}>
          <IconComment size={26} />{comments.length > 0 && <span>{comments.length}</span>}
        </button>
      </div>
      {open && (
        <div className="comments">
          {comments.length > 0 && (
            <ul>{comments.map(c => <li key={c.id}><b>{c.name}</b>{c.text}</li>)}</ul>
          )}
          <form className="comment-form" onSubmit={post}>
            <input className="field" value={text} maxLength={140} placeholder="Leave a comment" aria-label="Leave a comment" autoFocus
              onChange={e => setText(e.target.value)} />
            <button className="btn comment-post" type="submit" disabled={!text.trim()}>Post</button>
          </form>
        </div>
      )}
    </div>
  )
}

function useLocked(applies = true) {
  const { state } = useStore()
  const paper = useActivePaper()
  return applies && !!paper && !state.published.includes(paper.id) && !state.previewed.includes(paper.id)
}

/** Shown in place of the edition until the reader adds their own highlights. */
function ComingSoon() {
  const { set } = useStore()
  const paper = useActivePaper()
  const posted = crew.map(f => f.first)
  const names = posted.length > 1 ? `${posted.slice(0, -1).join(', ')} and ${posted[posted.length - 1]}` : posted[0] ?? 'Your friends'
  return (
    <section className="empty-edition">
      <p className="kicker">Coming soon</p>
      <h2 className="headline">This week’s edition prints {paper?.pressDay ?? 'Monday'}</h2>
      <p className="story-body">{names} {posted.length > 1 ? 'have' : 'has'} already posted. Add your highlights and the paper prints with your page in it.</p>
      <Link to="/my-week" className="btn btn-primary">Add my highlights</Link>
      {paper && <button className="link center" onClick={() => set(s => ({ previewed: [...new Set([...s.previewed, paper.id])] }))}>Preview the edition</button>}
    </section>
  )
}

/** A comic printed on top of its owner's photos: tap and the page tears away to show a collage underneath. */
interface TornComicData { title: string; src: string; photos: string[]; author: { name: string; first: string } }

function TornComic({ comic, onPhoto }: { comic: TornComicData; onPhoto: (k: number) => void }) {
  const [torn, setTorn] = useState(false)
  const n = comic.photos.length
  return (
    <div className={`torn ${torn ? 'open' : ''}`}>
      <div className="torn-top">
        <button className="comic-full" disabled={n === 0} aria-expanded={n > 0 ? torn : undefined}
          aria-label={n > 0 ? `${comic.title} by ${comic.author.name}. ${torn ? 'Hide' : 'Show'} ${comic.author.first}’s ${n} photo${n > 1 ? 's' : ''}` : `${comic.title} by ${comic.author.name}`}
          onClick={() => setTorn(t => !t)}>
          <img src={comic.src} alt={`${comic.title}, a comic by ${comic.author.name}`} loading="lazy" />
          {n > 0 && <span className="photo-count"><IconCamera size={18} /> {n}</span>}
        </button>
      </div>
      {n > 0 && (
        <div className="collage-wrap" aria-hidden={!torn}>
          <div className={`collage n${Math.min(n, 4)}`}>
            {comic.photos.map((src, k) => (
              <button key={src} tabIndex={torn ? 0 : -1} style={{ ['--r' as string]: `${[-2.5, 2, -1.5, 3][k % 4]}deg` }}
                aria-label={`${comic.author.first}’s photo ${k + 1} of ${n}`} onClick={() => onPhoto(k)}>
                <img src={src} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function Comics() {
  const { state } = useStore()
  const paper = useActivePaper()
  const locked = useLocked()
  const [open, setOpen] = useState<{ title: string; items: LightboxItem[]; start: number } | null>(null)
  const draft = state.draft && paper && state.published.includes(paper.id) ? state.draft : null
  const myName = state.profile.name.trim() || 'You'
  // When no panel was drawn (the image model failed or isn't reachable), the prepared default comic stands in.
  const useDefault = !!draft && !draft.panels.some(p => p.image) && !draft.panels.some(p => p.loading)
  const myPhotos = state.highlights.flatMap(h => h.photos).filter(p => p.startsWith('data:') || p.startsWith('blob:'))

  return (
    <Screen tabs>
      <MiniMast rule="single" />
      <h1 className="comic-title">The Funnies</h1>
      {locked && <ComingSoon />}
      {!locked && comics.map((c, ci) => (
        <section key={c.id} className="strip" style={{ animationDelay: `${ci * 90}ms` }}>
          <div className="strip-head"><h2>{c.title}</h2><span>by {c.author.name}</span></div>
          <TornComic comic={c} onPhoto={k => setOpen({ title: `${c.author.first}’s week`, start: k,
            items: c.photos.map((src, j) => ({ swatch: c.author.color, src, label: `${c.author.first}’s photo ${j + 1} of ${c.photos.length}` })) })} />
          <ComicSocial id={c.id} />
        </section>
      ))}

      {draft && (
        <section className="strip" aria-label={`${myName}'s comic`}>
          <div className="strip-head"><h2>{myName}’s Week</h2><span>by {myName}</span></div>
          {useDefault ? (
            <TornComic comic={{ title: `${myName}’s Week`, src: defaultComicSrc, photos: myPhotos, author: { name: myName, first: myName } }}
              onPhoto={k => setOpen({ title: `${myName}’s week`, start: k,
                items: myPhotos.map((src, j) => ({ swatch: youColor, src, label: `Your photo ${j + 1} of ${myPhotos.length}` })) })} />
          ) : (<>
          <div className="strip-frame">
            {draft.panels.map((p, k) => (
              <button key={p.id} className={`ht c-${p.swatch} panel`} aria-label={`${myName}’s comic, panel ${k + 1}${p.caption ? `: ${p.caption}` : ''}`}
                onClick={() => setOpen({ title: `${myName}’s Week`, start: k, items: [
                  ...draft.panels.map((q, j) => ({
                    swatch: q.swatch, label: `Panel ${j + 1}`, caption: q.caption || undefined,
                    ...(q.image ? { src: imageSrc(q.image) } : { art: <Cartoon look={lookFor(state.avatar)} style={state.avatar.style} mood={q.mood} className="lightbox-art" /> }),
                  })),
                  ...myPhotos.map((src, j) => ({ swatch: youColor, src, label: `Your photo ${j + 1} of ${myPhotos.length}`, caption: `Your week · photo ${j + 1} of ${myPhotos.length}` })),
                ] })}>
                {p.image ? <img className="panel-art" src={imageSrc(p.image)} alt="" /> : <Cartoon look={lookFor(state.avatar)} style={state.avatar.style} mood={p.mood} />}
              </button>
            ))}
          </div>
          </>)}
        </section>
      )}

      <Link to="/stars" className="next-link">Next: Stars &amp; Birthdays <IconChevron size={18} /></Link>
      {open && <Lightbox title={open.title} items={open.items} start={open.start} onClose={() => setOpen(null)} />}
    </Screen>
  )
}

export function Stars() {
  const { state, toast } = useStore()
  const [cheered, setCheered] = useState(false)
  const press = useCountdown(edition.nextPress)
  const mySign = state.profile.birthday ? signFor(state.profile.birthday) : null

  // Birthdays are month/day only. Show anyone in this edition's week, otherwise whoever is next.
  const upcoming = upcomingBirthdays(edition.monday)
  const weekEnd = addDaysTo(edition.monday, 7)
  const thisWeek = upcoming.filter(b => b.date < weekEnd)
  const next = thisWeek[0] ?? upcoming[0]
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  const cheer = () => {
    setCheered(true)
    toast(`Confetti sent to ${next?.person.first ?? 'the crew'} 🎉`)
  }

  return (
    <Screen tabs>
      <MiniMast rule="single" />
      <h1 className="display center">Stars &amp; Birthdays</h1>
      <p className="note">For entertainment only. Mostly.</p>

      {next && (
        <Halftone swatch="yellow" className={`bday ${cheered ? 'cheered' : ''}`}>
          <IconCake />
          <div>
            <p className="eyebrow dark">{thisWeek.length ? 'Birthdays this week' : 'No birthdays this week'}</p>
            <h2>{thisWeek.length ? `${next.person.first}’s birthday is ${fmt(next.date)}` : `Next up: ${next.person.first} on ${next.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`}</h2>
            <p>Send {next.person.first} some confetti.</p>
            <button className="btn btn-sm on-color" onClick={cheer} disabled={cheered}>{cheered ? 'Confetti sent!' : 'Send confetti'}</button>
          </div>
          {cheered && <div className="confetti" aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div>}
        </Halftone>
      )}

      <div className="rule-heading"><span>Your horoscopes</span></div>
      <ul className="horoscopes">
        {mySign && (
          <li className="mine">
            <SignBadge sign={mySign.sign} abbr={mySign.abbr} swatch={youColor} big />
            <div>
              <div className="horo-head"><h3>{mySign.sign}</h3><span className="you-tag">You</span></div>
              <p>{signReadings[mySign.sign]}</p>
              <p className="lucky">Lucky number {new Date(state.profile.birthday).getUTCDate()}</p>
            </div>
          </li>
        )}
        {crew.map(f => {
          const sign = signFor(f.birthday)
          if (!sign) return null
          return (
            <li key={f.id}>
              <SignBadge sign={sign.sign} abbr={sign.abbr} swatch={f.color} big />
              <div>
                <div className="horo-head"><h3>{sign.sign}</h3><span>{f.first}</span></div>
                <p>{signReadings[sign.sign]}</p>
                <p className="lucky">Lucky number {Number(f.birthday.split('-')[1])}</p>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="press-note">Next edition goes to press {edition.nextPressLabel}{press.ms > 0 && <> · in {press.label}</>}</p>
    </Screen>
  )
}

const addDaysTo = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

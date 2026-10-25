// Demo data for the frontend. The crew roster, highlights and comics come from demoSeed.ts.
import { seedComics, seedHighlights, seedPaper, seedPeople } from './demoSeed'

export type Swatch = 'yellow' | 'blue' | 'purple' | 'green' | 'pink' | 'orange' | 'gray'
export type Mood = 'o' | 'smile' | 'flat' | 'grin'

export interface Look {
  skin: string
  hair: string
  shirt: string
  hat?: boolean
  glasses?: boolean
}

export interface Friend {
  id: string
  name: string
  first: string
  color: Swatch
  /** Cartoon stand-in, used when the photo avatar is missing or fails to load. */
  look: Look
  sign: string
  role: 'Editor' | 'Contributor'
  city: string
  /** Month and day only ("MM-DD"). */
  birthday: string
  bio: string
  avatar?: string
}

export const zodiac: { sign: string; abbr: string; from: [number, number] }[] = [
  { sign: 'Capricorn', abbr: 'Cp', from: [1, 1] },
  { sign: 'Aquarius', abbr: 'Aq', from: [1, 20] },
  { sign: 'Pisces', abbr: 'Pi', from: [2, 19] },
  { sign: 'Aries', abbr: 'Ar', from: [3, 21] },
  { sign: 'Taurus', abbr: 'Ta', from: [4, 20] },
  { sign: 'Gemini', abbr: 'Ge', from: [5, 21] },
  { sign: 'Cancer', abbr: 'Cn', from: [6, 21] },
  { sign: 'Leo', abbr: 'Le', from: [7, 23] },
  { sign: 'Virgo', abbr: 'Vi', from: [8, 23] },
  { sign: 'Libra', abbr: 'Li', from: [9, 23] },
  { sign: 'Scorpio', abbr: 'Sc', from: [10, 23] },
  { sign: 'Sagittarius', abbr: 'Sg', from: [11, 22] },
  { sign: 'Capricorn', abbr: 'Cp', from: [12, 22] },
]

/** Accepts "YYYY-MM-DD" or the roster's month/day-only "MM-DD". */
export function signFor(date: string) {
  const [m, d] = date.split('-').map(Number).slice(-2)
  if (!m || !d) return null
  let found = zodiac[0]
  for (const z of zodiac) if (m > z.from[0] || (m === z.from[0] && d >= z.from[1])) found = z
  return found
}

const fallbackLooks: Record<string, Look> = {
  lauren: { skin: '#F0C4A0', hair: '#8A4B2A', shirt: '#9A82C8' },
  esi: { skin: '#9A6440', hair: '#1C1916', shirt: '#4A8CC4' },
  brianna: { skin: '#E0B48C', hair: '#6B5444', shirt: '#E8968A' },
}
const defaultLook: Look = { skin: '#E0B48C', hair: '#2A1D16', shirt: '#6FA36F' }

export const friends: Record<string, Friend> = Object.fromEntries(seedPeople.map(p => [p.id, {
  id: p.id, name: p.name, first: p.first, color: p.color, look: fallbackLooks[p.id] ?? defaultLook,
  sign: signFor(p.birthday)?.sign ?? '', role: p.role, city: p.city, birthday: p.birthday, bio: p.bio, avatar: p.avatar,
} satisfies Friend]))

/** Roster in masthead order: the editor first. */
export const crew: Friend[] = seedPeople.map(p => friends[p.id]!)

const WEEK_MS = 7 * 86_400_000

/** Midnight on the Monday of the week containing `d`. */
export function mondayOf(d: Date) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7))
  return m
}

export const addDays = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** "Oct 19–25", or "Oct 26–Nov 1" when the week spans two months. */
export function weekLabel(monday: Date) {
  const sunday = addDays(monday, 6)
  const mon = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return sunday.getMonth() === monday.getMonth()
    ? `${mon}–${sunday.getDate()}`
    : `${mon}–${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

// Issue No. 43 covered the week of Monday, Oct 19, 2026; numbering counts up one per week from there.
const ISSUE_ANCHOR = { no: 43, monday: new Date(2026, 9, 19) }

function currentEdition(now = new Date()) {
  const monday = mondayOf(now)
  const deadline = addDays(monday, 6)
  deadline.setHours(23, 59, 0, 0)
  // Highlights close Sunday night; papers go to press Monday morning.
  let nextPress = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9)
  nextPress = addDays(nextPress, (1 - nextPress.getDay() + 7) % 7)
  if (nextPress <= now) nextPress = addDays(nextPress, 7)

  return {
    vol: 1,
    no: Math.max(1, ISSUE_ANCHOR.no + Math.round((monday.getTime() - ISSUE_ANCHOR.monday.getTime()) / WEEK_MS)),
    date: now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }),
    monday,
    week: weekLabel(monday),
    // Highlights for this edition close Sunday 11:59 p.m. local time.
    deadline,
    nextPress,
    nextPressLabel: nextPress.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
  }
}

// Fixed "today" for the demo: Monday, Oct 19, 2026, 9 a.m. The clock ticks forward from there
// while the page is open so countdowns still move.
export const DEMO_TODAY = new Date(2026, 9, 19, 9, 0, 0)
const loadedAt = Date.now()
export const demoNow = () => new Date(DEMO_TODAY.getTime() + (Date.now() - loadedAt))

export const edition = currentEdition(DEMO_TODAY)

export interface Story {
  id: string
  section: string
  headline: string
  author: string
  body: string
  /** Real event photo URLs; empty when none were supplied. */
  photos: string[]
  swatch: Swatch
  caption: string
  reactions: { ha: number; aww: number; hooray: number }
}

// Headlines and bodies only restate what each contributor supplied; nothing else is invented.
const storyCopy: Record<string, { section: string; headline: string; body: string; caption: string }> = {
  'lauren-highlight-1': { section: 'Music', headline: 'Lauren Catches sombr Live, Has So Much Fun', caption: 'All smiles',
    body: 'Lauren went to the sombr concert on Monday and had so much fun seeing him.' },
  'lauren-highlight-2': { section: 'Social', headline: 'Lauren Celebrates a Friend’s Engagement', caption: 'Grinning from ear to ear',
    body: 'Lauren went to a friend’s engagement party on Friday night.' },
  'esi-highlight-1': { section: 'Sports', headline: 'Esi Hits the Bowling Alley', caption: 'Wow that was good',
    body: 'Esi went bowling this week.' },
  'brianna-highlight-1': { section: 'Pets', headline: 'Brianna Adopts First Puppy, Finishes First 5K', caption: 'Feeling accomplished',
    body: 'Brianna adopted a first puppy, Biscuit, and brought Biscuit home on Tuesday. The pair have spent the week getting to know each other. Brianna also finished a first 5K at Lady Bird Lake and celebrated with delicious tacos.' },
}

export const stories: Story[] = seedHighlights.flatMap(h => {
  const c = storyCopy[h.id]
  const p = friends[h.personId]
  if (!c || !p) return []
  return [{ id: h.id, author: p.id, swatch: p.color, photos: h.photos, reactions: { ha: 0, aww: 0, hooray: 0 }, ...c }]
})

/** The prepared comics, each one complete image with its owner attached. */
export const comics = seedComics.flatMap(c => {
  const author = friends[c.personId]
  return author ? [{ ...c, author, photos: seedHighlights.filter(h => h.personId === c.personId).flatMap(h => h.photos) }] : []
})

export interface Birthday { person: Friend; date: Date }

/** Next occurrence of each roster birthday on or after `from` (month/day only; no year is ever shown). */
export function upcomingBirthdays(from: Date): Birthday[] {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  return crew.map(person => {
    const [m, d] = person.birthday.split('-').map(Number)
    let date = new Date(start.getFullYear(), (m ?? 1) - 1, d ?? 1)
    if (date < start) date = new Date(start.getFullYear() + 1, (m ?? 1) - 1, d ?? 1)
    return { person, date }
  }).sort((a, b) => a.date.getTime() - b.date.getTime())
}

// Generic readings for the signed-in reader's own sign.
export const signReadings: Record<string, string> = {
  Aries: 'You will volunteer for something before hearing the details. It works out.',
  Taurus: 'Comfort food is not a personality, but this week it is close.',
  Gemini: 'Two plans collide. Pick the one with snacks.',
  Cancer: 'Someone needs your couch and your advice. Offer one.',
  Leo: 'The group chat awaits your review. Be generous.',
  Virgo: 'Your color-coded calendar is finally appreciated. Briefly.',
  Libra: 'Balance returns, though not to your sleep schedule.',
  Scorpio: 'A secret is safe with you. Mostly.',
  Sagittarius: 'A spontaneous trip calls. Pack a charger.',
  Capricorn: 'Your effort is noticed by exactly the right person.',
  Aquarius: 'Your weird idea is the good idea. Say it out loud.',
  Pisces: 'A daydream becomes a plan. Write it down before brunch.',
}

export interface Paper {
  id: string
  name: string
  mono: string
  swatch: Swatch
  members: Swatch[]
  /** Total member count when it's larger than the avatars shown. */
  size?: number
  role: 'Editor' | 'Contributor'
  status: 'due' | 'new' | 'done'
  progress: string
  pressDay: string
}

/** Colour of the signed-in test user's avatar, apart from the three presets. */
export const youColor: Swatch = 'yellow'

// The test user joins as the fourth member; the three presets have already posted.
export const initialPapers: Paper[] = [
  { id: seedPaper.id, name: seedPaper.name, mono: seedPaper.mono, swatch: 'yellow', role: 'Contributor', status: 'due',
    members: [...crew.map(p => p.color), youColor], progress: `${seedPeople.length} of ${seedPeople.length + 1} friends have posted`,
    pressDay: seedPaper.pressDay },
]

export const findablePapers: Record<string, Omit<Paper, 'role' | 'status' | 'progress'> & { editor: string }> = {
  // The seeded paper, so a reader who leaves it can join again with a code.
  SNZ123: { id: seedPaper.id, name: seedPaper.name, mono: seedPaper.mono, swatch: 'yellow', editor: 'Lauren',
    members: initialPapers[0]!.members, size: initialPapers[0]!.size, pressDay: seedPaper.pressDay },
  BOOKCL: { id: 'bc', name: 'The Book Club Times', mono: 'BC', swatch: 'purple', editor: 'Demo editor',
    members: ['purple', 'pink', 'blue', 'yellow', 'green', 'orange', 'gray'], pressDay: 'Sunday' },
}

export interface Issue { no: number; week: string; headline: string; swatch: Swatch; recycleIn: number }

// The Snoozers have one edition so far, so there is no back catalog to invent.
export const issues: Issue[] = [
  { no: edition.no, week: edition.week, headline: stories.find(s => s.id === 'brianna-highlight-1')?.headline ?? 'This Week in The Snoozers',
    swatch: 'yellow', recycleIn: 14 },
]

export const savedIssues: Issue[] = []

export const swatchCycle: Swatch[] = ['blue', 'yellow', 'purple', 'green', 'pink']
export const moodCycle: Mood[] = ['o', 'grin', 'smile', 'flat']

// Sample edition copy for the welcome preview. Live papers start empty until Phase 4.

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
  look: Look
  sign: string
}

export const friends: Record<string, Friend> = {
  lauren: { id: 'lauren', name: 'Lauren', first: 'Lauren', color: 'pink', sign: 'Aries',
    look: { skin: '#F0C4A0', hair: '#8A4B2A', shirt: '#E8968A' } },
  diego: { id: 'diego', name: 'Diego R.', first: 'Diego', color: 'yellow', sign: 'Libra',
    look: { skin: '#C98A5E', hair: '#2A1D16', shirt: '#E89A3A' } },
  maya: { id: 'maya', name: 'Maya L.', first: 'Maya', color: 'blue', sign: 'Scorpio',
    look: { skin: '#F4D0AA', hair: '#B8261F', shirt: '#4A8CC4', hat: true } },
  priya: { id: 'priya', name: 'Priya S.', first: 'Priya', color: 'green', sign: 'Gemini',
    look: { skin: '#9A6440', hair: '#1C1916', shirt: '#6FA36F' } },
  sam: { id: 'sam', name: 'Sam K.', first: 'Sam', color: 'purple', sign: 'Capricorn',
    look: { skin: '#E0B48C', hair: '#6B5444', shirt: '#9A82C8', glasses: true } },
}

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
  // Papers go to press Saturday morning.
  let nextPress = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9)
  nextPress = addDays(nextPress, (6 - nextPress.getDay() + 7) % 7)
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

export const edition = currentEdition()

export interface Story {
  id: string
  section: string
  headline: string
  author: string
  body: string
  photos: number
  swatch: Swatch
  caption: string
  reactions: { ha: number; aww: number; hooray: number }
}

export const stories: Story[] = [
  { id: 'pup', section: 'Pets', headline: 'Austin Man Adopts First Pup!', author: 'diego',
    body: 'Diego brought home Biscuit, a nine-week-old lab mix, from the Austin Animal Center on Tuesday. Sources confirm Biscuit has already claimed the couch.',
    photos: 3, swatch: 'yellow', caption: 'Biscuit at Zilker', reactions: { ha: 4, aww: 11, hooray: 6 } },
  { id: '5k', section: 'Sports', headline: 'Maya Conquers First 5K, Demands Tacos', author: 'maya',
    body: 'She finished the Lady Bird Lake loop in 34 minutes and went straight to breakfast tacos. A second race is already on the calendar.',
    photos: 2, swatch: 'green', caption: 'the finish line', reactions: { ha: 7, aww: 2, hooray: 9 } },
  { id: 'job', section: 'News', headline: 'Sam Starts New Job at Downtown Design Studio', author: 'sam',
    body: 'Sam began a new role as a junior designer this Monday. The crew is planning a celebration this weekend.',
    photos: 1, swatch: 'purple', caption: 'first-day desk', reactions: { ha: 1, aww: 3, hooray: 12 } },
  { id: 'orgo', section: 'Campus', headline: 'Priya Survives Midterm Week on Cold Brew Alone', author: 'priya',
    body: 'Three exams in four days, one library carrel, zero regrets. Organic chemistry has been formally notified.',
    photos: 1, swatch: 'blue', caption: 'the library carrel', reactions: { ha: 10, aww: 4, hooray: 5 } },
]

export interface Panel { swatch: Swatch; mood: Mood; photos: number; caption: string }
export interface Strip { id: string; title: string; author: string; panels: Panel[] }

export const strips: Strip[] = [
  { id: 'dog', title: 'Diego Gets a Dog', author: 'diego', panels: [
    { swatch: 'blue', mood: 'o', photos: 2, caption: '“Wait… they’re ALL adoptable?”' },
    { swatch: 'yellow', mood: 'grin', photos: 3, caption: '“His name is Biscuit. He is perfect.”' },
    { swatch: 'purple', mood: 'flat', photos: 1, caption: '3 a.m. “Biscuit, please.”' },
    { swatch: 'green', mood: 'smile', photos: 2, caption: 'Morning walk. Worth it.' },
  ] },
  { id: '5k', title: 'Maya vs. the 5K', author: 'maya', panels: [
    { swatch: 'green', mood: 'flat', photos: 1, caption: 'Mile one. “This is fine.”' },
    { swatch: 'yellow', mood: 'grin', photos: 2, caption: 'The finish line appears!' },
    { swatch: 'pink', mood: 'smile', photos: 1, caption: 'Tacos: earned.' },
    { swatch: 'blue', mood: 'grin', photos: 1, caption: 'Signing up for the next one.' },
  ] },
  { id: 'midterm', title: 'Midterm Week', author: 'priya', panels: [
    { swatch: 'purple', mood: 'o', photos: 1, caption: 'Three exams. Four days.' },
    { swatch: 'blue', mood: 'flat', photos: 2, caption: 'Cold brew #6.' },
    { swatch: 'yellow', mood: 'grin', photos: 1, caption: 'Free at last.' },
    { swatch: 'pink', mood: 'smile', photos: 1, caption: 'Celebrating with something that is not cold brew.' },
  ] },
]

export const horoscopes = [
  { sign: 'Scorpio', abbr: 'Sc', friend: 'maya', swatch: 'pink' as Swatch, lucky: 21,
    text: 'A milestone arrives midweek. Let someone else pick the restaurant, then quietly order the best thing on the menu.' },
  { sign: 'Libra', abbr: 'Li', friend: 'diego', swatch: 'yellow' as Swatch, lucky: 9,
    text: 'Balance returns to your home, though not to your sleep schedule. A small creature requires your attention.' },
  { sign: 'Gemini', abbr: 'Ge', friend: 'priya', swatch: 'blue' as Swatch, lucky: 3,
    text: 'Your hard work pays off. Celebrate with something that is not cold brew.' },
  { sign: 'Capricorn', abbr: 'Cp', friend: 'sam', swatch: 'green' as Swatch, lucky: 1,
    text: 'New beginnings suit you. Bring snacks on day five and you will be remembered fondly.' },
]

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

export function signFor(isoDate: string) {
  const [, m, d] = isoDate.split('-').map(Number)
  if (!m || !d) return null
  let found = zodiac[0]
  for (const z of zodiac) if (m > z.from[0] || (m === z.from[0] && d >= z.from[1])) found = z
  return found
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


export interface Issue { no: number; week: string; headline: string; swatch: Swatch; recycleIn: number }

export const issues: Issue[] = [
  { no: 43, week: 'Oct 19–25', headline: 'Austin Man Adopts First Pup!', swatch: 'yellow', recycleIn: 14 },
  { no: 42, week: 'Oct 12–18', headline: 'Priya Declares War on Orgo', swatch: 'blue', recycleIn: 6 },
  { no: 41, week: 'Oct 5–11', headline: 'Crew Survives ACL, Barely', swatch: 'pink', recycleIn: 1 },
]

export const savedIssues: Issue[] = [
  { no: 36, week: 'Aug 31–Sep 6', headline: 'Diego Learns to Two-Step, Sort Of', swatch: 'green', recycleIn: Infinity },
]

export const swatchCycle: Swatch[] = ['blue', 'yellow', 'purple', 'green', 'pink']
export const moodCycle: Mood[] = ['o', 'grin', 'smile', 'flat']

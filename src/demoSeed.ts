// Normalized demo roster for The Snoozers. Mirrors contributor-seed/contributors.json (the canonical source),
// minus login emails: the frontend never carries them. Asset URLs resolve against the app's base URL.
import type { Swatch } from './data'

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/')
const demoUrl = (path: string) => `${BASE}demo/${path}`

export interface SeedPerson {
  id: string
  name: string
  first: string
  role: 'Editor' | 'Contributor'
  city: string
  /** Month and day only ("MM-DD"); no birth year was supplied. */
  birthday: string
  /** Empty until the owner supplies bios. */
  bio: string
  avatar: string
  color: Swatch
}

export interface SeedHighlight {
  id: string
  personId: string
  text: string
  photos: string[]
  inComic: boolean
  serious: boolean
}

export interface SeedComic {
  id: string
  personId: string
  title: string
  /** One complete image; show it whole, never cropped or split into panels. */
  src: string
  highlightIds: string[]
}

export const seedPaper = { id: 'crew', name: 'The Snoozers', pressDay: 'Monday', mono: 'TS' }

export const seedPeople: SeedPerson[] = [
  { id: 'lauren', name: 'Lauren', first: 'Lauren', role: 'Editor', city: 'Austin, TX', birthday: '07-22', bio: '',
    avatar: demoUrl('photos/lauren-avatar.jpg'), color: 'purple' },
  { id: 'esi', name: 'Esi', first: 'Esi', role: 'Contributor', city: 'Austin, TX', birthday: '12-19', bio: '',
    avatar: demoUrl('photos/esi_avatar.jpg'), color: 'blue' },
  { id: 'brianna', name: 'Brianna', first: 'Brianna', role: 'Contributor', city: 'Austin, TX', birthday: '04-05', bio: '',
    avatar: demoUrl('photos/brianna_avatar.jpg'), color: 'pink' },
]

export const seedHighlights: SeedHighlight[] = [
  { id: 'lauren-highlight-1', personId: 'lauren', inComic: true, serious: false,
    text: 'I went to the sombr concert on Monday! Had so much fun seeing him!',
    photos: [demoUrl('photos/concert.jpg'), demoUrl('photos/concert1.jpg')] },
  { id: 'lauren-highlight-2', personId: 'lauren', inComic: true, serious: false,
    text: 'Went to my friend\'s engagement party on Friday night!',
    photos: [demoUrl('photos/drinks.jpg'), demoUrl('photos/friends.jpg')] },
  { id: 'esi-highlight-1', personId: 'esi', inComic: true, serious: false,
    text: 'i went bowling this week',
    photos: [demoUrl('photos/esi_bowling.jpg')] },
  { id: 'brianna-highlight-1', personId: 'brianna', inComic: true, serious: false,
    text: 'This week, I adopted my first puppy, Biscuit! I brought her home on Tuesday, and we\'ve been spending time getting to know each other. I also completed my first 5K at Lady Bird Lake and celebrated afterward with some delicious tacos!',
    photos: [] },
]

// Titles are the app's own; the seed JSON gives every comic "What a Week!".
export const seedComics: SeedComic[] = [
  { id: 'lauren-comic', personId: 'lauren', title: 'Two Celebrations, One Good Week', src: demoUrl('comics/lauren/good_week.jpg'),
    highlightIds: ['lauren-highlight-1', 'lauren-highlight-2'] },
  { id: 'esi-comic', personId: 'esi', title: 'Gutter Balls & a Hackathon', src: demoUrl('comics/esi/esi_comic.jpg'), highlightIds: [] },
  { id: 'brianna-comic', personId: 'brianna', title: 'Biscuit, a 5K & Tacos', src: demoUrl('comics/brianna/brianna_2x2_comic_grid.png'),
    highlightIds: ['brianna-highlight-1'] },
]

/** Shown as the test user's comic when image generation fails or isn't available. */
export const defaultComicSrc = demoUrl('comics/default/sabrina-default.png')

/** Per-panel stand-ins for the strip, in panel order, used when a panel's image can't be generated. */
export const defaultPanelSrcs = [1, 2, 3, 4].map(n => demoUrl(`comics/sabrina/panels/Sabrina_Default_Panel-${n}.png`))

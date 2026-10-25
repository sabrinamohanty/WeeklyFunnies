import { z } from 'zod'
import { STYLE_KEYS } from './styles.ts'

// Caps from the handoff: at most 8 people, 500 characters per highlight.
const id = z.string().min(1).max(64).regex(/^[\w-]+$/)
const name = z.string().trim().min(1).max(40)
export const look = z.string().trim().min(3).max(200)
const generatedPath = z.string().regex(/^\/generated\/[a-f0-9]{40}\.(png|jpg|webp)$/)

export const personSchema = z.object({ id, name, look: look.optional(), avatarUrl: generatedPath.optional() })

export const avatarRequest = z.object({
  style: z.enum(STYLE_KEYS),
  look,
  /** A selfie as a data URL (png, jpeg or webp, up to ~5 MB). Used only to draw this person's own avatar. */
  photo: z.string().regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).max(7_000_000).optional(),
  /** Skip the cache and draw a new one. */
  fresh: z.boolean().optional(),
})

export const storyRequest = z.object({
  weekLabel: z.string().trim().min(1).max(40),
  people: z.array(personSchema).min(1).max(8),
  highlights: z.array(z.object({
    personId: id,
    text: z.string().trim().min(1).max(500),
    serious: z.boolean().default(false),
    inComic: z.boolean().default(true),
  })).min(1).max(24),
})

export const panelRequest = z.object({
  style: z.enum(STYLE_KEYS),
  panel: z.object({ scene: z.string().trim().min(3).max(300), characters: z.array(id).min(1).max(2) }),
  people: z.array(personSchema).min(1).max(8),
  fresh: z.boolean().optional(),
})

const words = (max: number) => (s: string) => s.trim().split(/\s+/).length <= max
const clean = (s: string) => !/[<>[\]]|https?:|@\w+\.\w+/.test(s)

export const storyOutput = z.object({
  article: z.object({
    headline: z.string().trim().min(1).max(120).refine(clean),
    byline: z.string().trim().min(1).max(40),
    body: z.string().trim().min(1).max(1500).refine(clean),
  }),
  comic: z.object({
    title: z.string().trim().min(1).max(80),
    panels: z.array(z.object({
      scene: z.string().trim().min(1).max(300),
      caption: z.string().trim().max(200).nullable().refine(c => c === null || words(15)(c)),
      dialogue: z.array(z.object({
        speaker: z.string().trim().min(1).max(40),
        text: z.string().trim().min(1).max(200).refine(words(12)),
        side: z.enum(['left', 'right']),
      })).max(2),
      characters: z.array(id).min(1).max(2),
    })).length(4),
  }).nullable(),
})
export type StoryOutput = z.infer<typeof storyOutput>

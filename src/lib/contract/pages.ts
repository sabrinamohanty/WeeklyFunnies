import { z } from "zod";
import { isoDate, signedUrl, styleKeySchema, timestamp, uuid } from "./common";
import { generationErrorSchema, generationStatusSchema } from "./profile";
import { TEXT_LIMITS, textField } from "./text";

// A page is one person's contribution for one week: up to 3 highlights, a story for each, and one
// 4-panel comic strip starring them in their own style. It's written once and linked to every paper
// the person picks; each linked paper shows it once that paper's edition is published.

export const pageIdParams = z.strictObject({ pageId: uuid });
export const pageStoryParams = z.strictObject({ pageId: uuid, storyId: uuid });
export const pagePanelParams = z.strictObject({
  pageId: uuid,
  index: z.enum(["0", "1", "2", "3"]).transform(Number).meta({ description: "Panel index, 0 to 3." }),
});
export const highlightIdParams = z.strictObject({ highlightId: uuid });
export const photoIdParams = z.strictObject({ photoId: uuid });

export const PAGE_LIMITS = {
  highlights: 3,
  photosPerHighlight: 4,
  papers: 10,
  panels: 4,
  regenerations: 5,
  rewrites: 10,
  redraws: 12,
} as const;

export const STORY_SECTIONS = [
  "news",
  "sports",
  "pets",
  "campus",
  "work",
  "food",
  "travel",
  "arts",
  "family",
  "home",
  "outdoors",
  "milestones",
] as const;
export const storySectionSchema = z.enum(STORY_SECTIONS).meta({
  id: "StorySection",
  description: "Section label for the story's kicker. Capitalize it for display.",
});
export type StorySection = z.infer<typeof storySectionSchema>;

// ---------- Photos ----------

export const photoSchema = z
  .strictObject({
    id: uuid,
    highlightId: uuid,
    url: signedUrl,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    createdAt: timestamp,
  })
  .meta({ id: "Photo" });

export const photoResponseSchema = z.strictObject({ photo: photoSchema });

export const photoUploadSchema = z
  .strictObject({
    photo: z.any().meta({
      type: "string",
      format: "binary",
      description: "JPEG or PNG, at most 12 MB. Moderated, re-encoded server-side; all metadata is stripped.",
    }),
  })
  .meta({ id: "PhotoUpload" });

// ---------- Highlights ----------

export const highlightNoticeSchema = z.enum(["marked_serious"]).meta({
  id: "HighlightNotice",
  description:
    "marked_serious: moderation flagged the topic as sensitive, so serious was turned on and inComic off. " +
    "Serious highlights get a gentle story and never appear in the comic.",
});

/** A highlight as seen by its author. Readers only ever see the generated stories. */
export const highlightSchema = z
  .strictObject({
    id: uuid,
    pageId: uuid,
    text: z.string().meta({ description: "What the author wrote. Only returned to the author." }),
    serious: z.boolean(),
    inComic: z.boolean(),
    position: z.number().int().nonnegative(),
    photos: z.array(photoSchema).max(PAGE_LIMITS.photosPerHighlight),
    notices: z.array(highlightNoticeSchema),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .meta({ id: "Highlight" });

const highlightText = textField({
  max: TEXT_LIMITS.highlight,
  mode: "multiline",
  description: "The highlight, in the author's words.",
});

export const createHighlightRequestSchema = z
  .strictObject({
    text: highlightText,
    serious: z.boolean().default(false),
    inComic: z.boolean().default(true).meta({ description: "Ignored (forced off) when serious is true." }),
  })
  .meta({ id: "CreateHighlightRequest" });

export const updateHighlightRequestSchema = z
  .strictObject({
    text: highlightText.optional(),
    serious: z.boolean().optional(),
    inComic: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "At least one field is required" })
  .meta({
    id: "UpdateHighlightRequest",
    description: "Any change marks a generated page stale and clears its approval.",
  });

export const reorderHighlightsRequestSchema = z
  .strictObject({
    highlightIds: z
      .array(uuid)
      .min(1)
      .max(PAGE_LIMITS.highlights)
      .refine((ids) => new Set(ids).size === ids.length, { message: "Duplicate ids" })
      .meta({ description: "All of the page's highlight ids, in the new order." }),
  })
  .meta({ id: "ReorderHighlightsRequest" });

export const highlightResponseSchema = z.strictObject({ highlight: highlightSchema });

// ---------- Stories and comic ----------

export const storySchema = z
  .strictObject({
    id: uuid,
    highlightId: uuid,
    section: storySectionSchema,
    headline: z.string().meta({ description: `At most ${TEXT_LIMITS.headline} characters.` }),
    body: z.string().meta({ description: "One to three sentences, plain text." }),
    photos: z.array(signedUrl).max(PAGE_LIMITS.photosPerHighlight).meta({
      description: "The highlight's photos. Show a count badge and open them in the lightbox.",
    }),
  })
  .meta({ id: "Story" });

export const panelImageSchema = z
  .strictObject({
    status: generationStatusSchema,
    url: signedUrl.nullable(),
    error: generationErrorSchema.nullable(),
  })
  .meta({
    id: "PanelImage",
    description: "Show a loading state while pending or generating, and a retry on failed.",
  });

export const dialogueLineSchema = z
  .strictObject({
    text: z.string().meta({ description: "At most 12 words. Rendered by the client as an overlaid bubble." }),
    side: z.enum(["left", "right"]),
  })
  .meta({ id: "DialogueLine", description: "Spoken by the page's author." });

export const panelSchema = z
  .strictObject({
    index: z.number().int().min(0).max(3),
    caption: z.string().nullable().meta({ description: "At most 15 words. Overlaid by the client." }),
    dialogue: z.array(dialogueLineSchema).max(2),
    highlightId: uuid.meta({ description: "The highlight this panel shows." }),
    image: panelImageSchema,
    photos: z.array(signedUrl).max(PAGE_LIMITS.photosPerHighlight).meta({
      description: "Real photos from the panel's highlight. Show a count badge when nonzero.",
    }),
  })
  .meta({ id: "Panel" });

export const comicSchema = z
  .strictObject({
    title: z.string(),
    panels: z.array(panelSchema).length(PAGE_LIMITS.panels).meta({ description: "In display order." }),
  })
  .meta({ id: "Comic" });

// ---------- Page ----------

export const pageStatusSchema = z.enum(["writing", "generated", "approved"]).meta({
  id: "PageStatus",
  description:
    "writing: highlights only. generated: stories and comic exist. approved: the author signed off; any " +
    "edit returns it to generated.",
});

export const pageNoticeSchema = z.enum(["fallback_used", "stale"]).meta({
  id: "PageNotice",
  description:
    "fallback_used: generation failed validation, so safe default text was used; edit or regenerate. " +
    "stale: highlights changed after generation; regenerate before approving.",
});

export const pagePaperSchema = z
  .strictObject({
    paperId: uuid,
    paperName: z.string(),
    editionId: uuid,
    deadline: timestamp.meta({ description: "Sunday 11:59 p.m. in that paper owner's timezone." }),
  })
  .meta({ id: "PagePaper" });

export const pageSchema = z
  .strictObject({
    id: uuid,
    weekStart: isoDate.meta({ description: "Monday of the page's week." }),
    weekEnd: isoDate,
    deadline: timestamp.meta({ description: "The earliest deadline among the linked papers." }),
    locked: z.boolean().meta({ description: "True once the deadline has passed. Nothing can change." }),
    style: styleKeySchema.meta({ description: "The author's style when the comic was generated." }),
    papers: z.array(pagePaperSchema).max(PAGE_LIMITS.papers),
    status: pageStatusSchema,
    highlights: z.array(highlightSchema).max(PAGE_LIMITS.highlights),
    stories: z.array(storySchema).max(PAGE_LIMITS.highlights).meta({ description: "In highlight order." }),
    comic: comicSchema
      .nullable()
      .meta({ description: "Null before generation, or when every highlight is serious." }),
    notices: z.array(pageNoticeSchema),
    limits: z.strictObject({
      regenerationsLeft: z.number().int().nonnegative(),
      rewritesLeft: z.number().int().nonnegative(),
      redrawsLeft: z.number().int().nonnegative(),
    }),
    generatedAt: timestamp.nullable(),
    approvedAt: timestamp.nullable(),
    urlsExpireAt: timestamp,
  })
  .meta({ id: "Page", description: "Only ever returned to its author." });

export const pageResponseSchema = z.strictObject({ page: pageSchema });
export const currentPageResponseSchema = z.strictObject({
  page: pageSchema.nullable().meta({ description: "Null until you pick papers for this week." }),
});

export const setPagePapersRequestSchema = z
  .strictObject({
    paperIds: z
      .array(uuid)
      .min(1)
      .max(PAGE_LIMITS.papers)
      .refine((ids) => new Set(ids).size === ids.length, { message: "Duplicate ids" })
      .meta({ description: "Papers you belong to whose current edition is still open." }),
  })
  .meta({ id: "SetPagePapersRequest" });

export const generatePageRequestSchema = z
  .strictObject({
    regenerate: z.boolean().default(false).meta({
      description: "Write new stories and a new comic even if they exist. Resets panel images. Limited.",
    }),
  })
  .meta({ id: "GeneratePageRequest" });

const headlineEdit = textField({ max: TEXT_LIMITS.headline });
const storyBodyEdit = textField({ max: TEXT_LIMITS.article, mode: "multiline" });
const dialogueEdit = textField({ max: 100, description: "Dialogue line. At most 12 words." });
const captionEdit = textField({ max: 120, description: "Caption. At most 15 words." });

export const updatePageRequestSchema = z
  .strictObject({
    stories: z
      .array(z.strictObject({ id: uuid, headline: headlineEdit.optional(), body: storyBodyEdit.optional() }))
      .max(PAGE_LIMITS.highlights)
      .optional(),
    comic: z
      .strictObject({
        title: textField({ max: 80 }).optional(),
        panels: z
          .array(
            z.strictObject({
              index: z.number().int().min(0).max(3),
              caption: captionEdit.nullable().optional(),
              dialogue: z
                .array(z.strictObject({ text: dialogueEdit }))
                .max(2)
                .optional()
                .meta({ description: "Replaces the text of the existing lines in order; sides are kept." }),
            }),
          )
          .max(PAGE_LIMITS.panels)
          .optional(),
      })
      .optional(),
  })
  .refine((b) => b.stories !== undefined || b.comic !== undefined, { message: "Nothing to edit" })
  .meta({ id: "UpdatePageRequest", description: "Edited text is moderated. Clears approval." });

export const storyResponseSchema = z.strictObject({ story: storySchema });

export const drawPanelRequestSchema = z
  .strictObject({
    regenerate: z.boolean().default(false).meta({
      description: "Draw a new image even if one is ready. Counts toward the page and daily caps.",
    }),
  })
  .meta({ id: "DrawPanelRequest" });

export const panelResponseSchema = z.strictObject({ panel: panelSchema });

export const reorderPanelsRequestSchema = z
  .strictObject({
    order: z
      .array(z.number().int().min(0).max(3))
      .length(PAGE_LIMITS.panels)
      .refine((o) => new Set(o).size === o.length, { message: "Must be a permutation of 0 to 3" })
      .meta({ description: "Current panel indexes in their new order, e.g. [1, 0, 2, 3]." }),
  })
  .meta({ id: "ReorderPanelsRequest" });

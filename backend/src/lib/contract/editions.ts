import { z } from "zod";
import { isoDate, roleSchema, signedUrl, styleKeySchema, timestamp, uuid, zodiacSignSchema } from "./common";
import { generationErrorSchema, generationStatusSchema } from "./profile";
import { TEXT_LIMITS, textField } from "./text";

export const editionIdParams = z.strictObject({ editionId: uuid });
export const highlightIdParams = z.strictObject({ highlightId: uuid });
export const photoIdParams = z.strictObject({ photoId: uuid });

export const HIGHLIGHT_LIMITS = { perPersonPerEdition: 3, photosPerHighlight: 4 } as const;

export const GENERATION_LIMITS = {
  storyRegenerationsPerEdition: 5,
  panelRegenerationsPerEdition: 12,
} as const;

// ---------- Editions ----------

export const editionStatusSchema = z.enum(["draft", "published"]).meta({ id: "EditionStatus" });

export const editionSummarySchema = z
  .strictObject({
    id: uuid,
    paperId: uuid,
    weekStart: isoDate.meta({ description: "Monday, in the paper owner's timezone." }),
    weekEnd: isoDate.meta({ description: "Sunday, in the paper owner's timezone." }),
    status: editionStatusSchema,
    publishedAt: timestamp.nullable(),
    expiresAt: timestamp.nullable().meta({ description: "Set at publish: publishedAt + retention days." }),
  })
  .meta({ id: "EditionSummary" });

export const editionResponseSchema = z.strictObject({ edition: editionSummarySchema });
export const editionsResponseSchema = z.strictObject({ editions: z.array(editionSummarySchema) });

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
    "Serious highlights can appear gently in the article but never in the comic.",
});

/** A highlight as seen by its author. Other members never see highlight text directly. */
export const highlightSchema = z
  .strictObject({
    id: uuid,
    editionId: uuid,
    userId: uuid,
    text: z.string().meta({ description: "What the author wrote. Only returned to the author." }),
    serious: z.boolean(),
    inComic: z.boolean(),
    approved: z.boolean().meta({ description: "Only approved highlights go into the story." }),
    position: z.number().int().nonnegative(),
    photos: z.array(photoSchema).max(HIGHLIGHT_LIMITS.photosPerHighlight),
    notices: z.array(highlightNoticeSchema),
    createdAt: timestamp,
    updatedAt: timestamp,
    expiresAt: timestamp,
  })
  .meta({ id: "Highlight" });

const highlightText = textField({
  max: TEXT_LIMITS.highlight,
  mode: "multiline",
  description: "The highlight, in the author's words.",
});

export const createHighlightRequestSchema = z
  .strictObject({ editionId: uuid, text: highlightText, serious: z.boolean().default(false) })
  .meta({ id: "CreateHighlightRequest" });

export const updateHighlightRequestSchema = z
  .strictObject({
    text: highlightText.optional(),
    serious: z.boolean().optional(),
    inComic: z.boolean().optional(),
    approved: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "At least one field is required" })
  .meta({
    id: "UpdateHighlightRequest",
    description: "Editing text, serious, or inComic clears approval unless approved=true is sent too.",
  });

export const reorderRequestSchema = z
  .strictObject({
    highlightIds: z
      .array(uuid)
      .min(1)
      .max(HIGHLIGHT_LIMITS.perPersonPerEdition)
      .refine((ids) => new Set(ids).size === ids.length, { message: "Duplicate ids" })
      .meta({ description: "All of the caller's highlight ids in this edition, in the new order." }),
  })
  .meta({ id: "ReorderRequest" });

export const highlightResponseSchema = z.strictObject({ highlight: highlightSchema });
export const reorderResponseSchema = z.strictObject({
  highlights: z.array(z.strictObject({ id: uuid, position: z.number().int().nonnegative() })),
});

// ---------- Story: one article and one 4-panel comic per edition ----------
// Shapes follow the comic pipeline handoff (article, comic.panels[].scene/caption/dialogue/characters),
// plus server fields: ids, image status, photos, and notices.

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
    speaker: z.string().meta({ description: "Display name to render in the bubble." }),
    speakerUserId: uuid,
    text: z.string().meta({ description: "At most 12 words. Rendered by the client as an overlaid bubble." }),
    side: z.enum(["left", "right"]),
  })
  .meta({ id: "DialogueLine" });

export const storyPanelSchema = z
  .strictObject({
    index: z.number().int().min(0).max(3),
    scene: z.string().meta({ description: "What the image shows. Never contains text to draw." }),
    caption: z.string().nullable().meta({ description: "At most 15 words. Overlaid by the client." }),
    dialogue: z.array(dialogueLineSchema).max(2),
    characters: z.array(uuid).min(1).max(2).meta({ description: "User ids of the people in frame." }),
    sources: z.array(uuid).min(1).max(2).meta({ description: "The highlight ids this panel shows." }),
    imageUrl: signedUrl.nullable().meta({ description: "Same as image.url, for convenience." }),
    image: panelImageSchema,
    photos: z
      .array(signedUrl)
      .max(2 * HIGHLIGHT_LIMITS.photosPerHighlight)
      .meta({
        description: "Real photos attached to the source highlights. Show a count badge when nonzero.",
      }),
  })
  .meta({ id: "StoryPanel" });

export const storyNoticeSchema = z.enum(["fallback_used", "stale"]).meta({
  id: "StoryNotice",
  description:
    "fallback_used: generation failed validation, so safe default text was used; edit or regenerate. " +
    "stale: approved highlights changed after the story was generated; regenerate before publishing.",
});

export const storySchema = z
  .strictObject({
    editionId: uuid,
    article: z.strictObject({
      headline: z.string(),
      byline: z.string().meta({ description: "One of the members' names." }),
      bylineUserId: uuid,
      body: z.string().meta({ description: "3 to 5 short paragraphs separated by a blank line." }),
    }),
    comic: z
      .strictObject({ title: z.string(), panels: z.array(storyPanelSchema).length(4) })
      .nullable()
      .meta({ description: "Null when no approved highlight is eligible for the comic (all serious)." }),
    notices: z.array(storyNoticeSchema),
    regenerationsLeft: z.number().int().nonnegative(),
    generatedAt: timestamp,
  })
  .meta({ id: "Story" });

export const storyResponseSchema = storySchema;

export const storyQuerySchema = z.strictObject({ editionId: uuid });

/** Client echoes from the handoff bodies. Ids are checked against the database; other fields are ignored. */
const personEcho = z
  .strictObject({
    id: uuid,
    name: z.string().max(200).optional(),
    look: z.string().max(400).optional(),
  })
  .meta({ id: "PersonRef" });

const highlightEcho = z
  .strictObject({
    personId: uuid,
    id: uuid.optional(),
    text: z.string().max(4_000).optional().meta({ description: "Ignored. The stored text is used." }),
  })
  .meta({ id: "HighlightRef" });

export const generateStoryRequestSchema = z
  .strictObject({
    editionId: uuid,
    people: z.array(personEcho).max(8).optional().meta({
      description: "Optional. Every id must be a member of the edition's paper.",
    }),
    highlights: z.array(highlightEcho).max(24).optional().meta({
      description: "Optional. Every personId must be a member; every id must be a highlight in this edition.",
    }),
    regenerate: z.boolean().default(false).meta({
      description: "Write a new story even if one exists. Resets every panel image. Limited per edition.",
    }),
  })
  .meta({ id: "GenerateStoryRequest" });

const dialogueEdit = textField({ max: 100, description: "Dialogue line. At most 12 words." });
const captionEdit = textField({ max: 120, description: "Caption. At most 15 words." });

export const updateStoryRequestSchema = z
  .strictObject({
    editionId: uuid,
    headline: textField({ max: TEXT_LIMITS.headline }).optional(),
    body: textField({ max: 1_500, mode: "multiline" }).optional(),
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
            .meta({
              description: "Replaces the text of the existing lines in order; speakers and sides are kept.",
            }),
        }),
      )
      .max(4)
      .optional(),
  })
  .refine((b) => Object.keys(b).length > 1, { message: "At least one field to edit is required" })
  .meta({
    id: "UpdateStoryRequest",
    description: "Owner edits. Edited text is moderated. Draft editions only.",
  });

export const generatePanelRequestSchema = z
  .strictObject({
    editionId: uuid,
    index: z.number().int().min(0).max(3).meta({ description: "Which panel of the stored story to draw." }),
    style: styleKeySchema.optional().meta({ description: "If sent, must equal the paper's style." }),
    panel: z
      .strictObject({
        scene: z.string().max(1_000),
        caption: z.string().max(400).nullable().optional(),
        dialogue: z.array(z.unknown()).max(2).optional(),
        characters: z.array(uuid).max(2).optional(),
      })
      .optional()
      .meta({
        description:
          "Optional echo of the panel. If sent, scene and characters must match the stored story; the " +
          "stored panel is always what gets drawn.",
      }),
    people: z.array(personEcho).max(8).optional().meta({ description: "Optional. Ids must be members." }),
    regenerate: z.boolean().default(false).meta({
      description: "Draw a new image even if one is ready. Counts toward the per-edition and daily caps.",
    }),
  })
  .meta({ id: "GeneratePanelRequest" });

export const generatePanelResponseSchema = z
  .strictObject({
    imageUrl: signedUrl,
    editionId: uuid,
    index: z.number().int().min(0).max(3),
    status: z.literal("ready"),
  })
  .meta({ id: "GeneratePanelResponse" });

// ---------- Edition bundle ----------

export const weatherSchema = z
  .strictObject({
    city: z.string(),
    timezone: z.string(),
    fetchedAt: timestamp,
    days: z
      .array(
        z.strictObject({
          date: isoDate,
          tempMaxC: z.number(),
          tempMinC: z.number(),
          precipitationChance: z.number().int().min(0).max(100).nullable(),
          weatherCode: z.number().int().meta({ description: "WMO weather interpretation code." }),
          summary: z.string().meta({ description: "Short label for the code, e.g. 'Light rain'." }),
        }),
      )
      .max(7),
  })
  .meta({ id: "Weather", description: "7-day forecast for the reader's own city." });

export const progressSchema = z
  .strictObject({ userId: uuid, status: z.enum(["not_started", "in_progress", "approved"]) })
  .meta({ id: "Progress", description: "Each member's highlight status for this edition. No content." });

export const editionBundleSchema = z
  .strictObject({
    edition: editionSummarySchema.extend({ paperName: z.string(), style: styleKeySchema }),
    viewer: z.strictObject({ userId: uuid, role: roleSchema }),
    members: z.array(
      z.strictObject({
        userId: uuid,
        name: z.string(),
        city: z.string().nullable(),
        zodiacSign: zodiacSignSchema.nullable(),
        avatarUrl: signedUrl.nullable().meta({ description: "In the paper's style." }),
        role: roleSchema,
      }),
    ),
    myHighlights: z
      .array(highlightSchema)
      .meta({ description: "The viewer's own highlights in this edition, with review fields." }),
    progress: z.array(progressSchema),
    story: storySchema.nullable().meta({
      description: "Draft: visible to the owner only. Published: visible to every member.",
    }),
    weather: weatherSchema.nullable(),
    horoscopes: z.array(z.strictObject({ sign: zodiacSignSchema, text: z.string(), userIds: z.array(uuid) })),
    birthdays: z.array(
      z.strictObject({
        userId: uuid,
        name: z.string(),
        monthDay: z
          .string()
          .regex(/^\d{2}-\d{2}$/)
          .meta({ description: "MM-DD. The year is never sent." }),
      }),
    ),
    urlsExpireAt: timestamp,
  })
  .meta({ id: "EditionBundle" });

export const editionBundleResponseSchema = z.strictObject({ bundle: editionBundleSchema });

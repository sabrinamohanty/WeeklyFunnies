import { z } from "zod";
import { isoDate, roleSchema, signedUrl, timestamp, uuid, zodiacSignSchema } from "./common";
import { generationErrorSchema, generationStatusSchema } from "./profile";
import { TEXT_LIMITS, textField } from "./text";

export const editionIdParams = z.strictObject({ editionId: uuid });
export const eventIdParams = z.strictObject({ eventId: uuid });
export const photoIdParams = z.strictObject({ photoId: uuid });

export const EVENT_LIMITS = { perPersonPerEdition: 3, photosPerEvent: 4 } as const;

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
    eventId: uuid,
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
      description: "JPEG or PNG, at most 12 MB. Re-encoded server-side; all metadata is stripped.",
    }),
  })
  .meta({ id: "PhotoUpload" });

// ---------- Events ----------

export const panelSchema = z
  .strictObject({
    status: generationStatusSchema,
    url: signedUrl.nullable(),
    error: generationErrorSchema.nullable(),
  })
  .meta({ id: "Panel" });

export const eventNoticeSchema = z.enum(["fallback_used", "marked_serious"]).meta({
  id: "EventNotice",
  description:
    "fallback_used: generation failed validation and safe default text was used; edit before approving. " +
    "marked_serious: moderation flagged the topic as sensitive, so serious was turned on.",
});

const eventBase = {
  id: uuid,
  editionId: uuid,
  userId: uuid,
  headline: z.string(),
  article: z.string(),
  serious: z.boolean(),
  inComic: z.boolean(),
  position: z.number().int().nonnegative(),
  panel: panelSchema,
  photos: z.array(photoSchema).max(EVENT_LIMITS.photosPerEvent),
};

/** An event as seen by its author. */
export const ownEventSchema = z
  .strictObject({
    ...eventBase,
    sourceText: z.string().meta({ description: "What the author wrote. Only returned to the author." }),
    approved: z.boolean(),
    notices: z.array(eventNoticeSchema),
    createdAt: timestamp,
    updatedAt: timestamp,
    expiresAt: timestamp,
  })
  .meta({ id: "OwnEvent" });

/** An event as seen by other members, inside the edition bundle. */
export const bundleEventSchema = z.strictObject(eventBase).meta({ id: "BundleEvent" });

export const createEventRequestSchema = z
  .strictObject({
    editionId: uuid,
    text: textField({
      max: TEXT_LIMITS.highlight,
      mode: "multiline",
      description: "The highlight, in the author's words.",
    }),
    serious: z.boolean().default(false),
  })
  .meta({ id: "CreateEventRequest" });

export const updateEventRequestSchema = z
  .strictObject({
    headline: textField({ max: TEXT_LIMITS.headline }).optional(),
    article: textField({ max: TEXT_LIMITS.article, mode: "multiline" }).optional(),
    serious: z.boolean().optional(),
    inComic: z.boolean().optional(),
    approved: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "At least one field is required" })
  .meta({
    id: "UpdateEventRequest",
    description:
      "Editing headline, article, serious, or inComic clears approval unless approved=true is sent too.",
  });

export const requestPanelRequestSchema = z
  .strictObject({
    regenerate: z
      .boolean()
      .default(false)
      .meta({ description: "Generate a new panel even if one is ready. Counts toward the daily image cap." }),
  })
  .meta({ id: "RequestPanelRequest" });

export const reorderRequestSchema = z
  .strictObject({
    eventIds: z
      .array(uuid)
      .min(1)
      .max(EVENT_LIMITS.perPersonPerEdition)
      .refine((ids) => new Set(ids).size === ids.length, { message: "Duplicate ids" })
      .meta({ description: "All of the caller's event ids in this edition, in the new order." }),
  })
  .meta({ id: "ReorderRequest" });

export const eventResponseSchema = z.strictObject({ event: ownEventSchema });
export const panelResponseSchema = z.strictObject({ eventId: uuid, panel: panelSchema });
export const reorderResponseSchema = z.strictObject({
  events: z.array(z.strictObject({ id: uuid, position: z.number().int().nonnegative() })),
});

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

export const stripSchema = z
  .strictObject({
    userId: uuid,
    status: z.enum(["not_started", "in_progress", "approved"]),
    events: z.array(bundleEventSchema).max(EVENT_LIMITS.perPersonPerEdition),
  })
  .meta({
    id: "Strip",
    description:
      "In a draft edition, events is always empty: members see only their own posts (in myEvents) " +
      "and each other's progress status. Events appear once the edition is published.",
  });

export const editionBundleSchema = z
  .strictObject({
    edition: editionSummarySchema.extend({ paperName: z.string() }),
    viewer: z.strictObject({ userId: uuid, role: roleSchema }),
    members: z.array(
      z.strictObject({
        userId: uuid,
        name: z.string(),
        city: z.string().nullable(),
        zodiacSign: zodiacSignSchema.nullable(),
        avatarUrl: signedUrl.nullable(),
        role: roleSchema,
      }),
    ),
    myEvents: z
      .array(ownEventSchema)
      .meta({ description: "The viewer's own events in this edition, with review fields." }),
    strips: z.array(stripSchema),
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

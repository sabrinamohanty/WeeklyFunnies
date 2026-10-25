import { z } from "zod";
import { isoDate, roleSchema, signedUrl, styleKeySchema, timestamp, uuid, zodiacSignSchema } from "./common";
import { comicSchema, storySchema } from "./pages";

export const editionIdParams = z.strictObject({ editionId: uuid });
export const editionStoryParams = z.strictObject({ editionId: uuid, storyId: uuid });

// ---------- Editions ----------

export const editionStatusSchema = z.enum(["draft", "published"]).meta({ id: "EditionStatus" });

export const editionSummarySchema = z
  .strictObject({
    id: uuid,
    paperId: uuid,
    issueNumber: z.number().int().positive().meta({ description: "1 for the paper's first edition." }),
    weekStart: isoDate.meta({ description: "Monday, in the paper owner's timezone." }),
    weekEnd: isoDate.meta({ description: "Sunday, in the paper owner's timezone." }),
    deadline: timestamp.meta({
      description: "Sunday 11:59 p.m. in the owner's timezone. Pages lock then; the owner publishes after.",
    }),
    status: editionStatusSchema,
    publishedAt: timestamp.nullable(),
    expiresAt: timestamp.nullable().meta({
      description: "When it will be deleted: publishedAt + 14 days. Null while a draft or while saved.",
    }),
    savedAt: timestamp.nullable().meta({ description: "Set when the owner saves it to keep forever." }),
  })
  .meta({ id: "EditionSummary" });

export const editionResponseSchema = z.strictObject({ edition: editionSummarySchema });
export const editionsResponseSchema = z.strictObject({ editions: z.array(editionSummarySchema) });

export const saveEditionRequestSchema = z
  .strictObject({
    saved: z.boolean().meta({ description: "true keeps it forever; false restores the 14-day expiry." }),
  })
  .meta({ id: "SaveEditionRequest" });

// ---------- Reactions ----------

export const REACTIONS = ["ha", "aww", "hooray"] as const;
export const reactionSchema = z.enum(REACTIONS).meta({ id: "Reaction" });

export const reactionCountsSchema = z
  .strictObject({
    ha: z.number().int().nonnegative(),
    aww: z.number().int().nonnegative(),
    hooray: z.number().int().nonnegative(),
  })
  .meta({ id: "ReactionCounts", description: "Counts from members of this edition's paper only." });

export const setReactionRequestSchema = z
  .strictObject({ reaction: reactionSchema.nullable().meta({ description: "null removes your reaction." }) })
  .meta({ id: "SetReactionRequest" });

export const reactionResponseSchema = z
  .strictObject({ reactions: reactionCountsSchema, myReaction: reactionSchema.nullable() })
  .meta({ id: "ReactionResult" });

// ---------- Edition bundle ----------

export const progressSchema = z
  .strictObject({ userId: uuid, status: z.enum(["not_started", "in_progress", "approved"]) })
  .meta({ id: "Progress", description: "Each member's page status for this edition. No content." });

export const publishedStorySchema = storySchema
  .extend({ reactions: reactionCountsSchema, myReaction: reactionSchema.nullable() })
  .meta({ id: "PublishedStory" });

export const publishedPageSchema = z
  .strictObject({
    pageId: uuid,
    authorId: uuid.meta({ description: "Matches a userId in members." }),
    style: styleKeySchema,
    stories: z.array(publishedStorySchema),
    comic: comicSchema.nullable(),
  })
  .meta({ id: "PublishedPage" });

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
        style: styleKeySchema,
        avatarUrl: signedUrl.nullable().meta({ description: "In the member's own style." }),
        role: roleSchema,
      }),
    ),
    progress: z.array(progressSchema),
    pages: z.array(publishedPageSchema).meta({
      description:
        "Published editions: every approved page, in a stable shuffled order. Drafts: empty; use " +
        "GET /api/pages/current for your own page.",
    }),
    horoscopes: z.array(
      z.strictObject({
        sign: zodiacSignSchema,
        text: z.string(),
        luckyNumber: z.number().int().min(1).max(99),
        userIds: z.array(uuid).meta({ description: "Members with this sign." }),
      }),
    ),
    birthdays: z.array(
      z.strictObject({
        userId: uuid,
        name: z.string(),
        monthDay: z
          .string()
          .regex(/^\d{2}-\d{2}$/)
          .meta({ description: "MM-DD. The year and age are never sent." }),
      }),
    ),
    urlsExpireAt: timestamp,
  })
  .meta({ id: "EditionBundle" });

export const editionBundleResponseSchema = z.strictObject({ bundle: editionBundleSchema });

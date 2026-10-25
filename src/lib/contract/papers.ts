import { z } from "zod";
import { roleSchema, signedUrl, timestamp, uuid, zodiacSignSchema } from "./common";
import { TEXT_LIMITS, textField } from "./text";

export const PAPER_MAX_MEMBERS = 8;

export const paperIdParams = z.strictObject({ paperId: uuid });
export const inviteIdParams = z.strictObject({ paperId: uuid, inviteId: uuid });

export const paperSchema = z
  .strictObject({
    id: uuid,
    name: z.string(),
    role: roleSchema.meta({ description: "The caller's role in this paper." }),
    memberCount: z.number().int().nonnegative().max(PAPER_MAX_MEMBERS),
    createdAt: timestamp,
  })
  .meta({ id: "Paper" });

export const memberSchema = z
  .strictObject({
    userId: uuid,
    name: z.string().nullable().meta({ description: "Null until the member finishes onboarding." }),
    city: z.string().nullable().meta({ description: "City name only." }),
    zodiacSign: zodiacSignSchema.nullable(),
    avatarUrl: signedUrl.nullable().meta({ description: "The member's avatar in their own style, if any." }),
    role: roleSchema,
    joinedAt: timestamp,
  })
  .meta({ id: "Member" });

export const paperDetailSchema = paperSchema
  .extend({ members: z.array(memberSchema) })
  .meta({ id: "PaperDetail" });

const paperName = textField({ max: TEXT_LIMITS.paperName, description: "Paper name." });

export const createPaperRequestSchema = z
  .strictObject({ name: paperName })
  .meta({ id: "CreatePaperRequest" });
export const updatePaperRequestSchema = z
  .strictObject({ name: paperName })
  .meta({ id: "UpdatePaperRequest", description: "Owner only." });

export const leavePaperResponseSchema = z
  .strictObject({
    paperId: uuid,
    left: z.literal(true),
  })
  .meta({ id: "LeftPaper" });

export const paperResponseSchema = z.strictObject({ paper: paperSchema });
export const paperDetailResponseSchema = z.strictObject({ paper: paperDetailSchema });
export const papersResponseSchema = z.strictObject({ papers: z.array(paperSchema) });

// ---------- Invites ----------

/** Crockford base32: digits and letters without I, L, O, U. Shown to users as six characters, e.g. 7KQ2MX. */
export const INVITE_CODE_LENGTH = 6;

/** Uppercases, drops spaces and dashes, and reads O as 0 and I or L as 1, as Crockford base32 does. */
export function normalizeInviteCode(v: string): string {
  return v.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
}

const inviteCode = z
  .string()
  .max(32)
  .transform(normalizeInviteCode)
  .pipe(z.string().regex(new RegExp(`^[0-9A-HJKMNP-TV-Z]{${INVITE_CODE_LENGTH}}$`), "Invalid code"))
  .meta({
    description: "Invite code. Case-insensitive; spaces and dashes are ignored, O reads as 0, I and L as 1.",
  });

export const joinRequestSchema = z.strictObject({ code: inviteCode }).meta({ id: "JoinRequest" });

export const inviteSchema = z
  .strictObject({
    id: uuid,
    createdAt: timestamp,
    expiresAt: timestamp,
    revokedAt: timestamp.nullable(),
    active: z.boolean(),
  })
  .meta({ id: "Invite" });

export const createdInviteSchema = inviteSchema
  .extend({
    code: z.string().meta({ description: "Shown once, at creation. Only a hash is stored." }),
  })
  .meta({ id: "CreatedInvite" });

export const createdInviteResponseSchema = z.strictObject({ invite: createdInviteSchema });
export const inviteResponseSchema = z.strictObject({ invite: inviteSchema });
export const invitesResponseSchema = z.strictObject({ invites: z.array(inviteSchema) });

import { z } from "zod";
import { isoDate, signedUrl, timestamp, uuid, zodiacSignSchema } from "./common";
import { TEXT_LIMITS, textField } from "./text";

// ---------- Geocoding ----------

export const geocodeQuerySchema = z.strictObject({
  q: textField({ max: TEXT_LIMITS.geocodeQuery, min: 2, description: "City name to search for." }),
});

export const cityCandidateSchema = z
  .strictObject({
    id: z.number().int().positive().meta({ description: "Opaque city id. Send it back as cityId." }),
    name: z.string(),
    admin1: z.string().nullable().meta({ description: "State or region, when known." }),
    country: z.string(),
    countryCode: z.string().length(2),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    timezone: z.string(),
  })
  .meta({ id: "CityCandidate" });

export const geocodeResponseSchema = z
  .strictObject({ results: z.array(cityCandidateSchema).max(10) })
  .meta({ id: "GeocodeResults" });

// ---------- Profile ----------

export const citySchema = z
  .strictObject({
    name: z.string(),
    admin1: z.string().nullable(),
    country: z.string(),
    timezone: z.string(),
  })
  .meta({ id: "City", description: "Coordinates are stored server-side and never returned." });

const birthday = isoDate.refine(
  (d) => {
    const year = Number(d.slice(0, 4));
    return year >= 1900 && d <= new Date().toISOString().slice(0, 10);
  },
  { message: "Invalid birthday" },
);

export const updateProfileRequestSchema = z
  .strictObject({
    name: textField({ max: TEXT_LIMITS.personName, description: "Display name." }).optional(),
    cityId: z.number().int().positive().optional().meta({ description: "id from GET /api/geocode." }),
    birthday: birthday.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "At least one field is required" })
  .meta({ id: "UpdateProfileRequest" });

export const profileSchema = z
  .strictObject({
    id: uuid,
    name: z.string().nullable(),
    city: citySchema.nullable(),
    birthday: isoDate.nullable().meta({ description: "Only ever returned to its owner." }),
    zodiacSign: zodiacSignSchema.nullable(),
    avatarUrl: signedUrl.nullable(),
    onboarded: z
      .boolean()
      .meta({ description: "True once name, city, birthday, and an approved avatar exist." }),
    createdAt: timestamp,
  })
  .meta({ id: "Profile" });

export const profileResponseSchema = z.strictObject({ profile: profileSchema });

// ---------- Avatar ----------

export const avatarTweaksSchema = z
  .strictObject({
    hairStyle: z.enum(["short", "medium", "long", "curly", "coily", "braids", "locs", "bald"]).optional(),
    hairColor: z.enum(["black", "brown", "blonde", "red", "gray", "white", "dyed"]).optional(),
    facialHair: z.enum(["none", "stubble", "mustache", "beard"]).optional(),
    glasses: z.boolean().optional(),
    headwear: z.enum(["none", "cap", "beanie", "headwrap", "hijab", "turban"]).optional(),
    note: textField({
      max: TEXT_LIMITS.avatarNote,
      description: "Short free-text tweak. Moderated and treated as untrusted data.",
    }).optional(),
  })
  .meta({ id: "AvatarTweaks" });
export type AvatarTweaks = z.infer<typeof avatarTweaksSchema>;

export const generationStatusSchema = z
  .enum(["pending", "generating", "ready", "failed"])
  .meta({ id: "GenerationStatus" });

export const generationErrorSchema = z
  .enum(["generation_failed", "content_blocked", "provider_unavailable"])
  .meta({ id: "GenerationError" });

export const avatarStateSchema = z
  .strictObject({
    approvedUrl: signedUrl.nullable().meta({ description: "The current approved avatar, if any." }),
    draft: z
      .strictObject({
        status: generationStatusSchema,
        url: signedUrl.nullable(),
        error: generationErrorSchema.nullable(),
        attempts: z.number().int().nonnegative(),
        selfieExpiresAt: timestamp.meta({
          description: "The selfie is deleted at approval or at this time, whichever comes first.",
        }),
      })
      .nullable(),
  })
  .meta({ id: "AvatarState" });

export const avatarResponseSchema = z.strictObject({ avatar: avatarStateSchema });

export const avatarUploadSchema = z
  .strictObject({
    selfie: z.any().meta({ type: "string", format: "binary", description: "JPEG or PNG, at most 12 MB." }),
    tweaks: z.string().optional().meta({ description: "Optional JSON-encoded AvatarTweaks." }),
  })
  .meta({ id: "AvatarUpload" });

export const regenerateAvatarRequestSchema = z
  .strictObject({ tweaks: avatarTweaksSchema.optional() })
  .meta({ id: "RegenerateAvatarRequest" });

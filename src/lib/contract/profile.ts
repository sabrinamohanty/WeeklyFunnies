import { z } from "zod";
import { isoDate, signedUrl, styleKeySchema, timestamp, uuid, zodiacSignSchema } from "./common";
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

export const avatarImageSchema = z
  .strictObject({ style: styleKeySchema, url: signedUrl })
  .meta({ id: "AvatarImage" });

export const profileSchema = z
  .strictObject({
    id: uuid,
    name: z.string().nullable(),
    city: citySchema.nullable(),
    birthday: isoDate.nullable().meta({ description: "Only ever returned to its owner." }),
    zodiacSign: zodiacSignSchema.nullable(),
    look: z.string().nullable().meta({
      description: "Fixed character description built from the trait form, reused in every panel.",
    }),
    avatars: z.array(avatarImageSchema).meta({ description: "Approved avatars, at most one per style." }),
    onboarded: z
      .boolean()
      .meta({ description: "True once name, city, birthday, and an approved avatar exist." }),
    createdAt: timestamp,
  })
  .meta({ id: "Profile" });

export const profileResponseSchema = z.strictObject({ profile: profileSchema });

// ---------- Avatar ----------

export const AVATAR_TRAIT_OPTIONS = {
  hairStyle: ["short", "medium", "long", "wavy", "curly", "coily", "braids", "locs", "buzzed", "bald"],
  hairColor: ["black", "dark_brown", "brown", "auburn", "red", "blonde", "gray", "white", "dyed"],
  skinTone: ["very_light", "light", "medium", "tan", "brown", "dark"],
  facialHair: ["none", "stubble", "mustache", "beard"],
  glasses: ["none", "round", "square", "sunglasses"],
  headwear: ["none", "cap", "beanie", "headwrap", "hijab", "turban"],
  top: ["tshirt", "hoodie", "sweater", "jacket", "shirt", "dress", "jersey"],
  topColor: ["red", "orange", "yellow", "green", "blue", "purple", "pink", "black", "white", "gray", "brown"],
} as const;

const trait = <K extends keyof typeof AVATAR_TRAIT_OPTIONS>(k: K) =>
  z.enum(AVATAR_TRAIT_OPTIONS[k]).optional();

export const avatarTraitsSchema = z
  .strictObject({
    hairStyle: trait("hairStyle"),
    hairColor: trait("hairColor"),
    skinTone: trait("skinTone"),
    facialHair: trait("facialHair"),
    glasses: trait("glasses"),
    headwear: trait("headwear"),
    top: trait("top"),
    topColor: trait("topColor"),
    note: textField({
      max: TEXT_LIMITS.avatarNote,
      description: "Short free-text detail, e.g. 'freckles'. Moderated and treated as untrusted data.",
    }).optional(),
  })
  .refine((t) => Object.values(t).some((v) => v !== undefined), { message: "At least one trait is required" })
  .meta({
    id: "AvatarTraits",
    description:
      "The trait form. The server turns it into a fixed 'look' description (for example 'curly dark brown " +
      "hair, round glasses, green hoodie') that is stored and reused word for word in every panel.",
  });
export type AvatarTraits = z.infer<typeof avatarTraitsSchema>;

export const generationStatusSchema = z
  .enum(["pending", "generating", "ready", "failed"])
  .meta({ id: "GenerationStatus" });

export const generationErrorSchema = z
  .enum(["generation_failed", "content_blocked", "provider_unavailable"])
  .meta({ id: "GenerationError" });

export const avatarStateSchema = z
  .strictObject({
    look: z.string().nullable().meta({ description: "The stored look text, built from the traits." }),
    traits: avatarTraitsSchema
      .nullable()
      .meta({ description: "The last submitted trait form, to prefill it." }),
    avatars: z.array(avatarImageSchema).meta({ description: "At most one per style." }),
  })
  .meta({ id: "AvatarState" });

export const avatarStateResponseSchema = avatarStateSchema;

/**
 * The person the avatar is for. Only `id` is used, and it must be the caller: a photo may only make
 * its owner's avatar. Other fields are accepted for compatibility with the web client and ignored.
 */
export const avatarPersonSchema = z
  .strictObject({
    id: uuid,
    name: z.string().max(200).optional(),
    look: z.string().max(400).optional().meta({ description: "Ignored. The server uses the stored look." }),
    traits: avatarTraitsSchema.optional().meta({
      description: "When sent, replaces the trait form; the server rebuilds and stores the look first.",
    }),
  })
  .meta({ id: "AvatarPerson" });

export const createAvatarRequestSchema = z
  .strictObject({
    style: styleKeySchema,
    person: avatarPersonSchema,
    photoUrl: z
      .url()
      .max(2_048)
      .optional()
      .meta({
        description:
          "A photoUrl returned by POST /api/avatar/photo for this user. Any other URL is rejected; the " +
          "server never fetches URLs.",
      }),
  })
  .meta({ id: "CreateAvatarRequest" });

export const createAvatarResponseSchema = z
  .strictObject({
    avatarUrl: signedUrl,
    style: styleKeySchema,
    look: z.string(),
  })
  .meta({ id: "CreateAvatarResponse" });

export const avatarPhotoUploadSchema = z
  .strictObject({
    photo: z.any().meta({
      type: "string",
      format: "binary",
      description: "JPEG or PNG of the person, at most 12 MB. Moderated. Only used for their own avatar.",
    }),
    photoConsent: z.literal("true").meta({
      description: 'Must be "true": the person agrees to their photo being used for their avatar.',
    }),
  })
  .meta({ id: "AvatarPhotoUpload" });

export const avatarPhotoResponseSchema = z
  .strictObject({
    photoUrl: signedUrl.meta({ description: "Pass to POST /api/avatar. Short-lived." }),
    expiresAt: timestamp.meta({ description: "The photo is deleted at this time (at most 1 hour)." }),
  })
  .meta({ id: "AvatarPhotoResponse" });

import { z } from "zod";
import { timestamp } from "./common";

export const logoutResponseSchema = z
  .strictObject({
    signedOut: z.literal(true).meta({ description: "All sessions on all devices were revoked." }),
    purgeAfter: timestamp.meta({
      description:
        "Draft posts are hidden now and deleted after this time unless the user signs back in. " +
        "Posts in published editions follow the edition's expiry instead.",
    }),
  })
  .meta({ id: "LogoutResult" });

export const healthResponseSchema = z.strictObject({ status: z.literal("ok") }).meta({ id: "Health" });

export const cronResultSchema = z
  .strictObject({ processed: z.number().int().nonnegative() })
  .meta({ id: "CronResult" });

import { serviceDb } from "@/lib/db/client";
import { unwrap, unwrapMaybe } from "@/lib/db/errors";
import { ApiError } from "@/lib/http/errors";
import { mondayOf } from "@/lib/time/week";

export interface EditionRow {
  id: string;
  paper_id: string;
  week_start: string;
  week_end: string | null;
  status: "draft" | "published";
  published_at: string | null;
  expires_at: string | null;
  saved_at: string | null;
  issue_number: number;
}

const COLUMNS =
  "id, paper_id, week_start, week_end, status, published_at, expires_at, saved_at, issue_number";

export async function ownerTimezone(paperId: string): Promise<string> {
  const row = unwrapMaybe(
    await serviceDb()
      .from("paper_members")
      .select("profiles!inner(timezone)")
      .eq("paper_id", paperId)
      .eq("role", "owner")
      .maybeSingle(),
  );
  return row?.profiles.timezone ?? "UTC";
}

export async function getEdition(editionId: string): Promise<EditionRow | null> {
  return unwrapMaybe(await serviceDb().from("editions").select(COLUMNS).eq("id", editionId).maybeSingle());
}

export async function findEdition(paperId: string, weekStart: string): Promise<EditionRow | null> {
  return unwrapMaybe(
    await serviceDb()
      .from("editions")
      .select(COLUMNS)
      .eq("paper_id", paperId)
      .eq("week_start", weekStart)
      .maybeSingle(),
  );
}

export async function getOrCreateCurrentEdition(paperId: string): Promise<EditionRow> {
  const weekStart = mondayOf(new Date(), await ownerTimezone(paperId));
  const existing = await findEdition(paperId, weekStart);
  if (existing) return existing;
  try {
    return unwrap(
      await serviceDb()
        .from("editions")
        .insert({ paper_id: paperId, week_start: weekStart })
        .select(COLUMNS)
        .single(),
    );
  } catch (err) {
    if (err instanceof ApiError && err.code === "conflict") {
      const again = await findEdition(paperId, weekStart);
      if (again) return again;
    }
    throw err;
  }
}

export async function listEditions(paperId: string): Promise<EditionRow[]> {
  return unwrap(
    await serviceDb()
      .from("editions")
      .select(COLUMNS)
      .eq("paper_id", paperId)
      .order("week_start", { ascending: false }),
  );
}

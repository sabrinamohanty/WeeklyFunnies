import { getConfig } from "@/lib/config/env";
import { serviceDb } from "@/lib/db/client";
import { unwrap } from "@/lib/db/errors";
import { log } from "@/lib/log/logger";
import { removeObject } from "@/lib/storage/objects";
import type { Bucket } from "@/lib/storage/signed";

const BATCH = 200;
const FILE_BATCH = 100;

const BUCKETS = new Set<Bucket>(["selfies", "avatars", "panels", "photos"]);

interface EditionKeep {
  status: string;
  saved_at: string | null;
  expires_at: string | null;
}

/** A published edition stays while it is saved, or until its expiry. Drafts do not keep a page. */
export function editionIsKept(edition: EditionKeep, now: Date): boolean {
  if (edition.status !== "published") return false;
  if (edition.saved_at !== null) return true;
  if (edition.expires_at === null) return false;
  return new Date(edition.expires_at).getTime() > now.getTime();
}

function isBucket(value: string): value is Bucket {
  return BUCKETS.has(value as Bucket);
}

async function deleteIds(table: "editions" | "pages", ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const deleted = unwrap(await serviceDb().from(table).delete().in("id", ids).select("id"));
  return deleted.length;
}

async function deleteExpiredEditions(nowIso: string): Promise<number> {
  const rows = unwrap(
    await serviceDb()
      .from("editions")
      .select("id")
      .eq("status", "published")
      .is("saved_at", null)
      .lt("expires_at", nowIso)
      .limit(BATCH),
  );
  return deleteIds(
    "editions",
    rows.map((row) => row.id),
  );
}

async function lapsedUserIds(graceBefore: string, idleBefore: string): Promise<string[]> {
  const loggedOut = unwrap(
    await serviceDb().from("profiles").select("id").lt("logged_out_at", graceBefore).limit(BATCH),
  );
  const idle = unwrap(
    await serviceDb().from("profiles").select("id").lt("last_active_at", idleBefore).limit(BATCH),
  );
  return [...new Set([...loggedOut, ...idle].map((row) => row.id))];
}

async function deleteLapsedPages(userIds: string[], now: Date): Promise<number> {
  const pages = unwrap(await serviceDb().from("pages").select("id").in("user_id", userIds).limit(BATCH));
  if (pages.length === 0) return 0;
  const pageIds = pages.map((row) => row.id);
  const links = unwrap(
    await serviceDb().from("page_papers").select("page_id, edition_id").in("page_id", pageIds),
  );
  const editionIds = [...new Set(links.map((row) => row.edition_id))];
  const editions =
    editionIds.length === 0
      ? []
      : unwrap(
          await serviceDb().from("editions").select("id, status, saved_at, expires_at").in("id", editionIds),
        );
  const keptEditions = new Set(editions.filter((row) => editionIsKept(row, now)).map((row) => row.id));
  const keptPages = new Set(
    links.filter((row) => keptEditions.has(row.edition_id)).map((row) => row.page_id),
  );
  return deleteIds(
    "pages",
    pageIds.filter((id) => !keptPages.has(id)),
  );
}

/** Past weeks with no paper link left. A page still in a draft or saved edition stays. */
async function deleteOrphanedPastPages(today: string): Promise<number> {
  const oldPages = unwrap(await serviceDb().from("pages").select("id").lt("week_end", today).limit(BATCH));
  if (oldPages.length === 0) return 0;
  const ids = oldPages.map((row) => row.id);
  const links = unwrap(await serviceDb().from("page_papers").select("page_id").in("page_id", ids));
  const linked = new Set(links.map((row) => row.page_id));
  return deleteIds(
    "pages",
    ids.filter((id) => !linked.has(id)),
  );
}

/** Clears the path so the storage trigger queues the file. The row stays with the profile. */
async function expireSelfies(nowIso: string): Promise<number> {
  const drafts = unwrap(
    await serviceDb()
      .from("avatar_drafts")
      .select("user_id")
      .not("selfie_path", "is", null)
      .lt("selfie_expires_at", nowIso)
      .limit(BATCH),
  );
  let cleared = 0;
  for (const row of drafts) {
    const updated = await serviceDb()
      .from("avatar_drafts")
      .update({ selfie_path: null })
      .eq("user_id", row.user_id)
      .not("selfie_path", "is", null)
      .select("user_id");
    if (updated.error) {
      log.warn("retention.selfie_clear_failed", { userId: row.user_id });
      continue;
    }
    cleared += updated.data?.length ?? 0;
  }
  return cleared;
}

async function drainStorage(): Promise<number> {
  const rows = unwrap(
    await serviceDb()
      .from("storage_deletions")
      .select("bucket, path, attempts")
      .order("enqueued_at", { ascending: true })
      .limit(FILE_BATCH),
  );
  let removed = 0;
  for (const row of rows) {
    const gone = isBucket(row.bucket) && (await removeObject(row.bucket, row.path));
    if (!gone) {
      await serviceDb()
        .from("storage_deletions")
        .update({ attempts: row.attempts + 1 })
        .eq("bucket", row.bucket)
        .eq("path", row.path);
      continue;
    }
    const deleted = await serviceDb()
      .from("storage_deletions")
      .delete()
      .eq("bucket", row.bucket)
      .eq("path", row.path);
    if (deleted.error) {
      log.warn("retention.outbox_delete_failed", { bucket: row.bucket });
      continue;
    }
    removed += 1;
  }
  return removed;
}

/**
 * Deletes what retention allows, then the files those deletes queued.
 * `processed` counts editions, pages, cleared selfies, removed files, and pruned rate-limit rows.
 */
export async function runCleanup(now = new Date()): Promise<number> {
  const config = getConfig();
  const nowIso = now.toISOString();
  const graceBefore = new Date(
    now.getTime() - config.RETENTION_LOGOUT_GRACE_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const idleBefore = new Date(now.getTime() - config.RETENTION_WINDOW_DAYS * 86_400_000).toISOString();
  const today = nowIso.slice(0, 10);

  let processed = await deleteExpiredEditions(nowIso);
  const userIds = await lapsedUserIds(graceBefore, idleBefore);
  if (userIds.length > 0) processed += await deleteLapsedPages(userIds, now);
  processed += await deleteOrphanedPastPages(today);
  processed += await expireSelfies(nowIso);
  processed += await drainStorage();
  processed += unwrap(await serviceDb().rpc("rate_limit_prune", { p_older_than_seconds: 3600 }));
  return processed;
}

import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { GET as runCleanup } from "@/app/api/internal/cleanup/route";
import { GET as getMe } from "@/app/api/me/route";
import { GET as getCurrentPage } from "@/app/api/pages/current/route";
import { POST as logout } from "@/app/api/session/logout/route";
import { getConfig } from "@/lib/config/env";
import { routes } from "@/lib/contract/routes";
import { mondayOf } from "@/lib/time/week";
import { call, expectError, expectOk } from "./helpers/api";
import {
  PNG_BYTES,
  type TestUser,
  anonClient,
  createUser,
  deleteUsers,
  must,
  objectExists,
  serviceClient,
  upload,
} from "./helpers/db";

const users: TestUser[] = [];
const papers: string[] = [];

afterAll(async () => {
  if (papers.length > 0) await serviceClient().from("papers").delete().in("id", papers);
  await deleteUsers(users);
});

function thisWeek(): string {
  return mondayOf(new Date(), "UTC");
}

function pastWeek(): string {
  return mondayOf(new Date(Date.now() - 14 * 86_400_000), "UTC");
}

function pastGrace(): string {
  const hours = getConfig().RETENTION_LOGOUT_GRACE_HOURS + 2;
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function pastWindow(): string {
  const days = getConfig().RETENTION_WINDOW_DAYS + 5;
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

async function reader(label: string): Promise<TestUser> {
  const user = await createUser(label);
  users.push(user);
  return user;
}

async function insertPage(userId: string, weekStart: string): Promise<string> {
  return must(
    await serviceClient()
      .from("pages")
      .insert({ user_id: userId, week_start: weekStart })
      .select("id")
      .single(),
  ).id;
}

async function makePaper(user: TestUser, name: string): Promise<string> {
  const id = must(await serviceClient().rpc("create_paper", { p_user: user.id, p_name: name }));
  papers.push(id);
  return id;
}

async function draftEdition(paperId: string, weekStart: string): Promise<string> {
  return must(
    await serviceClient()
      .from("editions")
      .insert({ paper_id: paperId, week_start: weekStart, status: "draft" })
      .select("id")
      .single(),
  ).id;
}

/** Link the page first. A published edition rejects new page links. */
async function markPublished(editionId: string, saved: boolean): Promise<void> {
  const now = new Date().toISOString();
  must(
    await serviceClient()
      .from("editions")
      .update({
        status: "published",
        published_at: now,
        saved_at: saved ? now : null,
        expires_at: saved ? null : new Date(Date.now() - 86_400_000).toISOString(),
      })
      .eq("id", editionId)
      .select("id")
      .single(),
  );
}

async function link(pageId: string, userId: string, paperId: string, editionId: string): Promise<void> {
  must(
    await serviceClient()
      .from("page_papers")
      .insert({ page_id: pageId, user_id: userId, paper_id: paperId, edition_id: editionId })
      .select(),
  );
}

async function exists(table: "pages" | "editions", id: string): Promise<boolean> {
  const { data, error } = await serviceClient().from(table).select("id").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data !== null;
}

async function outboxHas(bucket: string, path: string): Promise<boolean> {
  const { data, error } = await serviceClient()
    .from("storage_deletions")
    .select("path")
    .eq("bucket", bucket)
    .eq("path", path)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data !== null;
}

async function sweep(): Promise<number> {
  const body = await expectOk(
    await call(runCleanup, {
      method: "GET",
      path: "/api/internal/cleanup",
      token: process.env.CRON_SECRET,
    }),
    routes.runCleanup,
  );
  return body.processed;
}

describe("retention", () => {
  it("rejects a cleanup call without the cron secret", async () => {
    await expectError(
      await call(runCleanup, { method: "GET", path: "/api/internal/cleanup" }),
      401,
      "unauthorized",
    );
  });

  it("signs out every session and names when drafts will be purged", async () => {
    const user = await reader("logout");
    const pageId = await insertPage(user.id, thisWeek());
    const body = await expectOk(
      await call(logout, { method: "POST", path: "/api/session/logout", token: user.token, body: {} }),
      routes.logout,
    );
    const hours = getConfig().RETENTION_LOGOUT_GRACE_HOURS;
    const purge = new Date(body.purgeAfter).getTime();
    expect(body.signedOut).toBe(true);
    expect(purge).toBeGreaterThan(Date.now() + (hours - 1) * 60 * 60 * 1000);
    expect(purge).toBeLessThan(Date.now() + (hours + 1) * 60 * 60 * 1000);

    await expectError(
      await call(getMe, { method: "GET", path: "/api/me", token: user.token }),
      401,
      "unauthorized",
    );
    const profile = must(
      await serviceClient().from("profiles").select("logged_out_at").eq("id", user.id).single(),
    );
    expect(profile.logged_out_at).not.toBeNull();
    expect(await exists("pages", pageId)).toBe(true);
  });

  it("cancels the purge when the reader signs back in", async () => {
    const user = await reader("return");
    const pageId = await insertPage(user.id, thisWeek());
    await expectOk(
      await call(logout, { method: "POST", path: "/api/session/logout", token: user.token, body: {} }),
      routes.logout,
    );

    const signIn = await anonClient().auth.signInWithPassword({ email: user.email, password: user.password });
    if (signIn.error || !signIn.data.session) throw signIn.error ?? new Error("sign in failed");
    const current = await expectOk(
      await call(getCurrentPage, {
        method: "GET",
        path: "/api/pages/current",
        token: signIn.data.session.access_token,
      }),
      routes.getCurrentPage,
    );
    expect(current.page?.id).toBe(pageId);
    const profile = must(
      await serviceClient().from("profiles").select("logged_out_at").eq("id", user.id).single(),
    );
    expect(profile.logged_out_at).toBeNull();

    await sweep();
    expect(await exists("pages", pageId)).toBe(true);
  });

  it("deletes drafts after the logout grace, including a page only linked to a draft edition", async () => {
    const user = await reader("grace");
    const week = thisWeek();
    const pageId = await insertPage(user.id, week);
    const paperId = await makePaper(user, "Grace Gazette");
    const editionId = must(
      await serviceClient()
        .from("editions")
        .insert({ paper_id: paperId, week_start: week, status: "draft" })
        .select("id")
        .single(),
    ).id;
    await link(pageId, user.id, paperId, editionId);
    must(
      await serviceClient()
        .from("profiles")
        .update({ logged_out_at: pastGrace() })
        .eq("id", user.id)
        .select("id")
        .single(),
    );

    expect(await sweep()).toBeGreaterThan(0);
    expect(await exists("pages", pageId)).toBe(false);
    expect(await exists("editions", editionId)).toBe(true);
  });

  it("deletes an idle reader's draft and the photo file with it", async () => {
    const user = await reader("idle");
    const pageId = await insertPage(user.id, thisWeek());
    const highlightId = must(
      await serviceClient()
        .from("highlights")
        .insert({ page_id: pageId, user_id: user.id, text: "A quiet week", position: 0 })
        .select("id")
        .single(),
    ).id;
    const path = `${user.id}/${randomUUID()}.png`;
    await upload("photos", path);
    must(
      await serviceClient()
        .from("photos")
        .insert({
          highlight_id: highlightId,
          user_id: user.id,
          storage_path: path,
          width: 1,
          height: 1,
          byte_size: PNG_BYTES.byteLength,
          position: 0,
        })
        .select("id")
        .single(),
    );
    must(
      await serviceClient()
        .from("profiles")
        .update({ last_active_at: pastWindow() })
        .eq("id", user.id)
        .select("id")
        .single(),
    );

    await sweep();
    expect(await exists("pages", pageId)).toBe(false);
    expect(await objectExists("photos", path)).toBe(false);
    expect(await outboxHas("photos", path)).toBe(false);
  });

  it("keeps a saved edition when the author has been idle, and deletes their other draft", async () => {
    const user = await reader("saved");
    const week = pastWeek();
    const paperId = await makePaper(user, "Kept Gazette");
    const keptPage = await insertPage(user.id, week);
    const draftPage = await insertPage(user.id, thisWeek());
    const editionId = await draftEdition(paperId, week);
    await link(keptPage, user.id, paperId, editionId);
    await markPublished(editionId, true);
    must(
      await serviceClient()
        .from("profiles")
        .update({ last_active_at: pastWindow() })
        .eq("id", user.id)
        .select("id")
        .single(),
    );

    await sweep();
    expect(await exists("pages", keptPage)).toBe(true);
    expect(await exists("editions", editionId)).toBe(true);
    expect(await exists("pages", draftPage)).toBe(false);
  });

  it("deletes an expired edition and the past page it was the only copy of", async () => {
    const user = await reader("expired");
    const week = pastWeek();
    const paperId = await makePaper(user, "Old Gazette");
    const pageId = await insertPage(user.id, week);
    const editionId = await draftEdition(paperId, week);
    await link(pageId, user.id, paperId, editionId);
    await markPublished(editionId, false);

    await sweep();
    expect(await exists("editions", editionId)).toBe(false);
    expect(await exists("pages", pageId)).toBe(false);
  });

  it("deletes a past page that no paper still links", async () => {
    const user = await reader("orphan");
    const pageId = await insertPage(user.id, pastWeek());
    await sweep();
    expect(await exists("pages", pageId)).toBe(false);
  });

  it("keeps this week's page for someone who is still active", async () => {
    const user = await reader("active");
    const pageId = await insertPage(user.id, thisWeek());
    await sweep();
    expect(await exists("pages", pageId)).toBe(true);
    await sweep();
    expect(await exists("pages", pageId)).toBe(true);
  });

  it("removes an expired selfie and leaves a fresh one", async () => {
    const stale = await reader("stale-selfie");
    const fresh = await reader("fresh-selfie");
    const stalePath = `${stale.id}/${randomUUID()}.png`;
    const freshPath = `${fresh.id}/${randomUUID()}.png`;
    await upload("selfies", stalePath);
    await upload("selfies", freshPath);
    const db = serviceClient();
    must(
      await db
        .from("avatar_drafts")
        .insert({
          user_id: stale.id,
          selfie_path: stalePath,
          selfie_expires_at: new Date(Date.now() - 60_000).toISOString(),
          status: "pending",
        })
        .select("user_id")
        .single(),
    );
    must(
      await db
        .from("avatar_drafts")
        .insert({
          user_id: fresh.id,
          selfie_path: freshPath,
          selfie_expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
          status: "pending",
        })
        .select("user_id")
        .single(),
    );

    await sweep();
    const staleRow = must(
      await db.from("avatar_drafts").select("selfie_path").eq("user_id", stale.id).single(),
    );
    const freshRow = must(
      await db.from("avatar_drafts").select("selfie_path").eq("user_id", fresh.id).single(),
    );
    expect(staleRow.selfie_path).toBeNull();
    expect(freshRow.selfie_path).toBe(freshPath);
    expect(await objectExists("selfies", stalePath)).toBe(false);
    expect(await objectExists("selfies", freshPath)).toBe(true);
    expect(await outboxHas("selfies", stalePath)).toBe(false);

    await db.storage.from("selfies").remove([freshPath]);
    await db.from("avatar_drafts").update({ selfie_path: null }).eq("user_id", fresh.id);
    await db.from("storage_deletions").delete().eq("bucket", "selfies").eq("path", freshPath);
  });

  it("drains a file that was already queued", async () => {
    const user = await reader("queued");
    const path = `${user.id}/${randomUUID()}.png`;
    await upload("photos", path);
    must(
      await serviceClient()
        .from("storage_deletions")
        .insert({ bucket: "photos", path })
        .select("path")
        .single(),
    );
    await sweep();
    expect(await objectExists("photos", path)).toBe(false);
    expect(await outboxHas("photos", path)).toBe(false);
  });

  it("prunes old rate-limit windows and keeps a current one", async () => {
    const oldKey = randomBytes(32).toString("hex");
    const freshKey = randomBytes(32).toString("hex");
    const db = serviceClient();
    must(
      await db
        .from("rate_limits")
        .insert([
          { key: oldKey, window_start: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), count: 1 },
          { key: freshKey, window_start: new Date().toISOString(), count: 1 },
        ])
        .select("key"),
    );
    try {
      await sweep();
      const oldRow = await db.from("rate_limits").select("key").eq("key", oldKey).maybeSingle();
      const freshRow = await db.from("rate_limits").select("key").eq("key", freshKey).maybeSingle();
      if (oldRow.error) throw new Error(oldRow.error.message);
      if (freshRow.error) throw new Error(freshRow.error.message);
      expect(oldRow.data).toBeNull();
      expect(freshRow.data?.key).toBe(freshKey);
    } finally {
      await db.from("rate_limits").delete().in("key", [oldKey, freshKey]);
    }
  });
});

import type { z } from "zod";
import type { ZodiacSign } from "@/lib/contract/common";
import type { inviteSchema, memberSchema, paperSchema } from "@/lib/contract/papers";
import { serviceDb } from "@/lib/db/client";
import { unwrap, unwrapMaybe } from "@/lib/db/errors";
import { ApiError } from "@/lib/http/errors";
import { signUrls } from "@/lib/storage/signed";

type Paper = z.input<typeof paperSchema>;
type Member = z.input<typeof memberSchema>;
type Invite = z.input<typeof inviteSchema>;
export type Role = "owner" | "member";

export const INVITE_TTL_DAYS = 7;
export const MAX_ACTIVE_INVITES = 5;

/**
 * Authorization: the caller's role in a paper. Non-members get `not_found`, never `forbidden`, so
 * paper ids can't be probed.
 */
export async function requireMember(paperId: string, userId: string): Promise<Role> {
  const row = unwrapMaybe(
    await serviceDb()
      .from("paper_members")
      .select("role")
      .eq("paper_id", paperId)
      .eq("user_id", userId)
      .maybeSingle(),
  );
  if (!row) throw new ApiError("not_found");
  return row.role;
}

/** Owners only. Members get `forbidden`; non-members get `not_found`. */
export async function requireOwner(paperId: string, userId: string): Promise<void> {
  if ((await requireMember(paperId, userId)) !== "owner") throw new ApiError("forbidden");
}

async function memberCounts(paperIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (paperIds.length === 0) return counts;
  const rows = unwrap(await serviceDb().from("paper_members").select("paper_id").in("paper_id", paperIds));
  for (const r of rows) counts.set(r.paper_id, (counts.get(r.paper_id) ?? 0) + 1);
  return counts;
}

export async function listPapers(userId: string): Promise<Paper[]> {
  const rows = unwrap(
    await serviceDb()
      .from("paper_members")
      .select("role, papers!inner(id, name, created_at)")
      .eq("user_id", userId),
  );
  const counts = await memberCounts(rows.map((r) => r.papers.id));
  return rows
    .map((r) => ({
      id: r.papers.id,
      name: r.papers.name,
      role: r.role,
      memberCount: counts.get(r.papers.id) ?? 0,
      createdAt: r.papers.created_at,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getPaper(paperId: string, role: Role): Promise<Paper> {
  const p = unwrap(
    await serviceDb().from("papers").select("id, name, created_at").eq("id", paperId).single(),
  );
  const counts = await memberCounts([paperId]);
  return { id: p.id, name: p.name, role, memberCount: counts.get(paperId) ?? 0, createdAt: p.created_at };
}

/** The contributor list. Only public profile fields: no birthday, coordinates, or storage paths. */
export async function listMembers(paperId: string): Promise<Member[]> {
  const rows = unwrap(
    await serviceDb()
      .from("paper_members")
      .select("user_id, role, joined_at, profiles!inner(name, city_name, zodiac_sign, avatar_path)")
      .eq("paper_id", paperId)
      .order("joined_at"),
  );
  const urls = await signUrls(
    "avatars",
    rows.map((r) => r.profiles.avatar_path),
  );
  return rows.map((r) => ({
    userId: r.user_id,
    name: r.profiles.name,
    city: r.profiles.city_name,
    zodiacSign: r.profiles.zodiac_sign as ZodiacSign | null,
    avatarUrl: r.profiles.avatar_path ? (urls.get(r.profiles.avatar_path) ?? null) : null,
    role: r.role,
    joinedAt: r.joined_at,
  }));
}

export async function createPaper(userId: string, name: string): Promise<string> {
  return unwrap(await serviceDb().rpc("create_paper", { p_user: userId, p_name: name }));
}

export async function renamePaper(paperId: string, name: string): Promise<void> {
  unwrap(await serviceDb().from("papers").update({ name }).eq("id", paperId).select("id").single());
}

// ---------- Invites ----------

function toInvite(r: {
  id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}): Invite {
  return {
    id: r.id,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
    active: r.revoked_at === null && new Date(r.expires_at).getTime() > Date.now(),
  };
}

const INVITE_COLUMNS = "id, created_at, expires_at, revoked_at";

export async function createInvite(paperId: string, userId: string, codeHash: string): Promise<Invite> {
  const db = serviceDb();
  const { count, error } = await db
    .from("invites")
    .select("id", { count: "exact", head: true })
    .eq("paper_id", paperId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString());
  if (error) throw new ApiError("internal");
  if ((count ?? 0) >= MAX_ACTIVE_INVITES) throw new ApiError("conflict");

  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString();
  const row = unwrap(
    await db
      .from("invites")
      .insert({ paper_id: paperId, code_hash: codeHash, created_by: userId, expires_at: expiresAt })
      .select(INVITE_COLUMNS)
      .single(),
  );
  return toInvite(row);
}

export async function listInvites(paperId: string): Promise<Invite[]> {
  const rows = unwrap(
    await serviceDb()
      .from("invites")
      .select(INVITE_COLUMNS)
      .eq("paper_id", paperId)
      .order("created_at", { ascending: false }),
  );
  return rows.map(toInvite);
}

/** Idempotent: revoking an already revoked invite returns it unchanged. */
export async function revokeInvite(paperId: string, inviteId: string): Promise<Invite> {
  const db = serviceDb();
  const row = unwrapMaybe(
    await db.from("invites").select(INVITE_COLUMNS).eq("id", inviteId).eq("paper_id", paperId).maybeSingle(),
  );
  if (!row) throw new ApiError("not_found");
  if (row.revoked_at) return toInvite(row);
  const updated = unwrap(
    await db
      .from("invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", inviteId)
      .select(INVITE_COLUMNS)
      .single(),
  );
  return toInvite(updated);
}

export async function joinByCodeHash(codeHash: string, userId: string): Promise<string> {
  return unwrap(await serviceDb().rpc("join_paper", { p_code_hash: codeHash, p_user: userId }));
}

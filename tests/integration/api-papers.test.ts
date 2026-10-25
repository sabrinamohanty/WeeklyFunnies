import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as joinPaper } from "@/app/api/invites/join/route";
import { DELETE as leavePaper } from "@/app/api/papers/[paperId]/membership/route";
import { GET as getPaper, PATCH as patchPaper } from "@/app/api/papers/[paperId]/route";
import { DELETE as revokeInvite } from "@/app/api/papers/[paperId]/invites/[inviteId]/route";
import { GET as listInvites, POST as createInvite } from "@/app/api/papers/[paperId]/invites/route";
import { GET as listPapers, POST as createPaper } from "@/app/api/papers/route";
import { GET as getMe } from "@/app/api/me/route";
import { resetConfigCache } from "@/lib/config/env";
import { createPaperRequestSchema } from "@/lib/contract/papers";
import { routes } from "@/lib/contract/routes";
import { generateInviteCode } from "@/lib/papers/invite-code";
import { activeInviteHashExists } from "@/lib/papers/repo";
import { PostgresRateLimiter } from "@/lib/ratelimit/postgres";
import { serviceDb } from "@/lib/db/client";
import { textCases } from "../fixtures/text-cases";
import { call, expectError, expectOk } from "./helpers/api";
import { type TestUser, createUser, deleteUsers, serviceClient } from "./helpers/db";

let ama: TestUser;
let ben: TestUser;
let cole: TestUser;
const users: TestUser[] = [];
const papers: string[] = [];

beforeAll(async () => {
  [ama, ben, cole] = await Promise.all([createUser("ama"), createUser("ben"), createUser("cole")]);
  users.push(ama, ben, cole);
  for (const [u, name] of [
    [ama, "Ama"],
    [ben, "Ben"],
    [cole, "Cole"],
  ] as const) {
    await serviceClient().from("profiles").update({ name }).eq("id", u.id);
  }
});

afterAll(async () => {
  await serviceClient().from("papers").delete().in("id", papers);
  await deleteUsers(users);
});

async function newPaper(owner: TestUser, name = "The Weekly"): Promise<string> {
  const { paper } = await expectOk(
    await call(createPaper, { method: "POST", path: "/api/papers", token: owner.token, body: { name } }),
    routes.createPaper,
  );
  papers.push(paper.id);
  return paper.id;
}

async function newInvite(owner: TestUser, paperId: string) {
  const res = await call(createInvite, {
    method: "POST",
    path: `/api/papers/${paperId}/invites`,
    token: owner.token,
    params: { paperId },
  });
  return (await expectOk(res, routes.createInvite)).invite;
}

const join = (u: TestUser, code: string, ip?: string) =>
  call(joinPaper, { method: "POST", path: "/api/invites/join", token: u.token, body: { code }, ip });

describe("papers", () => {
  it("creating a paper makes the caller its owner", async () => {
    const id = await newPaper(ama, "  The Ama Times  ");
    const { paper } = await expectOk(
      await call(getPaper, {
        method: "GET",
        path: `/api/papers/${id}`,
        token: ama.token,
        params: { paperId: id },
      }),
      routes.getPaper,
    );
    expect(paper).toMatchObject({ id, name: "The Ama Times", role: "owner", memberCount: 1 });
    expect(paper.members).toEqual([expect.objectContaining({ userId: ama.id, name: "Ama", role: "owner" })]);
  });

  it("lists only the caller's papers", async () => {
    const mine = await newPaper(ama);
    const theirs = await newPaper(ben);
    const { papers: list } = await expectOk(
      await call(listPapers, { method: "GET", path: "/api/papers", token: ama.token }),
      routes.listPapers,
    );
    const ids = list.map((p) => p.id);
    expect(ids).toContain(mine);
    expect(ids).not.toContain(theirs);
  });

  it("hides other people's papers behind 404, never 403 (IDOR)", async () => {
    const theirs = await newPaper(ben);
    const asAma = { token: ama.token, params: { paperId: theirs } };
    await expectError(
      await call(getPaper, { method: "GET", path: `/api/papers/${theirs}`, ...asAma }),
      404,
      "not_found",
    );
    await expectError(
      await call(patchPaper, {
        method: "PATCH",
        path: `/api/papers/${theirs}`,
        ...asAma,
        body: { name: "Mine now" },
      }),
      404,
      "not_found",
    );
    await expectError(
      await call(listInvites, { method: "GET", path: `/api/papers/${theirs}/invites`, ...asAma }),
      404,
      "not_found",
    );
    const random = randomUUID();
    await expectError(
      await call(getPaper, {
        method: "GET",
        path: `/api/papers/${random}`,
        token: ama.token,
        params: { paperId: random },
      }),
      404,
      "not_found",
    );
    await expectError(
      await call(getPaper, {
        method: "GET",
        path: "/api/papers/../x",
        token: ama.token,
        params: { paperId: "../x" },
      }),
      400,
      "bad_request",
    );
  });

  it("only the owner can rename", async () => {
    const id = await newPaper(ama);
    const invite = await newInvite(ama, id);
    await expectOk(await join(cole, invite.code), routes.joinPaper);

    const asCole = await call(patchPaper, {
      method: "PATCH",
      path: `/api/papers/${id}`,
      token: cole.token,
      params: { paperId: id },
      body: { name: "Cole's" },
    });
    await expectError(asCole, 403, "forbidden");

    const asAma = await call(patchPaper, {
      method: "PATCH",
      path: `/api/papers/${id}`,
      token: ama.token,
      params: { paperId: id },
      body: { name: "Renamed" },
    });
    expect((await expectOk(asAma, routes.updatePaper)).paper.name).toBe("Renamed");
  });

  it("has no paper-level style: style belongs to each person", async () => {
    const id = await newPaper(ama);
    const res = await call(createPaper, {
      method: "POST",
      path: "/api/papers",
      token: ama.token,
      body: { name: "Manga Monthly", style: "manga" },
    });
    await expectError(res, 400, "bad_request");
    const patched = await call(patchPaper, {
      method: "PATCH",
      path: `/api/papers/${id}`,
      token: ama.token,
      params: { paperId: id },
      body: { style: "sketch" },
    });
    await expectError(patched, 400, "bad_request");
  });

  it("handles every shared text case for the paper name", async () => {
    for (const tc of textCases) {
      const res = await call(createPaper, {
        method: "POST",
        path: "/api/papers",
        token: ama.token,
        body: { name: tc.text },
      });
      if (Buffer.byteLength(JSON.stringify({ name: tc.text })) > 8 * 1024) {
        await expectError(res, 413, "payload_too_large");
        continue;
      }
      const expected = createPaperRequestSchema.safeParse({ name: tc.text });
      if (!expected.success) {
        await expectError(res, 400, "bad_request");
        continue;
      }
      const { paper } = await expectOk(res, routes.createPaper);
      papers.push(paper.id);
      expect(paper.name, tc.id).toBe(expected.data.name);
    }
  });
});

describe("invites", () => {
  it("return the 6-character code once, and list without it", async () => {
    const id = await newPaper(ama);
    const invite = await newInvite(ama, id);
    expect(invite.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
    expect(invite.active).toBe(true);

    const res = await call(listInvites, {
      method: "GET",
      path: `/api/papers/${id}/invites`,
      token: ama.token,
      params: { paperId: id },
    });
    const raw = await res.clone().text();
    const { invites } = await expectOk(res, routes.listInvites);
    expect(invites.map((i) => i.id)).toEqual([invite.id]);
    expect(raw).not.toContain(invite.code.replace(/-/g, ""));
    expect(raw).not.toContain("code");

    const { data } = await serviceClient().from("invites").select("code_hash").eq("id", invite.id).single();
    expect(data?.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(data?.code_hash).not.toContain(invite.code.replace(/-/g, "").toLowerCase());
  });

  it("are owner-only", async () => {
    const id = await newPaper(ama);
    const invite = await newInvite(ama, id);
    await expectOk(await join(cole, invite.code), routes.joinPaper);
    const asCole = { token: cole.token, params: { paperId: id } };
    await expectError(
      await call(listInvites, { method: "GET", path: `/api/papers/${id}/invites`, ...asCole }),
      403,
      "forbidden",
    );
    await expectError(
      await call(createInvite, { method: "POST", path: `/api/papers/${id}/invites`, ...asCole }),
      403,
      "forbidden",
    );
  });

  it("cap active invites at 5 per paper", async () => {
    const id = await newPaper(ben);
    for (let i = 0; i < 5; i++) await newInvite(ben, id);
    const res = await call(createInvite, {
      method: "POST",
      path: `/api/papers/${id}/invites`,
      token: ben.token,
      params: { paperId: id },
    });
    await expectError(res, 409, "conflict");
  });

  it("revoke idempotently, and can't be revoked through another paper", async () => {
    const id = await newPaper(ama);
    const other = await newPaper(ama);
    const invite = await newInvite(ama, id);
    const revoke = (paperId: string) =>
      call(revokeInvite, {
        method: "DELETE",
        path: `/api/papers/${paperId}/invites/${invite.id}`,
        token: ama.token,
        params: { paperId, inviteId: invite.id },
      });
    await expectError(await revoke(other), 404, "not_found");
    const first = await expectOk(await revoke(id), routes.revokeInvite);
    expect(first.invite).toMatchObject({ id: invite.id, active: false });
    const second = await expectOk(await revoke(id), routes.revokeInvite);
    expect(second.invite.revokedAt).toBe(first.invite.revokedAt);
  });
});

describe("joining by code", () => {
  it("joins as a member, idempotently, counting the use once", async () => {
    const id = await newPaper(ama);
    const invite = await newInvite(ama, id);
    const { paper } = await expectOk(
      await join(ben, ` ${invite.code.slice(0, 3)} ${invite.code.slice(3).toLowerCase()} `),
      routes.joinPaper,
    );
    expect(paper).toMatchObject({ id, role: "member", memberCount: 2 });
    const again = await expectOk(await join(ben, invite.code), routes.joinPaper);
    expect(again.paper.memberCount).toBe(2);
    const { data } = await serviceClient().from("invites").select("use_count").eq("id", invite.id).single();
    expect(data?.use_count).toBe(1);
  });

  it("lets owners join their own paper's code without changing their role", async () => {
    const id = await newPaper(ama);
    const invite = await newInvite(ama, id);
    expect((await expectOk(await join(ama, invite.code), routes.joinPaper)).paper.role).toBe("owner");
  });

  it("is reusable by several people (multi-use)", async () => {
    const id = await newPaper(ama);
    const invite = await newInvite(ama, id);
    await expectOk(await join(ben, invite.code), routes.joinPaper);
    await expectOk(await join(cole, invite.code), routes.joinPaper);
    const { data } = await serviceClient().from("invites").select("use_count").eq("id", invite.id).single();
    expect(data?.use_count).toBe(2);
  });

  it("treats unknown, revoked, and expired codes identically", async () => {
    const id = await newPaper(ama);
    const revoked = await newInvite(ama, id);
    await call(revokeInvite, {
      method: "DELETE",
      path: `/api/papers/${id}/invites/${revoked.id}`,
      token: ama.token,
      params: { paperId: id, inviteId: revoked.id },
    });
    const expired = await newInvite(ama, id);
    await serviceClient()
      .from("invites")
      .update({ created_at: "2020-01-01T00:00:00Z", expires_at: "2020-01-08T00:00:00Z" })
      .eq("id", expired.id);

    const bodies = [];
    for (const code of [generateInviteCode(), revoked.code, expired.code]) {
      const err = await expectError(await join(cole, code), 404, "not_found");
      bodies.push({ ...err, requestId: "" });
    }
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
  });

  it("can't be used with the stored hash instead of the code", async () => {
    const id = await newPaper(ama);
    const invite = await newInvite(ama, id);
    const { data } = await serviceClient().from("invites").select("code_hash").eq("id", invite.id).single();
    await expectError(await join(cole, data!.code_hash), 400, "bad_request");
  });

  it("rate-limits guessing at the real limit (5 per minute)", async () => {
    const guesser = await createUser("guesser");
    users.push(guesser);
    process.env.RATE_LIMIT_ROUTE_SCALE = "1";
    resetConfigCache();
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 7; i++) statuses.push((await join(guesser, generateInviteCode())).status);
      expect(statuses).toEqual([404, 404, 404, 404, 404, 429, 429]);
    } finally {
      process.env.RATE_LIMIT_ROUTE_SCALE = "100";
      resetConfigCache();
    }
  });

  it("also limits guessing per IP across accounts (20 per minute)", async () => {
    const guessers = await Promise.all(Array.from({ length: 5 }, (_, i) => createUser(`ip-guesser-${i}`)));
    users.push(...guessers);
    process.env.RATE_LIMIT_ROUTE_SCALE = "1";
    resetConfigCache();
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    try {
      const statuses: number[] = [];
      for (const g of guessers.slice(0, 4))
        for (let i = 0; i < 5; i++) statuses.push((await join(g, generateInviteCode(), ip)).status);
      expect(statuses.every((s) => s === 404)).toBe(true);
      await expectError(await join(guessers[4]!, generateInviteCode(), ip), 429, "rate_limited");
    } finally {
      process.env.RATE_LIMIT_ROUTE_SCALE = "100";
      resetConfigCache();
    }
  });

  it("only treat a code as taken while an invite with it is still usable", async () => {
    const id = await newPaper(ama);
    const hash = (n: string) => n.repeat(64);
    const db = serviceClient();
    const day = 86_400_000;
    const row = (code: string, expiresIn: number, revoked: boolean) => ({
      paper_id: id,
      code_hash: hash(code),
      created_by: ama.id,
      created_at: new Date(Date.now() - day).toISOString(),
      expires_at: new Date(Date.now() + expiresIn).toISOString(),
      revoked_at: revoked ? new Date().toISOString() : null,
    });
    const seeded = await db
      .from("invites")
      .insert([row("a", -1000, false), row("b", day, true), row("c", day, false)]);
    expect(seeded.error).toBeNull();
    expect(await activeInviteHashExists(hash("a"))).toBe(false);
    expect(await activeInviteHashExists(hash("b"))).toBe(false);
    expect(await activeInviteHashExists(hash("c"))).toBe(true);
    const dup = await db.from("invites").insert({
      paper_id: id,
      code_hash: hash("a"),
      created_by: ama.id,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(dup.error).toBeNull();
  });

  it("refuses to join a full paper", async () => {
    const owner = await createUser("full-owner");
    users.push(owner);
    const id = await newPaper(owner, "Full House");
    const fillers = await Promise.all(Array.from({ length: 7 }, (_, i) => createUser(`filler-${i}`)));
    users.push(...fillers);
    await serviceClient()
      .from("paper_members")
      .insert(fillers.map((f) => ({ paper_id: id, user_id: f.id })));
    const invite = await newInvite(owner, id);
    await expectError(await join(cole, invite.code), 409, "conflict");
  });
});

describe("Postgres rate limiter", () => {
  it("counts per key across calls, reports Retry-After, and stores only hashed keys", async () => {
    const limiter = new PostgresRateLimiter(serviceDb);
    const key = `test:${randomUUID()}`;
    expect((await limiter.consume(key, 2, 60_000)).allowed).toBe(true);
    expect((await limiter.consume(key, 2, 60_000)).allowed).toBe(true);
    const third = await limiter.consume(key, 2, 60_000);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
    expect((await limiter.consume(`${key}:other`, 2, 60_000)).allowed).toBe(true);

    const { data } = await serviceClient().from("rate_limits").select("key").like("key", "%test:%");
    expect(data).toEqual([]);
  });

  it("is not reachable by app roles", async () => {
    const { error } = await ama.client.rpc("rate_limit_hit", {
      p_key: "a".repeat(64),
      p_limit: 1,
      p_window_seconds: 60,
    });
    expect(error).not.toBeNull();
    const table = await ama.client.from("rate_limits").select("key");
    expect(table.error?.code).toBe("42501");
    const fn = await ama.client.rpc("join_paper", { p_code_hash: "a".repeat(64), p_user: ama.id });
    expect(fn.error).not.toBeNull();
  });
});

describe("leaving a paper", () => {
  it("lets a member leave a second paper, and refuses the editor and a last paper", async () => {
    const member = await createUser("leaver");
    users.push(member);
    const home = await newPaper(ama, "Home Desk");
    const extra = await newPaper(ama, "Extra Desk");
    await expectOk(await join(member, (await newInvite(ama, home)).code), routes.joinPaper);
    await expectOk(await join(member, (await newInvite(ama, extra)).code), routes.joinPaper);

    const leave = (paperId: string, token = member.token) =>
      call(leavePaper, {
        method: "DELETE",
        path: `/api/papers/${paperId}/membership`,
        token,
        params: { paperId },
      });

    await expectError(await leave(home, ama.token), 409, "conflict");
    const { paperId, left } = await expectOk(await leave(extra), routes.leavePaper);
    expect(left).toBe(true);
    expect(paperId).toBe(extra);
    await expectError(await leave(home), 409, "conflict");
    await expectError(await leave(extra), 404, "not_found");
  });
});

describe("sessions", () => {
  it("rejects a token once its session is signed out", async () => {
    const u = await createUser("signout");
    users.push(u);
    await expectOk(await call(getMe, { method: "GET", path: "/api/me", token: u.token }), routes.getMe);
    const { error } = await serviceClient().auth.admin.signOut(u.token, "global");
    expect(error).toBeNull();
    await expectError(
      await call(getMe, { method: "GET", path: "/api/me", token: u.token }),
      401,
      "unauthorized",
    );
  });
});

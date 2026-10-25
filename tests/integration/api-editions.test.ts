import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getBundle } from "@/app/api/editions/[editionId]/route";
import { POST as publishEdition } from "@/app/api/editions/[editionId]/publish/route";
import { PUT as saveEdition } from "@/app/api/editions/[editionId]/saved/route";
import { PUT as setReaction } from "@/app/api/editions/[editionId]/stories/[storyId]/reaction/route";
import { GET as currentEdition } from "@/app/api/papers/[paperId]/editions/current/route";
import { GET as listEditions } from "@/app/api/papers/[paperId]/editions/route";
import { POST as createPaper } from "@/app/api/papers/route";
import { GET as runJobs } from "@/app/api/internal/jobs/route";
import { routes } from "@/lib/contract/routes";
import { call, expectError, expectOk } from "./helpers/api";
import { PREVIOUS_MONDAY, type TestUser, createUser, deleteUsers, must, serviceClient } from "./helpers/db";

let ama: TestUser;
let ben: TestUser;
const users: TestUser[] = [];
const papers: string[] = [];

beforeAll(async () => {
  [ama, ben] = await Promise.all([createUser("ama"), createUser("ben")]);
  users.push(ama, ben);
  await serviceClient().from("profiles").update({ name: "Ama", birthday: "1995-10-15" }).eq("id", ama.id);
});

afterAll(async () => {
  await serviceClient().from("papers").delete().in("id", papers);
  await deleteUsers(users);
});

async function paperFor(owner: TestUser, name: string): Promise<string> {
  const { paper } = await expectOk(
    await call(createPaper, { method: "POST", path: "/api/papers", token: owner.token, body: { name } }),
    routes.createPaper,
  );
  papers.push(paper.id);
  return paper.id;
}

describe("editions", () => {
  it("creates this week's draft and returns an empty bundle", async () => {
    const paperId = await paperFor(ama, "Campus Gazette");
    const { edition } = await expectOk(
      await call(currentEdition, {
        method: "GET",
        path: `/api/papers/${paperId}/editions/current`,
        token: ama.token,
        params: { paperId },
      }),
      routes.currentEdition,
    );
    expect(edition.status).toBe("draft");
    expect(edition.issueNumber).toBe(1);
    expect(edition.weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const { bundle } = await expectOk(
      await call(getBundle, {
        method: "GET",
        path: `/api/editions/${edition.id}`,
        token: ama.token,
        params: { editionId: edition.id },
      }),
      routes.getEditionBundle,
    );
    expect(bundle.pages).toEqual([]);
    expect(bundle.progress).toEqual([expect.objectContaining({ userId: ama.id, status: "not_started" })]);
    expect(bundle.edition.paperName).toBe("Campus Gazette");

    await expectError(
      await call(publishEdition, {
        method: "POST",
        path: `/api/editions/${edition.id}/publish`,
        token: ama.token,
        params: { editionId: edition.id },
        body: {},
      }),
      409,
      "conflict",
    );

    await expectError(
      await call(getBundle, {
        method: "GET",
        path: `/api/editions/${edition.id}`,
        token: ben.token,
        params: { editionId: edition.id },
      }),
      404,
      "not_found",
    );
  });

  it("publishes after the deadline, saves, and accepts a reaction", async () => {
    const paperId = await paperFor(ama, "The After Hours");
    const edition = must(
      await serviceClient()
        .from("editions")
        .insert({ paper_id: paperId, week_start: PREVIOUS_MONDAY })
        .select("id")
        .single(),
    );
    const now = new Date().toISOString();
    const page = must(
      await serviceClient()
        .from("pages")
        .insert({
          user_id: ama.id,
          week_start: PREVIOUS_MONDAY,
          status: "approved",
          generated_at: now,
          approved_at: now,
          comic_title: "Meanwhile, last week",
        })
        .select("id")
        .single(),
    );
    must(
      await serviceClient()
        .from("page_papers")
        .insert({ page_id: page.id, user_id: ama.id, paper_id: paperId, edition_id: edition.id })
        .select(),
    );
    const highlight = must(
      await serviceClient()
        .from("highlights")
        .insert({ page_id: page.id, user_id: ama.id, text: "Hosted a tiny dinner for Cole", position: 0 })
        .select("id")
        .single(),
    );
    const story = must(
      await serviceClient()
        .from("stories")
        .insert({
          page_id: page.id,
          highlight_id: highlight.id,
          user_id: ama.id,
          section: "food",
          headline: "Ama hosted a tiny dinner",
          body: "Cole came over and they cooked.",
        })
        .select("id")
        .single(),
    );

    const { edition: published } = await expectOk(
      await call(publishEdition, {
        method: "POST",
        path: `/api/editions/${edition.id}/publish`,
        token: ama.token,
        params: { editionId: edition.id },
        body: {},
      }),
      routes.publishEdition,
    );
    expect(published.status).toBe("published");
    expect(published.savedAt).toBeNull();
    expect(published.expiresAt).toBeTruthy();

    const { edition: saved } = await expectOk(
      await call(saveEdition, {
        method: "PUT",
        path: `/api/editions/${edition.id}/saved`,
        token: ama.token,
        params: { editionId: edition.id },
        body: { saved: true },
      }),
      routes.saveEdition,
    );
    expect(saved.savedAt).toBeTruthy();
    expect(saved.expiresAt).toBeNull();

    const storyId = story.id;
    const reacted = await expectOk(
      await call(setReaction, {
        method: "PUT",
        path: `/api/editions/${edition.id}/stories/${storyId}/reaction`,
        token: ama.token,
        params: { editionId: edition.id, storyId },
        body: { reaction: "ha" },
      }),
      routes.setReaction,
    );
    expect(reacted.myReaction).toBe("ha");
    expect(reacted.reactions.ha).toBe(1);

    const { bundle } = await expectOk(
      await call(getBundle, {
        method: "GET",
        path: `/api/editions/${edition.id}`,
        token: ama.token,
        params: { editionId: edition.id },
      }),
      routes.getEditionBundle,
    );
    expect(bundle.pages).toHaveLength(1);
    expect(bundle.pages[0]?.stories[0]?.reactions.ha).toBe(1);
    expect(bundle.birthdays.some((b) => b.userId === ama.id && b.monthDay === "10-15")).toBe(true);

    const { editions } = await expectOk(
      await call(listEditions, {
        method: "GET",
        path: `/api/papers/${paperId}/editions`,
        token: ama.token,
        params: { paperId },
      }),
      routes.listEditions,
    );
    expect(editions.some((e) => e.id === edition.id && e.status === "published")).toBe(true);
  });
});

describe("jobs", () => {
  it("sweeps with the cron secret", async () => {
    const res = await runJobs(
      new Request("http://localhost/api/internal/jobs", {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ processed: expect.any(Number) });
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getAvatar, POST as createAvatar } from "@/app/api/avatar/route";
import { POST as uploadAvatarPhoto } from "@/app/api/avatar/photo/route";
import { GET as getCurrentPage, PUT as setCurrentPapers } from "@/app/api/pages/current/route";
import { GET as getPage, PATCH as patchPage } from "@/app/api/pages/[pageId]/route";
import { POST as createHighlight } from "@/app/api/pages/[pageId]/highlights/route";
import { POST as generatePage } from "@/app/api/pages/[pageId]/generate/route";
import { POST as rewriteStory } from "@/app/api/pages/[pageId]/stories/[storyId]/rewrite/route";
import { POST as drawPanel } from "@/app/api/pages/[pageId]/panels/[index]/route";
import { POST as approvePage } from "@/app/api/pages/[pageId]/approve/route";
import { POST as addPhoto } from "@/app/api/highlights/[highlightId]/photos/route";
import { DELETE as deletePhoto } from "@/app/api/photos/[photoId]/route";
import { POST as createPaper } from "@/app/api/papers/route";
import { routes } from "@/lib/contract/routes";
import { call, expectError, expectOk } from "./helpers/api";
import { PNG_BYTES, type TestUser, createUser, deleteUsers, serviceClient } from "./helpers/db";

let ama: TestUser;
let ben: TestUser;
const users: TestUser[] = [];
const papers: string[] = [];

beforeAll(async () => {
  [ama, ben] = await Promise.all([createUser("ama"), createUser("ben")]);
  users.push(ama, ben);
  await serviceClient().from("profiles").update({ name: "Ama Serwaa", style: "classic" }).eq("id", ama.id);
  await serviceClient().from("profiles").update({ name: "Ben" }).eq("id", ben.id);
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

describe("pages", () => {
  it("starts with no current page, then creates one when papers are picked", async () => {
    const empty = await expectOk(
      await call(getCurrentPage, { method: "GET", path: "/api/pages/current", token: ama.token }),
      routes.getCurrentPage,
    );
    expect(empty.page).toBeNull();

    const paperId = await paperFor(ama, "The Longhorn Crew");
    const { page } = await expectOk(
      await call(setCurrentPapers, {
        method: "PUT",
        path: "/api/pages/current",
        token: ama.token,
        body: { paperIds: [paperId] },
      }),
      routes.setCurrentPagePapers,
    );
    expect(page.papers).toEqual([expect.objectContaining({ paperId, paperName: "The Longhorn Crew" })]);
    expect(page.status).toBe("writing");
    expect(page.locked).toBe(false);
    expect(page.highlights).toEqual([]);
  });

  it("lets the author add a highlight, generate, draw, edit, and approve", async () => {
    const { page: current } = await expectOk(
      await call(getCurrentPage, { method: "GET", path: "/api/pages/current", token: ama.token }),
      routes.getCurrentPage,
    );
    const pageId = current!.id;

    const { highlight } = await expectOk(
      await call(createHighlight, {
        method: "POST",
        path: `/api/pages/${pageId}/highlights`,
        token: ama.token,
        params: { pageId },
        body: { text: "Ran my first 5K with Maya", serious: false, inComic: true },
      }),
      routes.addHighlight,
    );
    expect(highlight.text).toContain("5K");
    expect(highlight.position).toBe(0);

    const photoRes = await call(addPhoto, {
      method: "POST",
      path: `/api/highlights/${highlight.id}/photos`,
      token: ama.token,
      params: { highlightId: highlight.id },
      multipart: {
        file: { field: "photo", filename: "run.png", type: "image/png", bytes: PNG_BYTES },
      },
    });
    const { photo } = await expectOk(photoRes, routes.addPhoto);
    expect(photo.highlightId).toBe(highlight.id);
    expect(photo.url).toContain("http");

    const { page: generated } = await expectOk(
      await call(generatePage, {
        method: "POST",
        path: `/api/pages/${pageId}/generate`,
        token: ama.token,
        params: { pageId },
        body: {},
      }),
      routes.generatePage,
    );
    expect(generated.status).toBe("generated");
    expect(generated.stories).toHaveLength(1);
    expect(generated.comic?.panels).toHaveLength(4);
    expect(generated.stories[0]?.headline.toLowerCase()).toContain("ama");

    const storyId = generated.stories[0]!.id;
    const { story } = await expectOk(
      await call(rewriteStory, {
        method: "POST",
        path: `/api/pages/${pageId}/stories/${storyId}/rewrite`,
        token: ama.token,
        params: { pageId, storyId },
        body: {},
      }),
      routes.rewriteStory,
    );
    expect(story.id).toBe(storyId);

    const { panel } = await expectOk(
      await call(drawPanel, {
        method: "POST",
        path: `/api/pages/${pageId}/panels/0`,
        token: ama.token,
        params: { pageId, index: "0" },
        body: {},
      }),
      routes.drawPanel,
    );
    expect(panel.image.status).toBe("ready");
    expect(panel.image.url).toBeTruthy();

    const { page: edited } = await expectOk(
      await call(patchPage, {
        method: "PATCH",
        path: `/api/pages/${pageId}`,
        token: ama.token,
        params: { pageId },
        body: { stories: [{ id: storyId, headline: "Ama finished a five kilometer run" }] },
      }),
      routes.updatePage,
    );
    expect(edited.stories[0]?.headline).toContain("five kilometer");
    expect(edited.status).toBe("generated");

    const { page: approved } = await expectOk(
      await call(approvePage, {
        method: "POST",
        path: `/api/pages/${pageId}/approve`,
        token: ama.token,
        params: { pageId },
        body: {},
      }),
      routes.approvePage,
    );
    expect(approved.status).toBe("approved");

    await expectOk(
      await call(deletePhoto, {
        method: "DELETE",
        path: `/api/photos/${photo.id}`,
        token: ama.token,
        params: { photoId: photo.id },
      }),
      routes.deletePhoto,
    );
  });

  it("hides another person's page (IDOR)", async () => {
    const { page } = await expectOk(
      await call(getCurrentPage, { method: "GET", path: "/api/pages/current", token: ama.token }),
      routes.getCurrentPage,
    );
    await expectError(
      await call(getPage, {
        method: "GET",
        path: `/api/pages/${page!.id}`,
        token: ben.token,
        params: { pageId: page!.id },
      }),
      404,
      "not_found",
    );
  });
});

describe("avatar", () => {
  it("uploads a consented photo and draws an avatar from traits", async () => {
    const uploaded = await expectOk(
      await call(uploadAvatarPhoto, {
        method: "POST",
        path: "/api/avatar/photo",
        token: ama.token,
        multipart: {
          fields: { photoConsent: "true" },
          file: { field: "photo", filename: "me.png", type: "image/png", bytes: PNG_BYTES },
        },
      }),
      routes.uploadAvatarPhoto,
    );
    expect(uploaded.photoUrl).toContain("http");

    const created = await expectOk(
      await call(createAvatar, {
        method: "POST",
        path: "/api/avatar",
        token: ama.token,
        body: {
          traits: {
            hairStyle: "curly",
            hairColor: "dark_brown",
            glasses: "round",
            top: "hoodie",
            topColor: "green",
          },
          photoUrl: uploaded.photoUrl,
        },
      }),
      routes.createAvatar,
    );
    expect(created.look).toMatch(/curly|hoodie|glasses/i);
    expect(created.avatarUrl).toContain("http");

    const state = await expectOk(
      await call(getAvatar, { method: "GET", path: "/api/avatar", token: ama.token }),
      routes.getAvatar,
    );
    expect(state.avatarUrl).toBeTruthy();
    expect(state.traits?.hairStyle).toBe("curly");
  });

  it("rejects a photo without consent and a foreign photoUrl", async () => {
    await expectError(
      await call(uploadAvatarPhoto, {
        method: "POST",
        path: "/api/avatar/photo",
        token: ama.token,
        multipart: {
          fields: { photoConsent: "false" },
          file: { field: "photo", filename: "me.png", type: "image/png", bytes: PNG_BYTES },
        },
      }),
      400,
      "bad_request",
    );
    await expectError(
      await call(createAvatar, {
        method: "POST",
        path: "/api/avatar",
        token: ama.token,
        body: { photoUrl: "https://evil.example/x.png" },
      }),
      403,
      "forbidden",
    );
  });
});

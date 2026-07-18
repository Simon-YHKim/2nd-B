// Orchestration tests for captureFromMarkdown. Verifies the function calls
// buildSourcePayload → uploadRawClipping → createSource in the right order
// with the right arguments. The body-only markdown (frontmatter stripped)
// is what lands in Storage, not the raw input.

interface Captured {
  fn: string;
  args: unknown[];
}

const captured: Captured[] = [];
const fixtures: Record<string, unknown> = {};

jest.mock("../storage", () => ({
  rawClippingPath: (userId: string, slug: string) => `${userId}/${slug}.md`,
  uploadRawClipping: jest.fn((userId: string, slug: string, content: string) => {
    captured.push({ fn: "uploadRawClipping", args: [userId, slug, content] });
    return Promise.resolve({ path: `${userId}/${slug}.md` });
  }),
}));

jest.mock("../queries", () => ({
  createSource: jest.fn((input: unknown, signal?: AbortSignal) => {
    captured.push({ fn: "createSource", args: [input, signal] });
    return Promise.resolve(fixtures.sourceRow);
  }),
  // Ingest gate deps (0044). Default to "no prior clip" so capture follows the
  // keep path; the dedup-specific test overrides fixtures.candidates.
  findIngestCandidates: jest.fn(() => Promise.resolve(fixtures.candidates ?? [])),
  recordIngestDrop: jest.fn((input: unknown) => {
    captured.push({ fn: "recordIngestDrop", args: [input] });
    return Promise.resolve();
  }),
  getSource: jest.fn((_userId: string, id: string) => {
    captured.push({ fn: "getSource", args: [id] });
    return Promise.resolve(fixtures.existingSource ?? null);
  }),
}));

import { captureFromMarkdown } from "../capture";
import { minhashSignature } from "../../ingest/dedup";

function reset() {
  captured.length = 0;
  for (const k of Object.keys(fixtures)) delete fixtures[k];
}

describe("captureFromMarkdown", () => {
  beforeEach(reset);

  test("happy path: clipper md → storage upload → source insert", async () => {
    fixtures.sourceRow = { id: "s1", user_id: "u1", kind: "article", title: "Foo" };
    const md = `---
title: "Foo"
url: "https://example.com/foo"
tags:
  - psychology
simon-relevance: 4
---

# Foo

Body content with [[some link]].`;

    const r = await captureFromMarkdown({ userId: "u1", rawMd: md });

    expect(captured.map((c) => c.fn)).toEqual(["uploadRawClipping", "createSource"]);

    const upload = captured[0];
    expect(upload.args[0]).toBe("u1");
    expect(upload.args[1]).toMatch(/^foo-[0-9a-f]{12}$/); // slug from title + content-hash suffix
    // The body uploaded to Storage has the frontmatter stripped.
    expect(upload.args[2]).not.toContain("---");
    expect(upload.args[2]).toContain("# Foo");
    expect(upload.args[2]).toContain("[[some link]]");

    const insert = captured[1];
    expect(insert.args[0]).toMatchObject({
      user_id: "u1",
      kind: "article",
      title: "Foo",
      source_url: "https://example.com/foo",
      storage_path: expect.stringMatching(/^u1\/foo-[0-9a-f]{12}\.md$/),
      tags: ["psychology"],
      simon_relevance: 4,
    });

    expect(r.hadFrontmatter).toBe(true);
    expect(r.suggested_slug).toBe("foo");
    expect(r.storage_path).toMatch(/^u1\/foo-[0-9a-f]{12}\.md$/);
  });

  test("Hangul title: wiki slug keeps Hangul, storage key goes ASCII-safe", async () => {
    // Supabase Storage rejects non-ASCII keys (400 Invalid key) — the physical
    // key must be ASCII while suggested_slug (human-facing) keeps Hangul.
    fixtures.sourceRow = { id: "s1", user_id: "u1", kind: "note", title: "KakaoTalk 가져오기" };
    const md = `---
title: "KakaoTalk 가져오기"
---

- 내일 저녁 7시에 보자`;

    const r = await captureFromMarkdown({ userId: "u1", rawMd: md });

    const upload = captured[0];
    expect(upload.fn).toBe("uploadRawClipping");
    expect(upload.args[1]).toMatch(/^kakaotalk-[0-9a-f]{12}$/); // Hangul stripped, hash suffix kept
    expect(r.suggested_slug).toBe("kakaotalk-가져오기"); // human-facing slug untouched
    expect(r.storage_path).toMatch(/^u1\/kakaotalk-[0-9a-f]{12}\.md$/);
  });

  test("fallback URL drives kind detection when frontmatter has no url", async () => {
    fixtures.sourceRow = { id: "s1", user_id: "u1", kind: "code", title: "T" };
    const md = `---
title: "T"
---
Body.`;
    await captureFromMarkdown({
      userId: "u1",
      rawMd: md,
      fallbackUrl: "https://github.com/anthropics/claude-code",
    });
    const insert = captured.find((c) => c.fn === "createSource")!;
    expect((insert.args[0] as { kind: string; source_url: string }).kind).toBe("code");
    expect((insert.args[0] as { source_url: string }).source_url).toBe(
      "https://github.com/anthropics/claude-code",
    );
  });

  test("kindOverride wins over URL-based detection", async () => {
    fixtures.sourceRow = { id: "s1", user_id: "u1", kind: "self_knowledge", title: "T" };
    const md = `---
title: "T"
url: "https://github.com/x/y"
---
Body.`;
    await captureFromMarkdown({
      userId: "u1",
      rawMd: md,
      kindOverride: "self_knowledge",
    });
    const insert = captured.find((c) => c.fn === "createSource")!;
    expect((insert.args[0] as { kind: string }).kind).toBe("self_knowledge");
  });

  test("no-frontmatter input: title from H1, kind = inbox, tags empty", async () => {
    fixtures.sourceRow = { id: "s1", user_id: "u1", kind: "inbox", title: "Heading" };
    const r = await captureFromMarkdown({
      userId: "u1",
      rawMd: "# Heading\n\nFree-form note.",
    });
    expect(r.hadFrontmatter).toBe(false);
    expect(r.suggested_slug).toBe("heading");

    const insert = captured.find((c) => c.fn === "createSource")!;
    expect((insert.args[0] as { kind: string; tags: string[] }).kind).toBe("inbox");
    expect((insert.args[0] as { tags: string[] }).tags).toEqual([]);
  });

  test("storage_path = ASCII-safe slug + content-hash suffix (collision-free)", async () => {
    fixtures.sourceRow = { id: "s1", user_id: "u1", kind: "self_knowledge", title: "T" };
    const r = await captureFromMarkdown({
      userId: "u1",
      rawMd: "# 민지의 성장 노트\n\n자기 노트.",
    });
    // The human-facing slug keeps Hangul; the PHYSICAL storage key cannot
    // (Storage 400s on non-ASCII — the pre-2026-07-18 Hangul key failed every
    // upload straight into the inline fallback). Pure-Hangul slugs collapse to
    // the stable s-<hash> token + the 12-hex content-hash suffix, so distinct
    // titles and same-title captures both stay collision-free.
    expect(r.suggested_slug).toBe("민지의-성장-노트");
    expect(r.storage_path).toMatch(/^u1\/s-[0-9a-z]+-[0-9a-f]{12}\.md$/);
    const upload = captured.find((c) => c.fn === "uploadRawClipping")!;
    expect(upload.args[1]).toMatch(/^s-[0-9a-z]+-[0-9a-f]{12}$/);
  });

  test("same-title captures with different bodies get distinct storage paths (regression: no overwrite)", async () => {
    fixtures.sourceRow = { id: "s1", user_id: "u1", kind: "inbox", title: "Note" };
    const a = await captureFromMarkdown({ userId: "u1", rawMd: "# Note\n\nthe first body." });
    const b = await captureFromMarkdown({ userId: "u1", rawMd: "# Note\n\na completely different second body." });
    expect(a.suggested_slug).toBe(b.suggested_slug); // same title -> same human slug
    expect(a.storage_path).not.toBe(b.storage_path); // but distinct storage paths (no collision)
  });

  test("userTags merged with frontmatter tags, deduped + lowercased", async () => {
    fixtures.sourceRow = { id: "s1", user_id: "u1", kind: "article", title: "Foo", tags: [] };
    const md = `---
title: "Foo"
tags:
  - psychology
  - habits
---
Body.`;
    await captureFromMarkdown({
      userId: "u1",
      rawMd: md,
      userTags: ["Productivity", "psychology", "  Reading  ", ""],
    });
    const insert = captured.find((c) => c.fn === "createSource")!;
    // Order: frontmatter first, then user tags (in order); psychology dedup'd; empty dropped.
    expect((insert.args[0] as { tags: string[] }).tags).toEqual([
      "psychology",
      "habits",
      "productivity",
      "reading",
    ]);
  });

  test("track is persisted to frontmatter.wiki_track when provided", async () => {
    fixtures.sourceRow = { id: "s1", user_id: "u1", kind: "self_knowledge", title: "T", tags: [] };
    await captureFromMarkdown({
      userId: "u1",
      rawMd: "# T\n\nBody.",
      track: "pro",
    });
    const insert = captured.find((c) => c.fn === "createSource")!;
    expect((insert.args[0] as { frontmatter: { wiki_track?: string } }).frontmatter.wiki_track).toBe("pro");
  });

  test("track omitted → frontmatter has no wiki_track key", async () => {
    fixtures.sourceRow = { id: "s1", user_id: "u1", kind: "self_knowledge", title: "T", tags: [] };
    await captureFromMarkdown({ userId: "u1", rawMd: "# T\n\nBody." });
    const insert = captured.find((c) => c.fn === "createSource")!;
    expect((insert.args[0] as { frontmatter: Record<string, unknown> }).frontmatter.wiki_track).toBeUndefined();
  });

  // The AI clipper classifier reports relevance on a 0..1 scale; the
  // sources.simon_relevance column is the clipper 1..5 integer with a CHECK.
  // captureFromMarkdown must rescale so a save never violates the CHECK.
  test("AI simon_relevance (0..1) is rescaled to the clipper 1..5 integer", async () => {
    fixtures.sourceRow = { id: "s1", user_id: "u1", kind: "article", title: "T", tags: [] };
    await captureFromMarkdown({ userId: "u1", rawMd: "# T\n\nBody.", simonRelevance: 0.8 });
    const insert = captured.find((c) => c.fn === "createSource")!;
    expect((insert.args[0] as { simon_relevance: number }).simon_relevance).toBe(4);
  });

  test("AI relevance of 0 floors to 1 (never violates the 1..5 CHECK)", async () => {
    fixtures.sourceRow = { id: "s1", user_id: "u1", kind: "inbox", title: "T", tags: [] };
    await captureFromMarkdown({ userId: "u1", rawMd: "# T\n\nBody.", simonRelevance: 0 });
    const insert = captured.find((c) => c.fn === "createSource")!;
    expect((insert.args[0] as { simon_relevance: number }).simon_relevance).toBe(1);
  });

  test("no AI relevance → falls back to the frontmatter simon-relevance", async () => {
    fixtures.sourceRow = { id: "s1", user_id: "u1", kind: "article", title: "Foo", tags: [] };
    const md = `---
title: "Foo"
simon-relevance: 3
---
Body.`;
    await captureFromMarkdown({ userId: "u1", rawMd: md });
    const insert = captured.find((c) => c.fn === "createSource")!;
    expect((insert.args[0] as { simon_relevance: number }).simon_relevance).toBe(3);
  });

  // A storage hiccup must never lose the user's piece: the source row still
  // saves, with the body stashed in frontmatter for later recovery.
  test("storage upload failure still saves the source (body kept in frontmatter)", async () => {
    fixtures.sourceRow = { id: "s1", user_id: "u1", kind: "inbox", title: "T", tags: [] };
    const storage = require("../storage") as { uploadRawClipping: jest.Mock };
    storage.uploadRawClipping.mockRejectedValueOnce(new Error("storage down"));

    const r = await captureFromMarkdown({ userId: "u1", rawMd: "# T\n\nImportant body." });

    const insert = captured.find((c) => c.fn === "createSource");
    expect(insert).toBeDefined();
    const arg = insert!.args[0] as { storage_path: string; frontmatter: Record<string, unknown> };
    // Row saved with the canonical (hash-suffixed) path; body preserved in frontmatter.
    expect(arg.storage_path).toMatch(/^u1\/t-[0-9a-f]{12}\.md$/);
    expect(arg.frontmatter._storage_pending).toBe(true);
    expect(arg.frontmatter._body_fallback).toContain("Important body.");
    expect(r.source).toBe(fixtures.sourceRow);
    // The degraded state must be visible to the caller, not a silent success
    // (capture screen surfaces it as a one-line note in the saved panel).
    expect(r.storagePending).toBe(true);
  });

  test("clean upload reports storagePending false", async () => {
    fixtures.sourceRow = { id: "s1", user_id: "u1", kind: "inbox", title: "T", tags: [] };
    const r = await captureFromMarkdown({ userId: "u1", rawMd: "# T\n\nBody." });
    expect(r.storagePending).toBe(false);
  });

  test("pre-aborted signal stops before storage upload or source insert", async () => {
    fixtures.sourceRow = { id: "s1", user_id: "u1", kind: "inbox", title: "T", tags: [] };
    const controller = new AbortController();
    controller.abort();

    await expect(
      captureFromMarkdown({
        userId: "u1",
        rawMd: "# T\n\nBody.",
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(captured).toEqual([]);
  });

  test("capture signal reaches source insert", async () => {
    fixtures.sourceRow = { id: "s1", user_id: "u1", kind: "inbox", title: "T", tags: [] };
    const controller = new AbortController();

    await captureFromMarkdown({ userId: "u1", rawMd: "# T\n\nBody.", signal: controller.signal });

    const insert = captured.find((c) => c.fn === "createSource")!;
    expect(insert.args[1]).toBe(controller.signal);
  });

  // §1 ingest gate (dedup) wiring.
  test("exact duplicate is an idempotent save: returns existing row, no upload/insert", async () => {
    fixtures.existingSource = {
      id: "existing-1",
      user_id: "u1",
      kind: "inbox",
      title: "Dup",
      storage_path: "u1/dup.md",
    };
    const drops: { stage: string }[] = [];
    const r = await captureFromMarkdown({
      userId: "u1",
      rawMd: "A note that already lives in the brain.",
      // findCandidates receives the gate-computed hash as its 2nd arg, so
      // echoing it back guarantees an exact-hash match.
      gateDeps: {
        findCandidates: (_bands, hash) => Promise.resolve([{ id: "existing-1", contentHash: hash }]),
        recordDrop: (row) => {
          drops.push(row);
          return Promise.resolve();
        },
      },
    });

    expect(r.deduped).toBe("exact_duplicate");
    expect(r.source).toBe(fixtures.existingSource);
    expect(captured.some((c) => c.fn === "uploadRawClipping")).toBe(false);
    expect(captured.some((c) => c.fn === "createSource")).toBe(false);
    expect(drops).toHaveLength(1);
    expect(drops[0].stage).toBe("exact_duplicate");
  });

  test("near duplicate is still saved but linked to the survivor via dedup_of", async () => {
    fixtures.sourceRow = { id: "s2", user_id: "u1", kind: "inbox", title: "Near", tags: [] };
    const body = "A reflective note about morning sunlight and how it shifts my focus through the week.";
    const r = await captureFromMarkdown({
      userId: "u1",
      rawMd: body,
      gateDeps: {
        // Same text → identical signature → similarity 1.0 (near), but a
        // different content_hash so it isn't an exact match.
        findCandidates: () =>
          Promise.resolve([{ id: "survivor-1", contentHash: "different-hash", signature: minhashSignature(body) }]),
        recordDrop: () => Promise.resolve(),
      },
    });

    expect(r.deduped).toBe("near_duplicate");
    const insert = captured.find((c) => c.fn === "createSource")!;
    expect((insert.args[0] as { dedup_of: string | null }).dedup_of).toBe("survivor-1");
    expect((insert.args[0] as { content_hash?: string }).content_hash).toBeDefined();
  });
});

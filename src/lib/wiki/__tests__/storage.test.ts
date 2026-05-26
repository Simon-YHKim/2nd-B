// Smoke tests for the storage helpers — verify path composition and that
// uploads go to the canonical `<userId>/<slug>.md` location with the right
// content type. Real Storage round-trips happen in PR 2 integration tests.

interface Captured {
  op: "upload" | "download" | "remove";
  bucket: string;
  path: string | string[];
  content?: string;
  options?: Record<string, unknown>;
}

const captured: Captured[] = [];

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    storage: {
      from(bucket: string) {
        return {
          upload(path: string, content: string, options: Record<string, unknown>) {
            captured.push({ op: "upload", bucket, path, content, options });
            return Promise.resolve({ data: { path }, error: null });
          },
          download(path: string) {
            captured.push({ op: "download", bucket, path });
            return Promise.resolve({
              data: { text: () => Promise.resolve("downloaded content") },
              error: null,
            });
          },
          remove(paths: string[]) {
            captured.push({ op: "remove", bucket, path: paths });
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
    },
  }),
}));

jest.mock("../../env", () => ({
  getEnv: () => ({
    EXPO_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40),
  }),
}));

import { downloadRawClipping, deleteRawClipping, rawClippingPath, uploadRawClipping } from "../storage";

describe("rawClippingPath", () => {
  test("composes <userId>/<slug>.md", () => {
    expect(rawClippingPath("user-abc", "my-page")).toBe("user-abc/my-page.md");
  });

  test("preserves Hangul slugs", () => {
    expect(rawClippingPath("u1", "민지의-성장-노트")).toBe("u1/민지의-성장-노트.md");
  });
});

describe("uploadRawClipping", () => {
  beforeEach(() => {
    captured.length = 0;
  });

  test("writes to <userId>/<slug>.md in the raw-clippings bucket", async () => {
    const r = await uploadRawClipping("u1", "foo", "# body");
    expect(r.path).toBe("u1/foo.md");
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      op: "upload",
      bucket: "raw-clippings",
      path: "u1/foo.md",
      content: "# body",
    });
    expect(captured[0].options).toMatchObject({ contentType: "text/markdown; charset=utf-8", upsert: false });
  });

  test("overwrite=true forwards upsert=true to Supabase", async () => {
    await uploadRawClipping("u1", "foo", "body", { overwrite: true });
    expect(captured[0].options).toMatchObject({ upsert: true });
  });
});

describe("downloadRawClipping", () => {
  beforeEach(() => {
    captured.length = 0;
  });

  test("reads from the raw-clippings bucket and returns text", async () => {
    const text = await downloadRawClipping("u1/foo.md");
    expect(text).toBe("downloaded content");
    expect(captured[0]).toMatchObject({ op: "download", bucket: "raw-clippings", path: "u1/foo.md" });
  });
});

describe("deleteRawClipping", () => {
  beforeEach(() => {
    captured.length = 0;
  });

  test("removes via the raw-clippings bucket", async () => {
    await deleteRawClipping("u1/foo.md");
    expect(captured[0]).toMatchObject({ op: "remove", bucket: "raw-clippings", path: ["u1/foo.md"] });
  });
});

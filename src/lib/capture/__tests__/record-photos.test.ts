// Photos attached to a 글 record (2026-09-30). The pure rules are tested
// directly; the Storage calls run against a stubbed Supabase client.

const storageCalls: { op: string; args: unknown[] }[] = [];
let uploadError: unknown = null;
let failUploadAt = -1;
jest.mock("../../env", () => ({ getEnv: () => ({ EXPO_PUBLIC_SUPABASE_URL: "https://project.example.test/", EXPO_PUBLIC_SUPABASE_ANON_KEY: "public-anon" }) }));

jest.mock("../../supabase/client", () => {
  const bucket = {
    upload: jest.fn(async (path: string, body: unknown, options: unknown) => {
      storageCalls.push({ op: "upload", args: [path, body, options] });
      const index = storageCalls.filter((call) => call.op === "upload").length - 1;
      return { data: null, error: index === failUploadAt ? uploadError : null };
    }),
    remove: jest.fn(async (paths: string[]) => {
      storageCalls.push({ op: "remove", args: [paths] });
      return { data: paths.map((name) => ({ name })), error: null };
    }),
    createSignedUrls: jest.fn(async (paths: string[], ttl: number) => {
      storageCalls.push({ op: "sign", args: [paths, ttl] });
      return {
        data: paths.map((path) => ({ path, signedUrl: `https://signed.example/${path}`, error: null })),
        error: null,
      };
    }),
  };
  const client = { storage: { from: () => bucket } };
  return { getSupabaseClient: () => client };
});

import {
  MAX_RECORD_PHOTOS,
  base64ToBytes,
  isRecordPhotoPath,
  parseRecordPhotos,
  recordPhotoPath,
  recordPhotoPathsOf,
  recordPhotosPayload,
  removeRecordPhotoObjects,
  signRecordPhotoUrls,
  uploadRecordPhotos,
  prepareRecordPhotoWipe,
  removeRecordPhotoBatchCaptured,
} from "../record-photos";

const USER = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-2222-3333-4444-555555555555";
const pathOf = (id: string, owner = USER) => `${owner}/photo-${id}.jpg`;

beforeEach(() => {
  storageCalls.length = 0;
  uploadError = null;
  failUploadAt = -1;
});

describe("record photo paths", () => {
  test("live flat under the owner's folder, so export-account's flat listing can size them", () => {
    expect(recordPhotoPath(USER, "abcdef12-0000")).toBe(`${USER}/photo-abcdef12-0000.jpg`);
    expect(() => recordPhotoPath("", "abcdef12")).toThrow("record_photo_invalid_owner");
    expect(() => recordPhotoPath(`${USER}/x`, "abcdef12")).toThrow("record_photo_invalid_owner");
    expect(() => recordPhotoPath(USER, "../../evil")).toThrow("record_photo_invalid_id");
  });

  test("only this module's own names are recognised, never a raw clipping", () => {
    expect(isRecordPhotoPath(pathOf("abcdef12"))).toBe(true);
    expect(isRecordPhotoPath(pathOf("abcdef12"), USER)).toBe(true);
    expect(isRecordPhotoPath(pathOf("abcdef12"), OTHER)).toBe(false);
    expect(isRecordPhotoPath(`${USER}/some-clipping.md`)).toBe(false);
    expect(isRecordPhotoPath(`${USER}/photo-abcdef12.png`)).toBe(false);
    expect(isRecordPhotoPath(`${USER}/photos/photo-abcdef12.jpg`)).toBe(false);
    expect(isRecordPhotoPath(`photo-abcdef12.jpg`)).toBe(false);
    expect(isRecordPhotoPath(42)).toBe(false);
  });
});

describe("records.structured.photos", () => {
  test("parse keeps valid entries, drops the rest, and caps the count", () => {
    const raw = {
      photos: [
        { path: pathOf("aaaaaaaa"), mime: "image/jpeg", width: 1600, height: 1200 },
        { path: pathOf("aaaaaaaa"), mime: "image/jpeg" }, // duplicate
        { path: pathOf("bbbbbbbb", OTHER), mime: "image/jpeg" }, // not the viewer's
        { path: pathOf("cccccccc"), mime: "image/png" }, // wrong type
        { path: pathOf("dddddddd"), mime: "image/jpeg", width: -3, height: 1.5 },
        null,
        "nope",
        { path: pathOf("eeeeeeee"), mime: "image/jpeg" },
        { path: pathOf("ffffffff"), mime: "image/jpeg" },
        { path: pathOf("gggggggg"), mime: "image/jpeg" },
      ],
    };
    const parsed = parseRecordPhotos(raw, USER);
    expect(parsed).toHaveLength(MAX_RECORD_PHOTOS);
    expect(parsed[0]).toEqual({ path: pathOf("aaaaaaaa"), mime: "image/jpeg", width: 1600, height: 1200 });
    expect(parsed[1]).toEqual({ path: pathOf("dddddddd"), mime: "image/jpeg" });
    expect(parsed.map((photo) => photo.path)).not.toContain(pathOf("bbbbbbbb", OTHER));
  });

  test("anything that is not a photo payload reads as no photos", () => {
    for (const raw of [null, undefined, "x", [], { photos: "x" }, { form: "fourw", version: 1, fields: {} }]) {
      expect(parseRecordPhotos(raw)).toEqual([]);
    }
  });

  test("the save payload is photos-only and absent when there are none", () => {
    const refs = [{ path: pathOf("aaaaaaaa"), mime: "image/jpeg" as const }];
    expect(recordPhotosPayload([])).toBeUndefined();
    expect(recordPhotosPayload(refs)).toEqual({ photos: refs });
  });

  test("paths are collected across rows, deduplicated, and scoped to the owner", () => {
    const rows = [
      { structured: { photos: [{ path: pathOf("aaaaaaaa"), mime: "image/jpeg" }] } },
      { structured: { photos: [{ path: pathOf("aaaaaaaa"), mime: "image/jpeg" }, { path: pathOf("bbbbbbbb"), mime: "image/jpeg" }] } },
      { structured: { photos: [{ path: pathOf("cccccccc", OTHER), mime: "image/jpeg" }] } },
      { structured: null },
      {},
    ];
    expect(recordPhotoPathsOf(rows, USER)).toEqual([pathOf("aaaaaaaa"), pathOf("bbbbbbbb")]);
    expect(recordPhotoPathsOf(null)).toEqual([]);
  });
});

describe("base64ToBytes", () => {
  test("decodes with and without padding, ignoring whitespace", () => {
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a]);
    const b64 = Buffer.from(bytes).toString("base64");
    expect(Array.from(base64ToBytes(b64))).toEqual(Array.from(bytes));
    expect(Array.from(base64ToBytes(b64.replace(/=+$/, "")))).toEqual(Array.from(bytes));
    expect(Array.from(base64ToBytes(`${b64.slice(0, 4)}\n${b64.slice(4)}`))).toEqual(Array.from(bytes));
  });

  test("rejects characters outside the alphabet and impossible lengths", () => {
    expect(() => base64ToBytes("ab$d")).toThrow("record_photo_invalid_base64");
    expect(() => base64ToBytes("abcde")).toThrow("record_photo_invalid_base64");
  });
});

describe("Storage calls", () => {
  test("upload stores JPEG bytes under fresh flat names and returns the refs", async () => {
    const ids = ["AAAAAAAA-1111", "BBBBBBBB-2222"];
    const refs = await uploadRecordPhotos(
      USER,
      [
        { base64: Buffer.from([0xff, 0xd8, 0xff]).toString("base64"), width: 1600, height: 1200 },
        { base64: Buffer.from([0xff, 0xd8, 0xff, 0x01]).toString("base64") },
      ],
      () => ids.shift() ?? "zzzzzzzz",
    );
    expect(refs).toEqual([
      { path: pathOf("aaaaaaaa-1111"), mime: "image/jpeg", width: 1600, height: 1200 },
      { path: pathOf("bbbbbbbb-2222"), mime: "image/jpeg" },
    ]);
    const uploads = storageCalls.filter((call) => call.op === "upload");
    expect(uploads).toHaveLength(2);
    expect(uploads[0].args[1]).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(uploads[0].args[1] as ArrayBuffer))).toEqual([0xff, 0xd8, 0xff]);
    expect(uploads[0].args[2]).toEqual({ contentType: "image/jpeg", upsert: false });
  });

  test("a failed upload removes what was already stored and rethrows", async () => {
    failUploadAt = 1;
    uploadError = new Error("storage said no");
    const ids = ["aaaaaaaa", "bbbbbbbb"];
    await expect(
      uploadRecordPhotos(USER, [{ base64: "/9j/" }, { base64: "/9j/" }], () => ids.shift() ?? "x"),
    ).rejects.toThrow("storage said no");
    expect(storageCalls.filter((call) => call.op === "remove")).toEqual([
      { op: "remove", args: [[pathOf("aaaaaaaa")]] },
    ]);
  });

  test("remove never hands Storage a path this module did not write", async () => {
    await removeRecordPhotoObjects([pathOf("aaaaaaaa"), `${USER}/clip.md`, "", pathOf("aaaaaaaa")]);
    expect(storageCalls).toEqual([{ op: "remove", args: [[pathOf("aaaaaaaa")]] }]);
    storageCalls.length = 0;
    await removeRecordPhotoObjects([`${USER}/clip.md`]);
    expect(storageCalls).toEqual([]);
  });

  test("signing returns a URL per valid path", async () => {
    const urls = await signRecordPhotoUrls([pathOf("aaaaaaaa"), "../etc"]);
    expect(urls).toEqual({ [pathOf("aaaaaaaa")]: `https://signed.example/${pathOf("aaaaaaaa")}` });
    expect(storageCalls).toEqual([{ op: "sign", args: [[pathOf("aaaaaaaa")], 3600] }]);
  });
});

describe("strict opt-in record photo wipe", () => {
  const photo = (id: string, owner = USER) => ({ path: pathOf(id, owner), mime: "image/jpeg" });
  const rowsOf = (count: number) => Array.from({ length: count }, (_, i) => ({ structured: { photos: [photo(i.toString().padStart(8, "0"))] } }));
  const originalFetch = globalThis.fetch, fetchMock = jest.fn();
  const request = () => ({ userId: USER, accessToken: "captured-owner", signal: new AbortController().signal });
  const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8" } });
  beforeEach(() => { fetchMock.mockReset(); globalThis.fetch = fetchMock as typeof fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; jest.restoreAllMocks(); });

  test("complete original rows retain owner filtering, deduplication and order without mutable path aliases", () => {
    const own = photo("aaaaaaaa"), second = photo("bbbbbbbb");
    const rows = [
      { structured: { photos: [own, photo("cccccccc", OTHER), own, second] } },
      { structured: { photos: [second] } }, { structured: null },
      { structured: { form: "fourw", version: 1, fields: { what: "private" } } },
    ];
    const manifest = prepareRecordPhotoWipe(rows, rows.length, USER);
    expect(manifest).toEqual({ state: "complete", batches: [[own.path, second.path]] });
    own.path = pathOf("dddddddd"); rows.length = 0;
    if (manifest.state !== "complete") throw new Error("unconfirmed fixture");
    expect(manifest.batches).toEqual([[pathOf("aaaaaaaa"), pathOf("bbbbbbbb")]]);
    expect(Object.isFrozen(manifest)).toBe(true); expect(Object.isFrozen(manifest.batches)).toBe(true); expect(Object.isFrozen(manifest.batches[0])).toBe(true);
  });
  test.each([[], [{ structured: null }], [{ structured: {} }], [{ structured: { photos: [] } }], [{ structured: { photos: [photo("aaaaaaaa", OTHER)] } }]].map(rows => ({ rows })))(
    "known-empty needs complete rows $rows", ({ rows }) => {
      expect(prepareRecordPhotoWipe(rows, rows.length, USER)).toEqual({ state: "complete", batches: [] }); expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  test.each([1, 100, 101, 201])("%i photos produce immutable batches of at most 100 without a request", count => {
    const manifest = prepareRecordPhotoWipe(rowsOf(count), count, USER);
    if (manifest.state !== "complete") throw new Error("unconfirmed fixture");
    expect(manifest.batches.map(batch => batch.length)).toEqual(count === 201 ? [100, 100, 1] : count === 101 ? [100, 1] : [count]);
    expect(manifest.batches.flat()).toHaveLength(count); expect(fetchMock).not.toHaveBeenCalled();
  });
  test.each([
    undefined, null, {}, [null], [{}], [{ structured: undefined }], [{ structured: [] }], [{ structured: "text" }],
    [{ structured: { photos: null } }], [{ structured: { photos: "text" } }], [{ structured: { photos: [null] } }],
    [{ structured: { photos: [{ path: pathOf("aaaaaaaa"), mime: "image/png" }] } }],
    [{ structured: { photos: [{ path: `${USER}/clip.md`, mime: "image/jpeg" }] } }],
    [{ structured: { photos: Array.from({ length: 5 }, (_, i) => photo(i.toString().padStart(8, "0"))) } }],
    new Array(1), [{ structured: { photos: new Array(1) } }],
  ].map(rows => ({ rows })))("malformed or incomplete rows $rows cannot become an empty successful plan", ({ rows }) => {
    expect(prepareRecordPhotoWipe(rows, 1, USER)).toEqual({ state: "unconfirmed" }); expect(fetchMock).not.toHaveBeenCalled();
  });
  test.each([-1, NaN, 0.5, Number.MAX_SAFE_INTEGER + 1, 2])("invalid or mismatched row count %s cannot produce a plan", count => {
    expect(prepareRecordPhotoWipe([{ structured: null }], count, USER)).toEqual({ state: "unconfirmed" });
  });

  test("a single original batch dispatches immediately with captured credentials and accepts its exact returned path set", async () => {
    const paths = [pathOf("aaaaaaaa"), pathOf("bbbbbbbb")], captured = request();
    fetchMock.mockResolvedValue(response([{ name: paths[1], bucket_id: "record-photos" }, { name: paths[0] }]));
    const work = removeRecordPhotoBatchCaptured(paths, captured);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://project.example.test/storage/v1/object/record-photos", {
      method: "DELETE", body: JSON.stringify({ prefixes: paths }), signal: captured.signal, redirect: "error",
      headers: { Authorization: "Bearer captured-owner", apikey: "public-anon", "content-type": "application/json", Accept: "application/json" },
    });
    await expect(work).resolves.toEqual({ outcome: "committed", scopeConfirmed: true, observedRemovedCount: 2 });
    expect(storageCalls).toEqual([]);
  });
  test.each([
    { name: "empty", value: [], observed: 0 },
    { name: "short", value: [{ name: pathOf("aaaaaaaa") }], observed: 1 },
    { name: "duplicate", value: [{ name: pathOf("aaaaaaaa") }, { name: pathOf("aaaaaaaa") }], observed: 1 },
    { name: "foreign", value: [{ name: pathOf("aaaaaaaa") }, { name: pathOf("bbbbbbbb", OTHER) }], observed: 1 },
    { name: "other-bucket", value: [{ name: pathOf("aaaaaaaa") }, { name: pathOf("bbbbbbbb"), bucket_id: "raw-clippings" }], observed: 1 },
    { name: "error-property", value: [{ name: pathOf("aaaaaaaa") }, { name: pathOf("bbbbbbbb"), error: "denied" }], observed: 1 },
    { name: "marker", value: [{ name: pathOf("aaaaaaaa") }, { name: pathOf("bbbbbbbb"), is_delete_marker: true }], observed: 1 },
    { name: "versioned", value: [{ name: pathOf("aaaaaaaa") }, { name: pathOf("bbbbbbbb"), is_versioned: true }], observed: 1 },
    { name: "invalid-row", value: [{ name: pathOf("aaaaaaaa") }, null], observed: 1 },
    { name: "extra", value: [{ name: pathOf("aaaaaaaa") }, { name: pathOf("bbbbbbbb") }, { name: pathOf("cccccccc") }], observed: 2 },
    { name: "object", value: { count: 2 }, observed: null }, { name: "null", value: null, observed: null },
  ])("$name Storage response remains unknown with only observed matching paths", async ({ value, observed }) => {
    fetchMock.mockResolvedValue(response(value));
    await expect(removeRecordPhotoBatchCaptured([pathOf("aaaaaaaa"), pathOf("bbbbbbbb")], request()))
      .resolves.toEqual({ outcome: "unknown", observedRemovedCount: observed });
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(storageCalls).toEqual([]);
  });
  test.each(["throw", "reject", "denied", "malformed", "empty-body", "wrong-content-type", "redirect", "unexpected-status"])(
    "%s is unknown with no automatic retry or next batch", async mode => {
      const sensitive = `${USER}/private-native-error`;
      if (mode === "throw") fetchMock.mockImplementation(() => { throw new Error(sensitive); });
      else if (mode === "reject") fetchMock.mockRejectedValue(new Error(sensitive));
      else if (mode === "denied") fetchMock.mockResolvedValue(response({ code: "AccessDenied", message: sensitive }, 403));
      else if (mode === "malformed") fetchMock.mockResolvedValue(new Response("{broken", { headers: { "content-type": "application/json" } }));
      else if (mode === "empty-body") fetchMock.mockResolvedValue(new Response("", { headers: { "content-type": "application/json" } }));
      else if (mode === "wrong-content-type") fetchMock.mockResolvedValue(new Response(JSON.stringify([{ name: pathOf("aaaaaaaa") }]), { headers: { "content-type": "text/plain" } }));
      else if (mode === "redirect") fetchMock.mockResolvedValue(new Response(null, { status: 307 }));
      else fetchMock.mockResolvedValue(response([{ name: pathOf("aaaaaaaa") }], 201));
      const warn = jest.spyOn(console, "warn");
      const result = await removeRecordPhotoBatchCaptured([pathOf("aaaaaaaa")], request());
      expect(result).toEqual({ outcome: "unknown", observedRemovedCount: null }); expect(JSON.stringify(result)).not.toContain(USER);
      expect(fetchMock).toHaveBeenCalledTimes(1); expect(warn).not.toHaveBeenCalled(); expect(storageCalls).toEqual([]);
    },
  );
  test.each([[], [pathOf("aaaaaaaa", OTHER)], [pathOf("aaaaaaaa"), pathOf("aaaaaaaa")], new Array(1), Array.from({ length: 101 }, (_, i) => pathOf(i.toString().padStart(8, "0")))].map(paths => ({ paths })))(
    "invalid batch $paths issues no transport", async ({ paths }) => {
      await expect(removeRecordPhotoBatchCaptured(paths, request())).rejects.toThrow("record_photo_batch_invalid"); expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  test("caller path mutation and abort cannot erase a late original batch result", async () => {
    const paths = [pathOf("aaaaaaaa")], controller = new AbortController(); let resolve!: (value: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>(yes => { resolve = yes; }));
    const work = removeRecordPhotoBatchCaptured(paths, { ...request(), signal: controller.signal });
    paths[0] = pathOf("bbbbbbbb", OTHER); paths.push(pathOf("cccccccc", OTHER)); controller.abort();
    resolve(response([{ name: pathOf("aaaaaaaa") }]));
    await expect(work).resolves.toEqual({ outcome: "committed", scopeConfirmed: true, observedRemovedCount: 1 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ prefixes: [pathOf("aaaaaaaa")] });
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(storageCalls).toEqual([]);
  });
});

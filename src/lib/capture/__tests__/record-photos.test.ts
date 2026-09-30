// Photos attached to a 글 record (2026-09-30). The pure rules are tested
// directly; the Storage calls run against a stubbed Supabase client.

const storageCalls: { op: string; args: unknown[] }[] = [];
let uploadError: unknown = null;
let failUploadAt = -1;

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

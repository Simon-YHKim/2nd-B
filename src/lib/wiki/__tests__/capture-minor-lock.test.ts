// 0223: when the database refuses a comms/location import for a minor account, the body that
// captureFromMarkdown uploaded just before is removed too. Any other insert error leaves the
// upload alone (a concurrent capture of the same content may own the same path).

const deleted: string[] = [];
let insertError: unknown = null;

jest.mock("../storage", () => ({
  rawClippingPath: (userId: string, slug: string) => `${userId}/${slug}.md`,
  uploadRawClipping: jest.fn(() => Promise.resolve({})),
  deleteRawClipping: jest.fn((p: string) => {
    deleted.push(p);
    return Promise.resolve();
  }),
}));

jest.mock("../queries", () => ({
  createSource: jest.fn(() => (insertError ? Promise.reject(insertError) : Promise.resolve({ id: "s1" }))),
  findIngestCandidates: jest.fn(() => Promise.resolve([])),
  recordIngestDrop: jest.fn(() => Promise.resolve()),
  getSource: jest.fn(() => Promise.resolve(null)),
}));

import { captureFromMarkdown, isMinorImportLocked } from "../capture";

const MD = "---\nimport_kind: sms\n---\n# sms 가져오기\n\n- 약속 신호 1건 _(약속 → 캘린더 후보)_";

beforeEach(() => {
  deleted.length = 0;
  insertError = null;
});

describe("captureFromMarkdown when 0223 refuses the row", () => {
  test("removes the uploaded body and passes the refusal on", async () => {
    insertError = { message: "minor_import_locked: comms and location imports are locked for minor accounts", code: "P0001" };
    await expect(captureFromMarkdown({ userId: "u1", rawMd: MD, kindOverride: "self_knowledge" })).rejects.toBe(insertError);
    expect(deleted).toHaveLength(1);
    expect(deleted[0].startsWith("u1/")).toBe(true);
  });

  test("any other insert error keeps the upload", async () => {
    insertError = { message: "duplicate key value violates unique constraint", code: "23505" };
    await expect(captureFromMarkdown({ userId: "u1", rawMd: MD, kindOverride: "self_knowledge" })).rejects.toBe(insertError);
    expect(deleted).toHaveLength(0);
  });

  test("a saved row deletes nothing", async () => {
    await captureFromMarkdown({ userId: "u1", rawMd: MD, kindOverride: "self_knowledge" });
    expect(deleted).toHaveLength(0);
  });
});

describe("isMinorImportLocked", () => {
  test("matches only the named refusal", () => {
    expect(isMinorImportLocked({ message: "minor_import_locked: x" })).toBe(true);
    expect(isMinorImportLocked({ message: "permission denied" })).toBe(false);
    expect(isMinorImportLocked(new Error("minor_import_locked: from Error"))).toBe(true);
    expect(isMinorImportLocked(null)).toBe(false);
    expect(isMinorImportLocked("minor_import_locked")).toBe(false);
  });
});

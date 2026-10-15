// embedTexts mock-mode behaviour: deterministic 768-dim unit vectors, C9 red
// skip, C3 audit. No live model — mock mode only.

const auditWrites: { kind: string }[] = [];
jest.mock("../audit-write-outbox", () => ({
  enqueueAuditWrite: jest.fn((w: { kind: string }) => {
    auditWrites.push(w);
    return Promise.resolve();
  }),
}));

jest.mock("../../env", () => ({
  getEnv: () => ({
    EXPO_PUBLIC_LLM_MODE: "mock",
    EXPO_PUBLIC_USE_VERTEX: false,
  }),
}));

// Classifier: flag any text containing the sentinel as red, else green.
jest.mock("../../safety/classifier", () => ({
  classifyInput: (text: string) => ({
    zone: text.includes("__RED__") ? "red" : "green",
    matched: [],
    categories: [],
  }),
  crisisHotlines: () => [],
}));

import { embedTexts, EMBED_DIM } from "../boundary";
import { enqueueAuditWrite } from "../audit-write-outbox";

beforeEach(() => {
  auditWrites.length = 0;
});

describe("embedTexts (mock)", () => {
  test("returns one 768-dim unit vector per text, deterministically", async () => {
    const r1 = await embedTexts({ userId: "u1", texts: ["hello"], locale: "en" });
    const r2 = await embedTexts({ userId: "u1", texts: ["hello"], locale: "en" });
    expect(r1.vectors).toHaveLength(1);
    expect(r1.vectors[0]).toHaveLength(EMBED_DIM);
    expect(r1.vectors[0]).toEqual(r2.vectors[0]); // deterministic
    const norm = Math.sqrt(r1.vectors[0].reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5); // unit length
  });

  test("different texts → different vectors", async () => {
    const r = await embedTexts({ userId: "u1", texts: ["a", "b"], locale: "en" });
    expect(r.vectors[0]).not.toEqual(r.vectors[1]);
  });

  test("C9: red-zone text is NOT embedded (zero vector) and audited red", async () => {
    const r = await embedTexts({ userId: "u1", texts: ["safe", "__RED__ help"], locale: "en" });
    expect(r.vectors[0].some((x) => x !== 0)).toBe(true);
    expect(r.vectors[1].every((x) => x === 0)).toBe(true);
    expect(r.audit.safetyZone).toBe("red");
  });

  test("C3: writes exactly one ai_audit_log row per batch", async () => {
    await embedTexts({ userId: "u1", texts: ["x", "y"], locale: "en" });
    expect(auditWrites.filter((w) => w.kind === "ai_audit_log")).toHaveLength(1);
  });

  test("empty input → no vectors, no audit write", async () => {
    const r = await embedTexts({ userId: "u1", texts: [], locale: "en" });
    expect(r.vectors).toEqual([]);
    expect(auditWrites).toHaveLength(0);
  });
});

describe("mock embeddings with an optional captured execution", () => {
  function capability() {
    const controller = new AbortController();
    let current = true;
    const session = {
      userId: "u1", epoch: 1, accessToken: "fixture-mock-token", signal: controller.signal,
      assertCurrent: () => { if (!current) throw Object.assign(new Error("stale fixture"), { name: "AbortError" }); },
      abort: () => controller.abort(), release: () => controller.abort(),
    };
    return { session, hold: () => { current = false; } };
  }
  afterEach(() => { jest.mocked(enqueueAuditWrite).mockImplementation(async w => { auditWrites.push(w); }); });

  test("captured mock vectors and audit metadata retain the legacy values", async () => {
    const { session } = capability(); const input = { userId: "u1", texts: ["hello", "__RED__ withheld"], locale: "en" as const };
    const oldPath = await embedTexts(input); const captured = await embedTexts({ ...input, session });
    expect(captured.vectors).toEqual(oldPath.vectors);
    expect(captured.audit).toMatchObject({ modelUsed: oldPath.audit.modelUsed, safetyZone: "red", purpose: "embed_index" });
    expect(enqueueAuditWrite).toHaveBeenLastCalledWith(expect.objectContaining({ ownerUserId: "u1" }), expect.objectContaining({ userId: "u1", accessToken: "fixture-mock-token", signal: session.signal }));
    expect(auditWrites).toHaveLength(2);
  });

  test.each(["owner", "signal"])("%s mismatch prevents even mock audit", async reason => {
    const { session } = capability();
    await expect(embedTexts({ userId: reason === "owner" ? "other" : "u1", texts: ["hello"], locale: "en", session, signal: reason === "signal" ? new AbortController().signal : session.signal })).rejects.toThrow();
    expect(auditWrites).toHaveLength(0);
  });

  test.each(["abort", "hold", "hold-and-reject"])("%s during mock audit cannot return vectors", async reason => {
    const { session, hold } = capability();
    jest.mocked(enqueueAuditWrite).mockImplementationOnce(async w => {
      auditWrites.push(w); if (reason === "abort") session.abort(); else hold();
      if (reason === "hold-and-reject") throw new Error("late audit fixture failure");
    });
    await expect(embedTexts({ userId: "u1", texts: ["hello"], locale: "en", session })).rejects.toMatchObject({ name: "AbortError" });
    expect(auditWrites).toHaveLength(1);
  });

  test("a signal-only legacy caller also drops a late mock response", async () => {
    const controller = new AbortController();
    jest.mocked(enqueueAuditWrite).mockImplementationOnce(async w => { auditWrites.push(w); controller.abort(); });
    await expect(embedTexts({ userId: "u1", texts: ["hello"], locale: "en", signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(auditWrites).toHaveLength(1);
  });
});

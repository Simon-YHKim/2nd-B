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

import { embedTexts, EMBED_DIM } from "../gemini";

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

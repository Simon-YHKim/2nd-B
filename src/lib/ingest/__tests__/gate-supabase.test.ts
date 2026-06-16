// makeSupabaseGateDeps maps queries.ts rows <-> the gate's GateDeps shape.
// queries.ts is mocked so this stays a pure mapping test (no Supabase).

const calls: { fn: string; args: unknown[] }[] = [];
const fixtures: { candidates?: unknown[] } = {};

jest.mock("../../wiki/queries", () => ({
  findIngestCandidates: jest.fn((userId: string, bandKeys: string[], hash: string, signal?: unknown) => {
    calls.push({ fn: "findIngestCandidates", args: [userId, bandKeys, hash, signal] });
    return Promise.resolve(fixtures.candidates ?? []);
  }),
  recordIngestDrop: jest.fn((input: unknown, signal?: unknown) => {
    calls.push({ fn: "recordIngestDrop", args: [input, signal] });
    return Promise.resolve();
  }),
}));

import { makeSupabaseGateDeps } from "../gate-supabase";

beforeEach(() => {
  calls.length = 0;
  delete fixtures.candidates;
});

describe("makeSupabaseGateDeps", () => {
  it("forwards user/bandKeys/hash to findIngestCandidates and maps rows to IngestCandidate", async () => {
    fixtures.candidates = [
      { id: "a", content_hash: "h1", dedup_signature: [1, 2, 3] },
      { id: "b", content_hash: null, dedup_signature: null },
    ];
    const deps = makeSupabaseGateDeps("user-1");
    const got = await deps.findCandidates(["0:aa", "1:bb"], "hash-x");

    expect(calls[0]).toMatchObject({
      fn: "findIngestCandidates",
      args: ["user-1", ["0:aa", "1:bb"], "hash-x", undefined],
    });
    expect(got).toEqual([
      { id: "a", contentHash: "h1", signature: [1, 2, 3] },
      { id: "b", contentHash: "", signature: undefined },
    ]);
  });

  it("maps a drop record (camelCase survivorId -> snake survivor_id) and threads userId", async () => {
    const deps = makeSupabaseGateDeps("user-1");
    await deps.recordDrop({
      content_hash: "h1",
      stage: "near_duplicate",
      reason: "looks alike",
      survivor_id: "surv-1",
    });

    expect(calls[0]).toMatchObject({
      fn: "recordIngestDrop",
      args: [
        { user_id: "user-1", content_hash: "h1", stage: "near_duplicate", reason: "looks alike", survivor_id: "surv-1" },
        undefined,
      ],
    });
  });

  it("threads the abort signal through to the queries", async () => {
    const signal = new AbortController().signal;
    const deps = makeSupabaseGateDeps("user-1", signal);
    await deps.findCandidates([], "h");
    expect(calls[0].args[3]).toBe(signal);
  });
});

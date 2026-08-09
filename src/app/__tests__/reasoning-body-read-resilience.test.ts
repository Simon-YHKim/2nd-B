import { readFileSync } from "node:fs";
import path from "node:path";

// Source-level guard. reasoning.tsx pulls in expo-router, the LLM wrapper and the
// whole deep-space shell, so it cannot be imported in this suite (the repo's
// component-render limitation, RN 0.85 + jest 29). These assertions pin the two
// properties that keep one bad source from costing a user their whole run.
const SRC = readFileSync(
  path.join(__dirname, "..", "reasoning.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

const loadSafeBatchText = (() => {
  const start = SRC.indexOf("async function loadSafeBatchText");
  const next = SRC.indexOf("\nasync function ", start + 1);
  return SRC.slice(start, next === -1 ? undefined : next);
})();

describe("loadSafeBatchText degrades instead of failing the run", () => {
  it("is the function this test thinks it is", () => {
    expect(loadSafeBatchText).toContain("Promise.all");
  });

  it("does not throw when a source row is missing", () => {
    // These reads sit inside a Promise.all: one throw rejected the whole batch,
    // every other item lost its proposals, and the reserved run was refunded.
    // A missing row now degrades that ONE item to title-only.
    expect(loadSafeBatchText).toContain("getSource(input.userId, item.refId).catch(() => null)");
    expect(loadSafeBatchText).toContain("if (!source) return [item.key, item.title] as const;");
    expect(loadSafeBatchText).not.toMatch(/throw new Error\(`No source row/);
  });

  it("does not throw when neither Storage nor the inline fallback has a body", () => {
    expect(loadSafeBatchText).toContain(
      'downloadRawClipping(source.storage_path).catch(() => null)',
    );
    // Ends in "" rather than undefined so the batch text stays a string.
    expect(loadSafeBatchText).toMatch(/\?\?\s*""/);
  });

  it("still prefers the inline fallback, so a pending row costs no doomed round-trip", () => {
    // capture.ts stashes the body inline when the upload fails. Reading Storage
    // first would spend a guaranteed 400 on every such row.
    const fallbackAt = loadSafeBatchText.indexOf("fallback ??");
    const downloadAt = loadSafeBatchText.indexOf("downloadRawClipping");
    expect(fallbackAt).toBeGreaterThan(-1);
    expect(fallbackAt).toBeLessThan(downloadAt);
  });
});

describe("applying a ratified proposal survives a failed promotion", () => {
  const applyFn = (() => {
    const start = SRC.indexOf("async function applyReasoningProposal");
    const next = SRC.indexOf("\nasync function ", start + 1);
    return SRC.slice(start, next === -1 ? undefined : next);
  })();

  it("wraps generateSourcePage so one bad source cannot abort the batch", () => {
    // Proposals apply records-first, so an unguarded throw here landed every
    // record and then killed the loop, leaving the run 'ratified' server-side and
    // re-offered on every mount.
    expect(applyFn).toMatch(/try\s*\{\s*await generateSourcePage/);
  });

  it("keeps the domain tag write ahead of the promotion", () => {
    // The tag is the load-bearing write: it is what brightens the star.
    expect(applyFn.indexOf("updateSourceTags")).toBeLessThan(
      applyFn.indexOf("generateSourcePage"),
    );
  });
});

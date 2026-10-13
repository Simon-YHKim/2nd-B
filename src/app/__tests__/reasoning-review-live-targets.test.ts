import { readFileSync } from "node:fs";
import { join } from "node:path";

// Simon 2026-10-13 (Q-261013-35): a deleted record's proposal must not come back in review, and a
// proposal no longer stores the record's opening text. These read the screen's source because the
// screen cannot be rendered in jest; the lookup rule itself is tested in proposal-targets.test.ts.

const source = readFileSync(join(__dirname, "..", "reasoning.tsx"), "utf8");

function body(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("reasoning review: stored proposals", () => {
  it("writes no title into the stored payload", () => {
    const toPayload = body("function proposalToPayload(", "function proposalFromServerRow(");
    expect(toPayload).toContain("refId: proposal.refId");
    expect(toPayload).toContain("domain: proposal.domain");
    expect(toPayload).not.toMatch(/\btitle\s*:/);
    expect(toPayload).not.toMatch(/\bbody\s*:/);
  });

  it("does not read a title back from a stored row", () => {
    const fromRow = body("function proposalFromServerRow(", "interface ReasoningRunInput");
    expect(fromRow).not.toContain("p.title");
    expect(fromRow).toMatch(/title:\s*""/);
  });

  it("restores review only through the live-target check, with one lookup per kind", () => {
    const restore = body("const rows = await listPendingProposals(userId);", "setProposals(pending);");
    expect(restore).toContain("await resolveLiveProposals(");
    expect(restore).toMatch(/record:\s*async \(refId\) => \{\s*const row = await getRecordById\(userId, refId\);/);
    expect(restore).toMatch(/source:\s*async \(refId\) => \{\s*const source = await getSource\(userId, refId\);/);
    // Nothing between the server read and setProposals shows the stored list unchecked.
    expect(restore).not.toMatch(/setProposals\(stored\)/);
  });

  it("has a single place that restores proposals from the server", () => {
    expect(source.split("listPendingProposals(userId)").length - 1).toBe(1);
    expect(source.split("proposalFromServerRow").length - 1).toBe(2);
  });
});

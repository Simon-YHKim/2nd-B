import { readFileSync } from "node:fs";
import { join } from "node:path";

// Simon 2026-10-13 (Q-261013-35): a deleted record's proposal must not come back in review, and a
// proposal no longer stores the record's opening text. These read the screen's source because the
// screen cannot be rendered in jest; the rule itself (which table, what is dismissed, what is held
// back) is tested in src/lib/reasoning/__tests__/proposal-targets.test.ts.

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

  it("has one preparation step: a lookup per kind, and a dismiss for what is gone", () => {
    const ready = body("const readyForReview = useCallback(", "const runningRef = useRef(false);");
    expect(ready).toContain("return prepareProposalsForReview(");
    expect(ready).toMatch(/record:\s*async \(refId\) => \{\s*const row = await getRecordById\(userId, refId\);/);
    expect(ready).toMatch(/source:\s*async \(refId\) => \{\s*const source = await getSource\(userId, refId\);/);
    // Dismiss only: the ratify list is empty, so nothing the user did not choose is accepted.
    expect(ready).toContain("(runId, ordinals) => ratifyProposals(userId, runId, [], ordinals)");
    expect(source.split("prepareProposalsForReview(").length - 1).toBe(1);
  });

  it("shows proposals only after that step, on every path that puts them on screen", () => {
    const shown = [...source.matchAll(/setProposals\(([^)]*)\)/g)].map((match) => match[1]);
    // Clearing the list needs no check. Everything else is the checked list.
    expect(shown.sort()).toEqual(["[]", "[]", "[]", "live", "nextProposals", "ready.live"]);

    const restore = body("const rows = await listPendingProposals(userId);", "setProposals(live);");
    expect(restore).toContain("const ready = await readyForReview(stored);");
    expect(restore).toContain("const live = ready.live;");

    const completed = body("const produced = await queued;", "setProposals(nextProposals);");
    expect(completed).toContain("const ready = await readyForReview(produced);");
    expect(completed).toContain("const nextProposals = ready.live;");

    const failedApply = body("} catch (error) {\n      // What goes back on screen is read again", "setErrorText(t(\"ds.reasoningScreen.applyFailed\"));");
    expect(failedApply).toContain("const ready = await readyForReview(pending);");
    expect(failedApply).toContain("setProposals(ready.live);");
  });

  it("tells the user when a target could not be read, instead of showing the proposal", () => {
    const restore = body("const ready = await readyForReview(stored);", "setProposals(live);");
    expect(restore).toMatch(/if \(ready\.unreadable > 0\) \{\s*setErrorText\(i18n\.t\("ds\.reasoningScreen\.loadFailed"/);
    const completed = body("const ready = await readyForReview(produced);", "setProposals(nextProposals);");
    expect(completed).toContain('if (ready.unreadable > 0) setErrorText(t("ds.reasoningScreen.loadFailed"));');
  });

  it("has a single place that restores proposals from the server", () => {
    expect(source.split("listPendingProposals(userId)").length - 1).toBe(1);
    expect(source.split("proposalFromServerRow").length - 1).toBe(2);
  });
});

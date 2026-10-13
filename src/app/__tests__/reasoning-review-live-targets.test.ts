import { readFileSync } from "node:fs";
import { join } from "node:path";

// Simon 2026-10-13 (Q-261013-35): a deleted record's proposal must not come back in review, and a
// proposal no longer stores the record's opening text. These read the screen's source because the
// screen cannot be rendered in jest; the rules themselves are tested where they live:
// which table, what is dismissed, what is held back in src/lib/reasoning/__tests__/proposal-targets.test.ts,
// and who a late result belongs to in src/lib/reasoning/__tests__/review-ownership.test.ts.

// Line endings differ between checkouts; the markers below are written with "\n".
const source = readFileSync(join(__dirname, "..", "reasoning.tsx"), "utf8").replace(/\r\n/g, "\n");

function body(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function count(needle: string): number {
  return source.split(needle).length - 1;
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
    const ready = body("const readyForReview = useCallback(", "const emittedRunsRef = useRef");
    expect(ready).toContain("return prepareProposalsForReview(");
    expect(ready).toMatch(/record:\s*async \(refId\) => \{\s*const row = await getRecordById\(userId, refId\);/);
    expect(ready).toMatch(/source:\s*async \(refId\) => \{\s*const source = await getSource\(userId, refId\);/);
    // Dismiss only: the ratify list is empty, so nothing the user did not choose is accepted.
    expect(ready).toContain("(runId, ordinals) => ratifyProposals(userId, runId, [], ordinals)");
    expect(count("prepareProposalsForReview(")).toBe(1);
  });

  it("shows proposals only after that step, on every path that puts them on screen", () => {
    const shown = [...source.matchAll(/setProposals\(([^)]*)\)/g)].map((match) => match[1]);
    // Clearing the list needs no check. Everything else is the checked list.
    expect(shown.sort()).toEqual(["[]", "[]", "[]", "[]", "live", "nextProposals", "ready.live"]);

    const restore = body("const rows = await listPendingProposals(userId);", "setProposals(live);");
    expect(restore).toContain("const ready = await readyForReview(stored);");
    expect(restore).toContain("const live = ready.live;");

    const completed = body("const produced = await queued;", "setProposals(nextProposals);");
    expect(completed).toMatch(/const ready = await settleRunForReview\(\s*produced,\s*readyForReview,/);
    expect(completed).toContain("const nextProposals = ready.live;");

    const failedApply = body("} catch (error) {\n      // What goes back on screen is read again", "setErrorText(t(\"ds.reasoningScreen.applyFailed\"));");
    expect(failedApply).toContain("const ready = await readyForReview(pending);");
    expect(failedApply).toContain("setProposals(ready.live);");
  });

  it("tells the user when a target could not be read, instead of showing the proposal", () => {
    const restore = body("const ready = await readyForReview(stored);", "setProposals(live);");
    expect(restore).toMatch(/if \(ready\.unreadable > 0\) \{\s*setErrorText\(i18n\.t\("ds\.reasoningScreen\.loadFailed"/);
    const completed = body("const ready = await settleRunForReview(", "setProposals(nextProposals);");
    expect(completed).toContain('if (ready.unreadable > 0) setErrorText(t("ds.reasoningScreen.loadFailed"));');
  });

  it("has a single place that restores proposals from the server", () => {
    expect(count("listPendingProposals(userId)")).toBe(1);
    expect(count("proposalFromServerRow")).toBe(2);
  });
});

// Review rounds two to four: reads take time, and the screen can change hands meanwhile
// (cancelled, a newer run, another account). One object answers who owns what.
describe("reasoning review: late results ask who owns the screen", () => {
  it("keeps the account and the run slot in one ownership object, with no refs of its own", () => {
    expect(source).toContain("const [ownership] = useState(() => createReviewOwnership(userId));");
    for (const gone of ["userIdRef", "abortRef", "runningRef"]) expect(source).not.toContain(gone);
    expect(count("createReviewOwnership(")).toBe(1);
  });

  it("moves the account and clears that account's screen in a layout effect, in one step", () => {
    const layout = body("useLayoutEffect(() => {", "}, [ownership, userId]);");
    expect(layout).toMatch(/^useLayoutEffect\(\(\) => \{\s*if \(!ownership\.showAccount\(userId\)\) return;/);
    for (const reset of [
      "setItems([]);",
      "setListLoading(true);",
      'setPhase("idle");',
      "setApplying(false);",
      "setProposals([]);",
      "setSelected(new Set());",
      "setRunState({});",
      "setCompletedCount(0);",
      "setErrorText(null);",
      "setCrisisVisible(false);",
      "setLimitSheetVisible(false);",
      "setAutoIntroVisible(false);",
      "setUsed(0);",
      "setRewardCredits(0);",
      "setUsageKnown(false);",
    ]) {
      expect(layout).toContain(reset);
    }
    // A run still going for the earlier account is cancelled in the same step, and only its own
    // task leaves the dock.
    expect(layout).toMatch(/const cancelled = ownership\.cancel\(\);\s*if \(cancelled\) dismissTaskById\(ownership\.taskOf\(cancelled\)\);/);
    // The only place the account moves, and it is not a passive effect.
    expect(count("ownership.showAccount(")).toBe(1);
    expect(count("useLayoutEffect(() => {")).toBe(1);
  });

  it("keeps a finished run in its slot until its targets are read, and drops a result that is no longer the screen's", () => {
    const completed = body("const produced = await queued;", "setProposals(nextProposals);");
    expect(completed).toContain("() => ownership.owns(controller, userId),");
    const settle = completed.indexOf("await settleRunForReview(");
    // Asked twice: inside settleRunForReview, and again here one promise step later.
    const stale = completed.indexOf("if (ready === null || !ownership.owns(controller, userId)) {");
    const release = completed.lastIndexOf("ownership.release(controller);");
    expect(settle).toBeGreaterThan(-1);
    expect(stale).toBeGreaterThan(settle);
    expect(release).toBeGreaterThan(stale);
    // Nothing releases the slot between the run finishing and the read, so Cancel still reaches it.
    expect(completed.slice(0, settle)).not.toContain("ownership.release(");
    expect(completed.slice(0, settle)).not.toContain("ownership.cancel(");
    // A stale result gives back only its own slot and returns before any state is written.
    const staleBranch = completed.slice(stale, completed.indexOf("const nextProposals = ready.live;"));
    expect(staleBranch).toMatch(/ownership\.release\(controller\);\s*return;/);
    expect(staleBranch.slice(0, staleBranch.indexOf("return;"))).not.toMatch(/set[A-Z]\w*\(|dismiss\w*\(/);
    // From the second check to the first write nothing is awaited.
    expect(completed.slice(stale)).not.toMatch(/await/);
  });

  it("a failed run asks before it touches the slot, the global task or the screen", () => {
    const failed = body("} catch (error) {\n          // A cancelled run can reject after a newer run has taken the slot", "      },\n    });\n    ownership.bindTask(controller, taskId);");
    expect(failed).toContain("ownedSlot: ownership.release(controller),");
    expect(failed).toContain("onScreen: onScreen(),");
    expect(failed).toContain("const onScreen = () => mountedRef.current && ownership.shows(userId);");
    const nothing = failed.indexOf('if (action.act === "nothing") return;');
    const defer = failed.indexOf('if (action.act === "defer") {');
    expect(nothing).toBeGreaterThan(-1);
    expect(defer).toBeGreaterThan(nothing);
    // Up to the point where the action says "show", nothing global and nothing on screen changes.
    const ownTask = "dismissTaskById(ownership.taskOf(controller));";
    const beforeShow = failed.slice(0, failed.indexOf(ownTask));
    expect(failed.indexOf(ownTask)).toBeGreaterThan(defer);
    expect(beforeShow).not.toMatch(/setPhase\(|setErrorText\(|setLimitSheetVisible\(|setCrisisVisible\(/);
    // A failure kept for later is kept under the account the run was started for.
    expect(failed).toContain("if (action.error) deferredRunErrors.set(userId, action.error);");
    // The quota read in the limit branch takes time, so the screen is asked again after it.
    // The epoch is read before the wait and compared after it ("running" cannot tell a run that
    // began and already ended from no run at all).
    expect(failed).toMatch(/const before = ownership\.epoch;\s*await refreshUsage\(\)\.catch\(\(\) => undefined\);[\s\S]*?if \(!onScreen\(\) \|\| ownership\.epoch !== before\) return;\s*setPhase\("idle"\);\s*setLimitSheetVisible\(true\);/);
    expect(count("runFailureAction({")).toBe(1);
  });

  it("an old run's progress callbacks cannot write into the screen", () => {
    const start = body("const startRun = useCallback(() => {", "startTask({");
    expect(start).toContain("ownership.begin(controller);");
    expect(start).toMatch(/onItemStart: \(key\) => \{\s*if \(!mountedRef\.current \|\| !ownership\.owns\(controller, userId\)\) return;/);
    expect(start).toMatch(/onItemDone: \(key, completed, domain\) => \{\s*if \(!mountedRef\.current \|\| !ownership\.owns\(controller, userId\)\) return;/);
  });

  it("cancel goes through the same object", () => {
    const cancel = body("const cancelRun = useCallback(() => {", "}, [ownership]);");
    expect(cancel).toMatch(/^const cancelRun = useCallback\(\(\) => \{\s*const cancelled = ownership\.cancel\(\);\s*if \(cancelled\) dismissTaskById\(ownership\.taskOf\(cancelled\)\);/);
  });

  it("clears the dock only for its own task, or for a finished one", () => {
    // No call clears whatever happens to be in the dock.
    expect(source.replace(/dismissTaskById\(/g, "").replace(/dismissFinishedTask\(/g, "")).not.toContain("dismissTask(");
    expect(source).toContain('import { dismissFinishedTask, dismissTaskById, sendToBackground, startTask, useTaskStatus } from "@/lib/tasks/store";');
    // A kept failure being shown, and a finished apply: both clear a finished toast only.
    expect(count("dismissFinishedTask();")).toBe(2);
    const start = body("const startRun = useCallback(() => {", "const applySelectedProposals = useCallback(");
    expect(start).toContain("const taskId = startTask({");
    expect(start).toContain("ownership.bindTask(controller, taskId);");
    // A start the dock refused never calls run(): the batch is stopped and the slot given back.
    expect(start).toMatch(/if \(taskId === 0\) \{[\s\S]*?void queued\.catch\(\(\) => undefined\);\s*ownership\.cancel\(\);/);
  });

  it("does not start a run until a usage read for the account on screen has landed", () => {
    const start = body("const startRun = useCallback(() => {", "const controller = new AbortController();");
    expect(start).toContain("if (depleted || !usageKnown) return;");
    expect(count("setUsageKnown(true);")).toBe(2);
    expect(source).toContain('(phase !== "running" && phase !== "done" && !usageKnown) ||');
  });

  it("every read that was started for an account asks whether that account is still on screen", () => {
    const usage = body("const refreshUsage = useCallback(async () => {", "}, [ownership, userId]);");
    expect(usage).toContain("if (!mountedRef.current || !ownership.shows(userId)) return;");

    const restore = body("const ready = await readyForReview(stored);", "setProposals(live);");
    expect(restore).toContain("if (cancelled || !ownership.shows(userId)) return;");

    const list = body("void Promise.all([listRecentRecords(userId, 60)", "}, [i18n, loading, ownership, uiLng, userId]);");
    expect(list).toMatch(/\.then\(\(\[records, sources, usage\]\) => \{\s*if \(cancelled \|\| !ownership\.shows\(userId\)\) return;/);
    expect(list).toContain("if (!cancelled && ownership.shows(userId)) setListLoading(false);");
  });

  it("apply writes to the screen only if it is still this account's, on the finished path and the failed path", () => {
    const apply = body("const applySelectedProposals = useCallback(async () => {", "}, [applying, ownership, phase, proposals, readyForReview, selected, t, userId]);");
    expect(apply.split("stale = !mountedRef.current || !ownership.shows(userId);").length - 1).toBe(2);

    const finished = apply.slice(apply.indexOf("pending = pending.filter((candidate) => candidate.key !== proposal.key);"), apply.indexOf("} catch (error) {"));
    const asked = finished.indexOf("stale = !mountedRef.current || !ownership.shows(userId);");
    expect(asked).toBeGreaterThan(-1);
    // Nothing is written before the question, and everything after it sits behind the answer.
    expect(finished.slice(0, asked)).not.toMatch(/set[A-Z]\w*\(|dismiss\w*\(/);
    expect(finished.slice(asked)).toContain("dismissFinishedTask();");
    expect(finished.slice(asked)).toMatch(/if \(!stale\) \{\s*setItems\(/);

    const failedApply = apply.slice(apply.indexOf("} catch (error) {"), apply.indexOf("} finally {"));
    expect(failedApply).toMatch(/if \(!stale\) \{\s*setProposals\(ready\.live\);/);
    expect(apply).toContain("if (!stale) setApplying(false);");
  });
});

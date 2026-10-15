import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";
import type { ReactElement } from "react";
import { hookHarness } from "../../nav/__tests__/hook-harness";
import { __resetAccountEpochForTests, beginAccountOwnerTransition, clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../../auth/account-epoch";
import { checkUsage } from "../../progression/entitlements";

const mockRecords = jest.fn();
const mockCount = jest.fn();
jest.mock("../../records/create", () => ({
  listRecentRecords: (...args: unknown[]) => mockRecords(...args),
  countRecordsByKind: (...args: unknown[]) => mockCount(...args),
}));
jest.mock("react-native", () => ({ View: "View" }));
jest.mock("@/components/ui/Button", () => ({ Button: "Button" }));
jest.mock("@/components/ui/Text", () => ({ Text: "Text" }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

type Module = typeof import("../use-capture-records");
let product: Module;
let harness: ReturnType<typeof hookHarness>;
let owner: string | null;
let authLoading: boolean;
const spies: jest.SpyInstance[] = [];
beforeAll(() => {
  const react = jest.requireActual<typeof import("react")>("react");
  for (const name of ["useState", "useRef", "useMemo", "useCallback", "useEffect", "useSyncExternalStore"] as const) {
    spies.push(jest.spyOn(react, name).mockImplementation(((...args: unknown[]) =>
      (harness.hooks[name] as (...args: unknown[]) => unknown)(...args)) as never));
  }
  (globalThis as { React?: unknown }).React = react;
  product = jest.requireActual<Module>("../use-capture-records");
});
afterAll(() => { spies.forEach((spy) => spy.mockRestore()); delete (globalThis as { React?: unknown }).React; });
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); mockRecords.mockReset(); mockCount.mockReset();
  __resetAccountEpochForTests(); noteResolvedOwner("owner-a"); clearAccountTransition(currentAccountEpoch());
  owner = "owner-a"; authLoading = false; harness = hookHarness();
  mockRecords.mockImplementation((id: string) => Promise.resolve([{ id: `${id}-record`, topic: "kept title", body: "saved text", created_at: "2026-10-15T00:00:00Z" }]));
  mockCount.mockResolvedValue(1);
});
afterEach(() => { harness.unmount(); jest.clearAllTimers(); jest.useRealTimers(); });
const render = () => harness.render(() => product.useCaptureRecords(owner, authLoading));
async function settle() { let read = render(); for (let i = 0; i < 12; i++) { await Promise.resolve(); read = render(); } return read; }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
type Node = ReactElement<{ children?: unknown; label?: string; onPress?: () => void }>;
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Node; return [node, ...nodes(node.props.children)];
}
const notice = (read: ReturnType<Module["useCaptureRecords"]>) => product.CaptureRecordReadNotice({ read });

test.each(["records", "count"])("%s failure is unknown, with a read-only retry, never empty/zero", async (kind) => {
  (kind === "records" ? mockRecords : mockCount).mockRejectedValueOnce(new Error("server read failed"));
  const failed = await settle();
  expect(failed).toMatchObject({ status: "failed", errorKey: "common:errors.unknown" });
  if (kind === "records") {
    expect(failed.rows).toEqual([]); expect(failed.rowsStatus).toBe("failed");
    expect(failed.journalCount).toBe(1); expect(failed.isCountCurrent()).toBe(true);
  } else {
    expect(failed.rows[0].id).toBe("owner-a-record"); expect(failed.rowsStatus).toBe("ready");
    expect(failed.journalCount).toBeNull(); expect(failed.isCountCurrent()).toBe(false);
  }
  const retry = nodes(notice(failed)).find((node) => node.props.label === "actions.retry")!;
  expect(retry).toBeDefined(); retry.props.onPress!();
  const ready = await settle(); expect(ready.status).toBe("ready"); expect(ready.journalCount).toBe(1);
  expect(ready.rows[0].id).toBe("owner-a-record"); expect(notice(ready)).toBeNull();
  expect(mockRecords).toHaveBeenCalledTimes(2); expect(mockCount).toHaveBeenCalledTimes(2);
  expect(mockRecords).toHaveBeenLastCalledWith("owner-a");
  expect(mockCount).toHaveBeenLastCalledWith("owner-a", "journal", { requireCount: true });
});

test.each(["records", "count"])("%s stall has its own 10s deadline and ignores late success after retry", async (kind) => {
  const stalled = deferred<unknown>(); (kind === "records" ? mockRecords : mockCount).mockReturnValueOnce(stalled.promise);
  let read = await settle(); expect(read.status).toBe("loading");
  expect(nodes(notice(read)).find((node) => node.type === "Text")!.props.children).toBe("...");
  jest.advanceTimersByTime(9_999); expect((await settle()).status).toBe("loading");
  jest.advanceTimersByTime(1); read = await settle();
  expect(read).toMatchObject({ status: "failed", errorKey: "common:errors.network" });
  expect(read.journalCount).toBe(kind === "count" ? null : 1);
  expect(read.rowsStatus).toBe(kind === "records" ? "failed" : "ready");
  read.refresh(); read = await settle(); expect(read.status).toBe("ready");
  stalled.resolve(kind === "records" ? [] : 99);
  read = await settle(); expect(read.journalCount).toBe(1); expect(read.rows[0].id).toBe("owner-a-record");
});

test("one read rejection does not wait on the other stalled read", async () => {
  mockRecords.mockRejectedValue(new Error("server failure")); mockCount.mockReturnValue(new Promise(() => {}));
  expect((await settle()).status).toBe("failed"); expect(jest.getTimerCount()).toBe(1);
  jest.advanceTimersByTime(10_000); expect((await settle()).status).toBe("failed");
  expect(jest.getTimerCount()).toBe(0);
});

test("a genuinely empty successful result is ready with zero journal uses", async () => {
  mockRecords.mockResolvedValue([]); mockCount.mockResolvedValue(0);
  const read = await settle(); expect(read).toMatchObject({ status: "ready", rows: [], journalCount: 0 });
  expect(read.isCountCurrent()).toBe(true); expect(notice(read)).toBeNull();
});

test("post-save refresh hides stale data and synchronously invalidates a previous ready submit", async () => {
  const ready = await settle(); const stalled = deferred<number>(); mockCount.mockReturnValueOnce(stalled.promise);
  ready.refresh(); expect(ready.isCountCurrent()).toBe(false);
  const waiting = await settle(); expect(waiting).toMatchObject({ status: "loading", rowsStatus: "ready", journalCount: null });
  stalled.reject(new Error("refresh failed")); expect((await settle()).status).toBe("failed");
});

test("a newer refresh owns the result even when an older read finishes later", async () => {
  const old = deferred<number>(); mockCount.mockReturnValueOnce(old.promise);
  const waiting = await settle(); waiting.refresh(); mockCount.mockResolvedValue(2);
  expect((await settle()).journalCount).toBe(2); old.resolve(0);
  expect((await settle()).journalCount).toBe(2);
});

test("owner hold/ABA rejects old success and old refresh callbacks", async () => {
  const old = deferred<number>(); mockCount.mockReturnValueOnce(old.promise);
  const stale = await settle(); beginAccountOwnerTransition(null);
  expect(render().rows).toEqual([]); stale.refresh(); expect(mockCount).toHaveBeenCalledTimes(1);
  noteResolvedOwner(null); noteResolvedOwner("owner-a"); clearAccountTransition(currentAccountEpoch());
  const fresh = await settle(); expect(fresh.journalCount).toBe(1);
  const calls = mockCount.mock.calls.length; stale.refresh(); old.resolve(99);
  expect((await settle()).journalCount).toBe(1); expect(mockCount).toHaveBeenCalledTimes(calls);
});

test("A result and retry cannot publish into B", async () => {
  const old = deferred<unknown[]>(); mockRecords.mockReturnValueOnce(old.promise);
  const stale = await settle(); beginAccountOwnerTransition("owner-b"); owner = "owner-b";
  expect(render().rows).toEqual([]); noteResolvedOwner("owner-b"); clearAccountTransition(currentAccountEpoch());
  let read = await settle(); expect(read.rows[0].id).toBe("owner-b-record");
  stale.refresh(); old.resolve([{ id: "private-a" }]); read = await settle();
  expect(read.rows[0].id).toBe("owner-b-record");
});

test("unmount blocks a late read and refresh", async () => {
  const old = deferred<number>(); mockCount.mockReturnValueOnce(old.promise);
  const stale = await settle(); harness.unmount(); stale.refresh(); old.resolve(99);
  for (let i = 0; i < 10; i++) await Promise.resolve();
  expect(stale.isCountCurrent()).toBe(false); expect(mockCount).toHaveBeenCalledTimes(1); expect(harness.dirty).toBe(false); expect(jest.getTimerCount()).toBe(0);
});

test("signed out and unresolved auth do not start a read", async () => {
  authLoading = true; await settle(); expect(mockRecords).not.toHaveBeenCalled();
  authLoading = false; owner = null; await settle(); expect(mockRecords).not.toHaveBeenCalled();
});

test("an owner hold before the queued reads start sends no old-owner query", async () => {
  render(); beginAccountOwnerTransition(null);
  await settle(); expect(mockRecords).not.toHaveBeenCalled(); expect(mockCount).not.toHaveBeenCalled();
});

// Execute exact product declarations; no copied predicate/algorithm stands in for them.
const screenText = readFileSync(join(process.cwd(), "src/app/capture.tsx"), "utf8");
const screenAst = ts.createSourceFile("capture.tsx", screenText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function findNode(root: ts.Node, match: (node: ts.Node) => boolean): ts.Node {
  let found: ts.Node | undefined;
  const visit = (node: ts.Node) => { if (!found && match(node)) found = node; else if (!found) node.forEachChild(visit); };
  visit(root); if (!found) throw new Error("Product declaration missing"); return found;
}
function evaluate<T>(code: string, result: string, bindings: Record<string, unknown>): T {
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function(...Object.keys(bindings), `${js}\nreturn ${result};`)(...Object.values(bindings)) as T;
}
function screenValue(name: string, bindings: Record<string, unknown>) {
  const node = findNode(screenAst, (n) => ts.isVariableDeclaration(n) && n.name.getText(screenAst) === name) as ts.VariableDeclaration;
  return evaluate(`const result = ${node.initializer!.getText(screenAst)};`, "result", bindings);
}
function journalSubmit(read: ReturnType<Module["useCaptureRecords"]>, draft: { body: string; topic: string; tags: string[] }, commit = false) {
  const claim = jest.fn(() => commit ? { ticket: "synthetic-ticket" } : null);
  const create = jest.fn().mockResolvedValue({ id: "saved-record", tags: draft.tags });
  const enqueue = jest.fn(); const reset = jest.fn(); const refreshProgression = jest.fn();
  const noops = Object.fromEntries(["markCaptureSubmissionSaved", "completeCaptureSubmission", "requestDurableSubmittedDraftAck", "playSaveCue", "setSavedTitle", "setSavedKind", "setSavedMode", "setSavedSourceId", "setSavedDomain", "setSavedFollowup", "setSavedPending", "releaseSubmittedDraftCleanup", "finishSubmit"].map((key) => [key, jest.fn()]));
  const node = findNode(screenAst, (n) => ts.isFunctionDeclaration(n) && n.name?.text === "handleJournalSubmit");
  const journalUsage = screenValue("journalUsage", { recentRead: read, progression: { tier: "free" }, checkUsage });
  const journalUsageKnown = screenValue("journalUsageKnown", { journalUsage, recentRead: read });
  const submit = evaluate<() => Promise<void>>(node.getText(screenAst), "handleJournalSubmit", {
    userId: "owner-a", body: draft.body, journalUsage, journalUsageKnown, recentRead: read,
    ...noops, storageMutationEpochRef: { current: { journal: 4 } }, draftFromFields: () => draft, claimSubmittedDraft: claim, createRecord: create,
    beginSubmit: () => true, locale: "ko", isMinor: false, askAdvisor: false, advisorUnlocked: false, progression: { tier: "free", refresh: refreshProgression },
    clearAcceptedSubmittedDraft: async () => "cleared", enqueueAutoReasoningRecord: enqueue, captureOwnsFocusedSession: () => true,
    activeModeRef: { current: "journal" }, reset, companion: { fire: jest.fn() }, saveCueAllowed: () => false, isRecordingAudioMode: () => false,
    t: (key: string) => key, filedDomainOf: () => "collect", refreshRecentRecords: read.refresh,
  });
  return { submit, claim, create, enqueue, reset, refreshProgression };
}

test("a count failure keeps the actual unlimited journal entitlement and draft available", async () => {
  const draft = { body: "unfinished user text", topic: "kept topic", tags: ["kept-tag"] };
  mockCount.mockRejectedValueOnce(new Error("count failed")); const failed = await settle();
  const operation = journalSubmit(failed, draft); await operation.submit();
  expect(operation.claim).toHaveBeenCalledWith({ bucket: "storage", mode: "journal", expected: draft }, 4);
  expect(draft).toEqual({ body: "unfinished user text", topic: "kept topic", tags: ["kept-tag"] });
  beginAccountOwnerTransition(null); await operation.submit(); expect(operation.claim).toHaveBeenCalledTimes(1);
});

test("actual submit expression preserves current unlimited local writes despite unknown count", async () => {
  mockCount.mockRejectedValue(new Error("count failed")); const read = await settle();
  const journalUsage = screenValue("journalUsage", { recentRead: read, progression: { tier: "free" }, checkUsage });
  const journalUsageKnown = screenValue("journalUsageKnown", { journalUsage, recentRead: read });
  expect(journalUsage).toMatchObject({ allowed: true, unlimited: true });
  const bindings = { userId: "owner-a", submitting: false, extracting: false, proposing: false, voicePhase: "idle", journalGate: { unlocked: true }, journalUsage, journalUsageKnown, body: "draft", hasOcrDraft: true, ocrReviewApproved: true, pickedFile: null, fourWHasContent: () => true, fourw: {} };
  for (const mode of ["journal", "memo", "linkclip", "ocr", "voice", "todo", "fourw", "file"]) expect(screenValue("canSubmit", { ...bindings, mode })).toBe(true);
  const editor = findNode(screenAst, (n) => ts.isConditionalExpression(n) && n.condition.getText(screenAst).includes("!journalUsageKnown || journalUsage.allowed")) as ts.ConditionalExpression;
  expect(evaluate(`const result = ${editor.condition.getText(screenAst)};`, "result", { ...bindings, mode: "journal", progression: { loading: false } })).toBe(true);
});

test("the actual recent-list render remains visible when only the count failed", async () => {
  mockCount.mockRejectedValueOnce(new Error("count unavailable"));
  let read = await settle();
  const condition = findNode(screenAst, (n) => ts.isConditionalExpression(n) && n.condition.getText(screenAst).includes('recentRead.rowsStatus === "ready" && recentRows.length > 0')) as ts.ConditionalExpression;
  const visible = (current: typeof read) => evaluate(`const result = ${condition.condition.getText(screenAst)};`, "result", { recentRead: current, recentRows: current.rows });
  expect(read.status).toBe("failed"); expect(visible(read)).toBe(true);
  mockRecords.mockRejectedValueOnce(new Error("list unavailable")); read.refresh(); read = await settle();
  expect(visible(read)).toBe(false); expect(read.journalCount).toBe(1);
});

test("a failed recent list does not block the actual journal guard when its quota is known", async () => {
  mockRecords.mockRejectedValue(new Error("list unavailable"));
  const read = await settle(); const operation = journalSubmit(read, { body: "draft", topic: "", tags: [] });
  await operation.submit(); expect(operation.claim).toHaveBeenCalledTimes(1);
  expect(read.rowsStatus).toBe("failed"); expect(read.journalCount).toBe(1);
});

test("read-only retry does not save; the actual journal action saves once with its unchanged payload", async () => {
  const draft = { body: "  keep this journal  ", topic: "title", tags: ["journal-tag"] };
  mockCount.mockRejectedValueOnce(new Error("count failed")); const failed = await settle();
  const inactive = journalSubmit(failed, draft, true);
  failed.refresh(); const ready = await settle();
  expect(inactive.create).not.toHaveBeenCalled(); expect(inactive.enqueue).not.toHaveBeenCalled(); expect(inactive.reset).not.toHaveBeenCalled();
  const active = journalSubmit(ready, draft, true); await active.submit();
  expect(active.create).toHaveBeenCalledTimes(1);
  expect(active.create).toHaveBeenCalledWith({ userId: "owner-a", locale: "ko", minor: false, kind: "journal", body: "keep this journal", topic: "title", tags: draft.tags, domainIntent: undefined, conclusion: undefined, withFollowup: false, tier: "free" });
  expect(active.enqueue).toHaveBeenCalledTimes(1); expect(active.reset).toHaveBeenCalledTimes(1); expect(active.refreshProgression).toHaveBeenCalledTimes(1);
  expect((await settle()).status).toBe("ready"); expect(mockRecords).toHaveBeenCalledTimes(3); expect(mockCount).toHaveBeenCalledTimes(3);
});

test("the actual local-core policy remains unlimited after more than two journal entries", async () => {
  mockCount.mockResolvedValue(42); const read = await settle();
  const operation = journalSubmit(read, { body: "draft", topic: "", tags: [] });
  await operation.submit(); expect(operation.claim).toHaveBeenCalledTimes(1);
  expect(checkUsage("journal", "free", 42)).toMatchObject({ allowed: true, unlimited: true });
});

test("actual count query throws on missing count in strict screen reads and preserves legacy default", async () => {
  const source = readFileSync(join(process.cwd(), "src/lib/records/create.ts"), "utf8");
  const ast = ts.createSourceFile("create.ts", source, ts.ScriptTarget.Latest, true);
  const node = findNode(ast, (n) => ts.isFunctionDeclaration(n) && n.name?.text === "countRecordsByKind");
  const trace: unknown[][] = []; let response: { count?: unknown; error: unknown } = { count: null, error: null };
  const query = { select: (...args: unknown[]) => { trace.push(["select", ...args]); return query; }, eq: (...args: unknown[]) => { trace.push(["eq", ...args]); return query; }, then: (resolve: (value: unknown) => void) => resolve(response) };
  const count = evaluate<(id: string, kind: string, options?: { requireCount: boolean }) => Promise<number>>(node.getText(ast), "exports.countRecordsByKind", { exports: {}, getSupabaseClient: () => ({ from: (table: string) => { trace.push(["from", table]); return query; } }) });
  await expect(count("owner-a", "journal", { requireCount: true })).rejects.toThrow("Record count was not returned");
  expect(trace).toEqual([["from", "records"], ["select", "id", { count: "exact", head: true }], ["eq", "user_id", "owner-a"], ["eq", "kind", "journal"]]);
  await expect(count("owner-a", "journal")).resolves.toBe(0);
  for (const value of [undefined, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) { response = { count: value, error: null }; await expect(count("owner-a", "journal", { requireCount: true })).rejects.toThrow(); }
  response = { count: 0, error: null }; await expect(count("owner-a", "journal", { requireCount: true })).resolves.toBe(0);
  response = { count: 2, error: null }; await expect(count("owner-a", "journal", { requireCount: true })).resolves.toBe(2);
  const error = new Error("query denied"); response = { count: 0, error }; await expect(count("owner-a", "journal", { requireCount: true })).rejects.toBe(error);
});

test("the active full intake owns the reads and both post-save refreshes; the simple CaptureView does not", () => {
  const wrapper = findNode(screenAst, (n) => ts.isFunctionDeclaration(n) && n.name?.text === "Capture").getText(screenAst);
  expect(wrapper).toContain("if (hasFullCaptureParams || fullCaptureActive)"); expect(wrapper).toContain("<CaptureLegacy embeddedInDock />");
  expect(wrapper).toContain('captureParams.entry === "firstRun"'); expect(wrapper).toContain("normalizeSharedCaptureParams"); expect(wrapper).toContain("captureModeOpensFullIntake");
  expect(readFileSync(join(process.cwd(), "src/app/capture-full.tsx"), "utf8")).toContain("<CaptureLegacy embeddedInDock enableLifeAreaIntents />");
  expect(screenText.match(/refreshRecentRecords\(\);/g)).toHaveLength(2);
  expect(screenText).not.toContain("listRecentRecords(");
});

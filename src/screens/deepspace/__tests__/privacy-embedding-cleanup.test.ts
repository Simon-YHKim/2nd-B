// T09 F4/F6: real effect/handler bodies and the shared deletion module, no RN renderer.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { clearRecordEmbeddings, waitForRecordEmbeddingCleanup } from "../../../lib/records/records-embeddings";

jest.mock("../../../lib/llm/boundary", () => ({ EMBED_DIM: 4, embedTexts: jest.fn() }));
const mockClearQuery = jest.fn(async () => ({ error: null as Error | null }));
const mockNot = jest.fn(() => mockClearQuery());
const mockEq = jest.fn(() => ({ not: mockNot }));
const mockUpdate = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn(() => ({ update: mockUpdate }));
jest.mock("../../../lib/supabase/client", () => ({
  getSupabaseClient: () => ({ from: mockFrom }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockClearQuery.mockReset().mockResolvedValue({ error: null });
});

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<{ error: Error | null }>((done, fail) => {
    resolve = () => done({ error: null });
    reject = fail;
  });
  return { promise, resolve, reject };
}

const file = "src/screens/deepspace/DeepSpaceDesignScreens.tsx";
const source = readFileSync(join(process.cwd(), file), "utf8");
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate: (node: ts.Node) => boolean): ts.Node {
  let found: ts.Node | undefined;
  const visit = (node: ts.Node): void => {
    if (!found && predicate(node)) found = node;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!found) throw new Error("Privacy source contract not found");
  return found;
}
const readEffect = find((node) => ts.isCallExpression(node)
  && ["useEffect", "useFocusEffect"].includes(node.expression.getText(ast))
  && node.arguments[0]?.getText(ast).includes("setPrefsReadFailed(false)")) as ts.CallExpression;
const first = readEffect.arguments[0];
const callback = ts.isCallExpression(first) ? first.arguments[0] : first;
function run<T>(text: string, context: Record<string, unknown>): T {
  const js = ts.transpileModule(`const run = ${text};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(context), `${js}\nreturn run;`)(...Object.values(context)) as T;
}
function handler(name: string, context: Record<string, unknown>) {
  const fn = find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  return run<() => Promise<void>>(fn.getText(ast), context);
}
const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const storedOff = { records_embedding: false, recommendations: true, external_analytics: false };
function harness() {
  const shown: boolean[] = [];
  const setEmbedOn = jest.fn((on: boolean) => shown.push(on));
  const context = {
    userId: "owner-a", busy: false, ko: true,
    activeUserRef: { current: "owner-a" }, privacyMountedRef: { current: true },
    prefsUserRef: { current: null as string | null }, prefsRef: { current: null as typeof storedOff | null },
    minorRef: { current: false },
    embeddingEnableRef: { current: false },
    readPrivacyPrefsStrict: jest.fn(async () => ({ ...storedOff })),
    withTimeout: (promise: Promise<unknown>) => promise, PRIVACY_READ_TIMEOUT_MS: 10_000,
    clearRecordEmbeddings: jest.fn(clearRecordEmbeddings),
    waitForRecordEmbeddingCleanup,
    backfillAllRecordEmbeddings: jest.fn(async () => undefined),
    savePrivacyPrefs: jest.fn(async (_owner: string, _prefs: unknown, _options: unknown) => undefined),
    showPrefs: jest.fn((prefs: typeof storedOff) => setEmbedOn(prefs.records_embedding)),
    setPrefsReadFailed: jest.fn(), setEmbeddingCleanupBusy: jest.fn(),
    setBusy: jest.fn(), setEmbedOn, setEmbedUnderstanding: jest.fn(), setEmbedErr: jest.fn(),
  };
  return {
    context, shown,
    enter: () => run<() => () => void>(callback.getText(ast), context)(),
  };
}

describe("disabled record connections retry cleanup on privacy entry", () => {
  it("uses a focus effect so returning to a mounted route also retries", () => {
    expect(readEffect.expression.getText(ast)).toBe("useFocusEffect");
    expect(ts.isCallExpression(first) && first.expression.getText(ast)).toBe("useCallback");
  });

  it("keeps the cleanup error through entry, another failure and a pending retry until success", async () => {
    const h = harness();
    mockClearQuery.mockRejectedValueOnce(new Error("offline"));
    const leave = h.enter();
    await settle();
    expect(h.context.clearRecordEmbeddings).toHaveBeenCalledTimes(1);
    expect(h.context.clearRecordEmbeddings).toHaveBeenLastCalledWith("owner-a");
    expect(h.context.setEmbedErr).toHaveBeenLastCalledWith(true);
    expect(h.context.setEmbedErr).not.toHaveBeenCalledWith(false);
    expect(h.context.setPrefsReadFailed).not.toHaveBeenCalledWith(true);
    expect(h.context.setEmbeddingCleanupBusy).toHaveBeenLastCalledWith(false);
    leave();
    mockClearQuery.mockResolvedValueOnce({ error: new Error("still offline") });
    const leaveAgain = h.enter();
    await settle();
    expect(h.context.clearRecordEmbeddings).toHaveBeenCalledTimes(2);
    expect(h.context.setEmbedErr).not.toHaveBeenCalledWith(false);
    leaveAgain();
    const deletion = deferred();
    mockClearQuery.mockReturnValueOnce(deletion.promise);
    h.enter();
    await settle();
    try {
      expect(h.context.setEmbedErr).toHaveBeenLastCalledWith(true);
      expect(h.context.setEmbedErr).not.toHaveBeenCalledWith(false);
    } finally {
      deletion.resolve();
      await settle();
    }
    expect(h.context.setEmbedErr).toHaveBeenLastCalledWith(false);
    expect(h.context.savePrivacyPrefs).not.toHaveBeenCalled();
    expect(h.shown).toEqual([false, false, false]);
  });

  it("a failed deletion after switching off preserves withdrawal and retries on re-entry", async () => {
    const h = harness();
    h.context.prefsUserRef.current = "owner-a";
    h.context.prefsRef.current = { ...storedOff, records_embedding: true };
    h.context.readPrivacyPrefsStrict.mockResolvedValueOnce({ ...storedOff, records_embedding: true });
    mockClearQuery.mockRejectedValueOnce(new Error("offline"));
    await handler("disableEmbedding", h.context)();
    expect(h.context.savePrivacyPrefs).toHaveBeenCalledTimes(1);
    expect(h.context.savePrivacyPrefs).toHaveBeenCalledWith("owner-a", storedOff, {
      before: { ...storedOff, records_embedding: true },
    });
    expect(h.context.prefsRef.current.records_embedding).toBe(false);
    expect(h.shown).toEqual([false]);
    expect(h.context.setEmbedErr).toHaveBeenLastCalledWith(true);
    h.enter();
    await settle();
    expect(h.context.clearRecordEmbeddings).toHaveBeenCalledTimes(2);
    expect(h.context.savePrivacyPrefs).toHaveBeenCalledTimes(1);
    expect(h.context.setEmbedErr).toHaveBeenLastCalledWith(false);
  });

  it("does not delete before a withdrawal is saved", async () => {
    const h = harness();
    h.context.prefsUserRef.current = "owner-a";
    h.context.savePrivacyPrefs.mockRejectedValueOnce(new Error("write failed"));
    await handler("disableEmbedding", h.context)();
    expect(h.context.clearRecordEmbeddings).not.toHaveBeenCalled();
    expect(h.shown).toEqual([]);
  });

  it("refreshes old screen choices on focus and keeps enabled connections", async () => {
    const h = harness();
    h.context.prefsUserRef.current = "owner-a";
    h.context.prefsRef.current = { ...storedOff };
    h.context.readPrivacyPrefsStrict.mockResolvedValueOnce({ ...storedOff, records_embedding: true });
    h.enter();
    await settle();
    expect(h.context.clearRecordEmbeddings).not.toHaveBeenCalled();
    expect(h.shown).toEqual([true]);
  });

  it("an unread choice is not consent to delete", async () => {
    const h = harness();
    h.context.readPrivacyPrefsStrict.mockRejectedValueOnce(new Error("offline"));
    h.enter();
    await settle();
    expect(h.context.clearRecordEmbeddings).not.toHaveBeenCalled();
    expect(h.context.setPrefsReadFailed).toHaveBeenLastCalledWith(true);
  });

  it.each(["leave", "account", "enable", "enabling"])("ignores a late off read after %s", async (change) => {
    const h = harness();
    let resolve!: (prefs: typeof storedOff) => void;
    h.context.readPrivacyPrefsStrict.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const leave = h.enter();
    if (change === "leave") leave();
    if (change === "account") h.context.activeUserRef.current = "owner-b";
    if (change === "enabling") h.context.embeddingEnableRef.current = true;
    if (change === "enable") {
      h.context.prefsUserRef.current = "owner-a";
      h.context.prefsRef.current = { ...storedOff, records_embedding: true };
    }
    resolve({ ...storedOff });
    await settle();
    expect(h.context.clearRecordEmbeddings).not.toHaveBeenCalled();
  });

  it("marks an opt-in in flight before its read and releases the fence on failure", async () => {
    const h = harness();
    const enablingAtRead: boolean[] = [];
    h.context.prefsUserRef.current = "owner-a";
    h.context.readPrivacyPrefsStrict.mockImplementationOnce(async () => {
      enablingAtRead.push(h.context.embeddingEnableRef.current);
      throw new Error("offline");
    });
    await handler("enableEmbedding", h.context)();
    expect(h.context.readPrivacyPrefsStrict).toHaveBeenCalledTimes(1);
    expect(enablingAtRead).toEqual([true]);
    expect(h.context.embeddingEnableRef.current).toBe(false);
    expect(h.context.savePrivacyPrefs).not.toHaveBeenCalled();
  });

  it.each(["disable", "entry"])("waits for an unmounted screen's %s cleanup before a new screen saves opt-in", async (start) => {
    const oldScreen = harness();
    const deletion = deferred();
    const order: string[] = [];
    mockClearQuery.mockReturnValueOnce(deletion.promise.then((result) => {
      order.push("deleted");
      return result;
    }));
    oldScreen.context.prefsUserRef.current = "owner-a";
    let oldHandler: Promise<void> | undefined;
    const leave = start === "entry" ? oldScreen.enter() : () => undefined;
    if (start === "disable") oldHandler = handler("disableEmbedding", oldScreen.context)();
    await settle();
    leave();
    oldScreen.context.privacyMountedRef.current = false;
    oldScreen.context.setEmbedErr.mockClear();
    const newScreen = harness();
    newScreen.enter();
    await settle();
    newScreen.context.savePrivacyPrefs.mockImplementation(async () => { order.push("enabled"); });
    const enabling = handler("enableEmbedding", newScreen.context)();
    await settle();
    try {
      expect(mockClearQuery).toHaveBeenCalledTimes(1);
      expect(newScreen.context.savePrivacyPrefs).not.toHaveBeenCalled();
      expect(newScreen.context.backfillAllRecordEmbeddings).not.toHaveBeenCalled();
      expect(newScreen.context.setBusy).toHaveBeenLastCalledWith(true);
    } finally {
      deletion.resolve();
      await Promise.all([oldHandler, enabling]);
      await settle();
    }
    expect(order).toEqual(["deleted", "enabled"]);
    expect(newScreen.context.savePrivacyPrefs).toHaveBeenCalledWith("owner-a", {
      ...storedOff, records_embedding: true,
    }, { before: storedOff });
    expect(newScreen.context.backfillAllRecordEmbeddings).toHaveBeenCalledTimes(1);
    expect(newScreen.context.setBusy).toHaveBeenLastCalledWith(false);
    expect(newScreen.context.embeddingEnableRef.current).toBe(false);
    expect(oldScreen.context.setEmbedErr).not.toHaveBeenCalled();
  });

  it.each(["unmount", "owner", "minor", "failure"])("does not enable after waiting when %s changes", async (change) => {
    const h = harness();
    h.context.prefsUserRef.current = "owner-a";
    h.context.setEmbedErr(true);
    const deletion = deferred();
    mockClearQuery.mockReturnValueOnce(deletion.promise);
    // No focus effect in the new screen: opt-in must consult the module itself.
    const clearing = clearRecordEmbeddings("owner-a").catch(() => undefined);
    const enabling = handler("enableEmbedding", h.context)();
    await settle();
    try {
      expect(h.context.savePrivacyPrefs).not.toHaveBeenCalled();
      expect(h.context.setEmbedErr).not.toHaveBeenCalledWith(false);
      if (change === "unmount") h.context.privacyMountedRef.current = false;
      if (change === "owner") h.context.activeUserRef.current = "owner-b";
      if (change === "minor") h.context.minorRef.current = true;
    } finally {
      if (change === "failure") deletion.reject(new Error("offline"));
      else deletion.resolve();
      await Promise.all([clearing, enabling]);
    }
    expect(h.context.savePrivacyPrefs).not.toHaveBeenCalled();
    expect(h.context.embeddingEnableRef.current).toBe(false);
    if (change === "failure") expect(h.context.setEmbedErr).toHaveBeenLastCalledWith(true);
  });

  it("keeps an earlier error during a manual deletion and clears it only on success", async () => {
    const h = harness();
    h.context.prefsUserRef.current = "owner-a";
    h.context.setEmbedErr(true);
    const deletion = deferred();
    mockClearQuery.mockReturnValueOnce(deletion.promise);
    const disabling = handler("disableEmbedding", h.context)();
    await settle();
    try {
      expect(h.context.setEmbedErr).not.toHaveBeenCalledWith(false);
    } finally {
      deletion.resolve();
      await disabling;
    }
    expect(h.context.setEmbedErr).toHaveBeenLastCalledWith(false);
  });

  it("keeps an earlier deletion error if the next preference read fails", async () => {
    const h = harness();
    h.context.setEmbedErr(true);
    h.context.readPrivacyPrefsStrict.mockRejectedValueOnce(new Error("offline"));
    h.enter();
    await settle();
    expect(h.context.setEmbedErr).not.toHaveBeenCalledWith(false);
  });

  it("uses the existing failure copy and keeps both opt-in buttons busy during cleanup", () => {
    expect(source).toMatch(/\{embedErr \? \(\s*<Text[^>]*>\{t\("privacy.saveFailed"\)\}/);
    expect(source.match(/disabled=\{busy \|\| embeddingCleanupBusy\}/g)).toHaveLength(2);
  });
});

describe("record cleanup is shared per owner for this app process", () => {
  it("does not make a different owner wait for a pending deletion", async () => {
    const deletion = deferred();
    mockClearQuery.mockReturnValueOnce(deletion.promise);
    const clearing = clearRecordEmbeddings("owner-a");
    let finished = false;
    const waiting = waitForRecordEmbeddingCleanup("owner-b").then(() => { finished = true; });
    await settle();
    try {
      expect(finished).toBe(true);
    } finally {
      deletion.resolve();
      await Promise.all([clearing, waiting]);
    }
  });

  it("waits for a subsequent cleanup that starts before the first wait resumes", async () => {
    const first = deferred();
    const second = deferred();
    mockClearQuery.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const clearing = clearRecordEmbeddings("owner-a");
    const reclearing = clearing.then(() => clearRecordEmbeddings("owner-a"));
    let finished = false;
    const waiting = waitForRecordEmbeddingCleanup("owner-a").then(() => { finished = true; });
    first.resolve();
    await settle();
    try {
      expect(mockClearQuery).toHaveBeenCalledTimes(2);
      expect(finished).toBe(false);
    } finally {
      second.resolve();
      await Promise.all([reclearing, waiting]);
    }
    expect(finished).toBe(true);
  });

  it("shares one pending deletion per owner while another owner can delete independently", async () => {
    const deletion = deferred();
    mockClearQuery.mockReturnValueOnce(deletion.promise);
    const first = clearRecordEmbeddings("owner-a");
    const second = clearRecordEmbeddings("owner-a");
    const other = clearRecordEmbeddings("owner-b");
    try {
      await other;
      expect(first).toBe(second);
      expect(mockClearQuery).toHaveBeenCalledTimes(2);
      expect(mockEq.mock.calls).toEqual([["user_id", "owner-a"], ["user_id", "owner-b"]]);
    } finally {
      deletion.resolve();
      await Promise.all([first, second]);
    }
    await clearRecordEmbeddings("owner-a");
    expect(mockClearQuery).toHaveBeenCalledTimes(3);
    expect(mockFrom).toHaveBeenLastCalledWith("records");
    expect(mockUpdate).toHaveBeenLastCalledWith({ embedding: null, embedding_model: null });
    expect(mockNot).toHaveBeenLastCalledWith("embedding", "is", null);
  });

  it.each(["rejection", "error response"])("releases a failed deletion after %s so it can be retried", async (failure) => {
    const error = new Error("offline");
    if (failure === "rejection") mockClearQuery.mockRejectedValueOnce(error);
    else mockClearQuery.mockResolvedValueOnce({ error });
    const first = clearRecordEmbeddings("owner-a");
    const second = clearRecordEmbeddings("owner-a");
    const results = await Promise.allSettled([first, second]);
    expect(results).toEqual([{ status: "rejected", reason: error }, { status: "rejected", reason: error }]);
    await expect(clearRecordEmbeddings("owner-a")).resolves.toBeUndefined();
    expect(mockClearQuery).toHaveBeenCalledTimes(2);
  });
});

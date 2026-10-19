// T09 F4/F5: execute the real effect/handler bodies without the RN renderer.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

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
    embeddingCleanupRef: { current: false }, minorRef: { current: false },
    embeddingEnableRef: { current: false },
    readPrivacyPrefsStrict: jest.fn(async () => ({ ...storedOff })),
    withTimeout: (promise: Promise<unknown>) => promise, PRIVACY_READ_TIMEOUT_MS: 10_000,
    clearRecordEmbeddings: jest.fn(async (_owner: string) => undefined),
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

  it("retries once per entry after failure, quietly, without changing stored choices", async () => {
    const h = harness();
    h.context.clearRecordEmbeddings.mockRejectedValueOnce(new Error("offline"));
    const leave = h.enter();
    await settle();
    expect(h.context.clearRecordEmbeddings).toHaveBeenCalledTimes(1);
    expect(h.context.clearRecordEmbeddings).toHaveBeenLastCalledWith("owner-a");
    expect(h.context.setEmbedErr).not.toHaveBeenCalledWith(true);
    expect(h.context.setPrefsReadFailed).not.toHaveBeenCalledWith(true);
    expect(h.context.embeddingCleanupRef.current).toBe(false);
    expect(h.context.setEmbeddingCleanupBusy).toHaveBeenLastCalledWith(false);
    leave();
    h.enter();
    await settle();
    expect(h.context.clearRecordEmbeddings).toHaveBeenCalledTimes(2);
    expect(h.context.savePrivacyPrefs).not.toHaveBeenCalled();
    expect(h.shown).toEqual([false, false]);
  });

  it("a failed deletion after switching off preserves withdrawal and retries on re-entry", async () => {
    const h = harness();
    h.context.prefsUserRef.current = "owner-a";
    h.context.prefsRef.current = { ...storedOff, records_embedding: true };
    h.context.readPrivacyPrefsStrict.mockResolvedValueOnce({ ...storedOff, records_embedding: true });
    h.context.clearRecordEmbeddings.mockRejectedValueOnce(new Error("offline"));
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

  it("does not overlap cleanup or allow opt-in while the old deletion is pending", async () => {
    const h = harness();
    let resolve!: () => void;
    h.context.clearRecordEmbeddings.mockReturnValueOnce(new Promise((done) => { resolve = () => done(undefined); }));
    const leave = h.enter();
    await settle();
    expect(h.context.embeddingCleanupRef.current).toBe(true);
    await handler("enableEmbedding", h.context)();
    expect(h.context.savePrivacyPrefs).not.toHaveBeenCalled();
    leave();
    h.enter();
    await settle();
    expect(h.context.clearRecordEmbeddings).toHaveBeenCalledTimes(1);
    resolve();
    await settle();
    expect(h.context.embeddingCleanupRef.current).toBe(false);
    expect(h.context.setEmbeddingCleanupBusy).toHaveBeenLastCalledWith(false);
  });
});

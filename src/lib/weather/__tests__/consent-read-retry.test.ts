import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { consentAfterFailedRevoke, consentEvidence } from "../consent-evidence";
import { WEATHER_CONSENT_REVISION, type WeatherConsent } from "../model";

const source = readFileSync(resolve(__dirname, "../../../components/privacy/WeatherPrivacyControl.tsx"), "utf8");
const ast = ts.createSourceFile("WeatherPrivacyControl.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// Execute the shipped callbacks and scalar JSX expressions, not a copied state machine.
// No React hooks, host components or renderer run here; source contracts check their wiring.
function nodes<T extends ts.Node>(guard: (node: ts.Node) => node is T): T[] {
  const matches: T[] = [];
  const visit = (node: ts.Node) => { if (guard(node)) matches.push(node); ts.forEachChild(node, visit); };
  visit(ast);
  return matches;
}

function variable(name: string): ts.Expression {
  const node = nodes(ts.isVariableDeclaration).find((item) => item.name.getText(ast) === name)?.initializer;
  if (!node) throw new Error(`Missing variable ${name}`);
  return node;
}

function evaluate<T>(node: ts.Node, bindings: Record<string, unknown>): T {
  const output = ts.transpileModule(`const result = (${node.getText(ast)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function(...Object.keys(bindings), `${output}\nreturn result;`)(...Object.values(bindings));
}

const readCallback = (variable("readConsent") as ts.CallExpression).arguments[0];
const revokeCallback = nodes(ts.isFunctionDeclaration).find((node) => node.name?.text === "revoke")!;
const focusCallback = (nodes(ts.isCallExpression).find((node) => node.expression.getText(ast) === "useFocusEffect")!
  .arguments[0] as ts.CallExpression).arguments[0];
const readBranch = nodes(ts.isConditionalExpression).find((node) => node.whenTrue.getText(ast).includes('t("phone.board.generation.unavailable")'))!;
const saveBranch = nodes(ts.isConditionalExpression).find((node) => node.whenTrue.getText(ast).includes('t("phone.board.weather.failed")'))!;
const statusLabel = nodes(ts.isJsxExpression).find((node) => node.expression?.getText(ast).includes('t("common:states.loading")'))!.expression!;
const retry = nodes(ts.isJsxOpeningElement).find((node) => node.getText(ast).includes("void readConsent()"))!;
const retryAttribute = (name: string) => ((retry.attributes.properties.find((node) => ts.isJsxAttribute(node) && node.name.getText(ast) === name) as ts.JsxAttribute)
  .initializer as ts.JsxExpression).expression!;

function consent(enabled = true, eligible = true): WeatherConsent {
  return { contract: WEATHER_CONSENT_REVISION, revision: 5, enabled, eligible, available: true };
}

function deferred<T>() {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason: Error) => void;
  const promise = new Promise<T>((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });
  // A mutant may skip consuming this request. Keep its rejection from crashing the worker;
  // the assertions must report that missing request/result instead.
  void promise.catch(() => {});
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

// The real conflict class has no behavior beyond its latest snapshot. Avoid importing network I/O.
class WeatherConsentConflictError extends Error {
  constructor(readonly latest?: WeatherConsent) { super("weather_changed"); }
}

function harness() {
  const state = {
    snapshot: null as { ownerId: string; status: WeatherConsent; revoked?: boolean } | null,
    failure: null as "read" | "save" | null, busy: false, readBusy: false,
  };
  const updates: string[] = [];
  const scope = { current: new AbortController() as AbortController | null };
  const pendingRead = { current: null as object | null };
  const saving = { current: false };
  const loadWeatherConsent = jest.fn<Promise<WeatherConsent>, [string, AbortSignal]>();
  const saveWeatherConsent = jest.fn<Promise<WeatherConsent>, [string, WeatherConsent | null, boolean, string, AbortSignal]>();
  let userId: string | null = "owner-a";
  let isMinor: boolean | null = false;
  let cleanup: (() => void) | undefined;
  const set = <K extends keyof typeof state>(key: K) => (value: typeof state[K]) => { state[key] = value; updates.push(key); };
  function bindings(): Record<string, unknown> {
    const base = { ...state, userId, isMinor, scope, pendingRead, saving, loadWeatherConsent, saveWeatherConsent,
      i18n: { language: "ko" }, consentEvidence, consentAfterFailedRevoke, WeatherConsentConflictError,
      setSnapshot: set("snapshot"), setFailure: set("failure"), setBusy: set("busy"), setReadBusy: set("readBusy"),
      t: (key: string) => key, AbortController };
    const status = evaluate<WeatherConsent | null>(variable("status"), base);
    const evidence = evaluate<string>(variable("evidence"), { ...base, status });
    const confirmed = evaluate<boolean>(variable("confirmed"), { evidence });
    const failed = evaluate<boolean>(variable("failed"), base);
    const all = { ...base, status, evidence, confirmed, failed };
    const canRevoke = evaluate<boolean>(variable("canRevoke"), all);
    return { ...all, canRevoke };
  }
  const read = () => evaluate<() => Promise<void>>(readCallback, bindings())();
  return {
    state, updates, scope, pendingRead, saving, load: loadWeatherConsent, save: saveWeatherConsent, read,
    revoke: () => evaluate<() => Promise<void>>(revokeCallback, bindings())(),
    enter(owner: string | null = "owner-a", minor: boolean | null = false) {
      cleanup?.(); userId = owner; isMinor = minor;
      cleanup = evaluate<() => () => void>(focusCallback, { ...bindings(), readConsent: read })();
    },
    leave() { if (cleanup) cleanup(); else scope.current?.abort(); },
    presentation() {
      const all = bindings();
      return {
        readError: evaluate<boolean>(readBranch.condition, all), saveError: evaluate<boolean>(saveBranch.condition, all),
        canRevoke: all.canRevoke, label: evaluate<string>(statusLabel, all),
        retryDisabled: evaluate<boolean>(retryAttribute("disabled"), all),
        retryAccessibility: evaluate<unknown>(retryAttribute("accessibilityState"), all),
      };
    },
  };
}

async function readFailure() {
  const h = harness();
  h.load.mockRejectedValueOnce(new Error("unavailable"));
  await h.read();
  return h;
}

test("read failures show load copy and retry, not save copy or a false OFF state", async () => {
  const h = await readFailure();
  expect(h.presentation()).toMatchObject({ readError: true, saveError: false, label: "", canRevoke: true, retryDisabled: false });
  expect(readBranch.whenTrue.getText(ast)).toContain('t("common:actions.retry")');
  expect(readBranch.whenTrue.getText(ast)).not.toContain('t("phone.board.weather.failed")');
  expect(readBranch.whenTrue.getText(ast)).toContain('accessibilityRole="alert"');
  expect(retry.getText(ast)).toContain('accessibilityRole="button"');
  expect(retry.getText(ast)).toContain("onPress={() => void readConsent()}");
  expect(saveBranch.whenTrue.getText(ast)).not.toContain('t("common:actions.retry")');
});

test.each([true, false])("retry success clears the error and displays confirmed enabled=%s", async (enabled) => {
  const h = await readFailure();
  h.load.mockResolvedValueOnce(consent(enabled));
  await h.read();
  expect(h.load).toHaveBeenNthCalledWith(2, "owner-a", h.scope.current!.signal);
  expect(h.state.snapshot).toEqual({ ownerId: "owner-a", status: consent(enabled) });
  expect(h.presentation()).toMatchObject({ readError: false, saveError: false, label: `phone.board.weather.${enabled ? "on" : "off"}`, canRevoke: enabled });
  // A retry only reads; it must never write consent.
  expect(h.save).not.toHaveBeenCalled();
});

test("retry stays a read error while pending, ignores duplicate presses and remains retryable on failure", async () => {
  const h = await readFailure();
  const pending = deferred<WeatherConsent>();
  h.load.mockReturnValueOnce(pending.promise);
  const first = h.read();
  await h.read();
  expect(h.load).toHaveBeenCalledTimes(2);
  expect(h.presentation()).toMatchObject({ readError: true, saveError: false, canRevoke: true, retryDisabled: true,
    retryAccessibility: { disabled: true, busy: true } });
  pending.reject(new Error("still unavailable"));
  await first;
  expect(h.pendingRead.current).toBeNull();
  expect(h.presentation()).toMatchObject({ readError: true, saveError: false, retryDisabled: false });
  expect(h.save).not.toHaveBeenCalled();
});

test.each(["resolve", "reject"] as const)("leaving during retry ignores its late %s and all state writes", async (settle) => {
  const h = await readFailure();
  const pending = deferred<WeatherConsent>();
  h.load.mockReturnValueOnce(pending.promise);
  const read = h.read();
  h.leave();
  expect(h.load.mock.calls[1][1].aborted).toBe(true);
  const before = h.updates.length;
  if (settle === "resolve") pending.resolve(consent()); else pending.reject(new Error("late"));
  await read;
  expect(h.updates).toHaveLength(before);
  await h.read();
  expect(h.load).toHaveBeenCalledTimes(2);
});

test.each(["owner-a", "owner-b"])("refocus for %s resets failure, reads anew and ignores the old read's settlement", async (owner) => {
  const h = await readFailure();
  const old = deferred<WeatherConsent>();
  const fresh = deferred<WeatherConsent>();
  h.load.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  const oldRead = h.read();
  h.leave(); h.enter(owner);
  const current = h.pendingRead.current;
  expect(h.state.failure).toBeNull();
  expect(h.state.snapshot).toBeNull();
  expect(h.presentation()).toMatchObject({ canRevoke: false, label: "common:states.loading" });
  old.resolve(consent());
  await oldRead;
  expect(h.state.snapshot).toBeNull();
  expect(h.pendingRead.current).toBe(current);
  expect(h.state.readBusy).toBe(true);
  fresh.resolve(consent(false));
  await fresh.promise;
  expect(h.state.snapshot?.ownerId).toBe(owner);
  expect(h.load).toHaveBeenLastCalledWith(owner, h.scope.current!.signal);
});

test.each([{ owner: null, minor: false }, { owner: "owner-a", minor: true }, { owner: "owner-a", minor: null }])(
  "no status reads or withdrawal without an eligible account: %j", async ({ owner, minor }) => {
    const h = harness(); h.enter(owner, minor); await h.read(); await h.revoke();
    expect(h.load).not.toHaveBeenCalled(); expect(h.save).not.toHaveBeenCalled();
    expect(h.presentation().canRevoke).toBe(false);
  },
);

test("account transition aborts the old focus scope before starting the new owner's read", async () => {
  const h = harness(); const old = deferred<WeatherConsent>(); const fresh = deferred<WeatherConsent>();
  h.load.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  h.enter("owner-a");
  const oldSignal = h.load.mock.calls[0][1];
  h.enter("owner-b");
  expect(oldSignal.aborted).toBe(true);
  const current = h.pendingRead.current;
  const before = h.updates.length;
  old.reject(new Error("old owner")); await old.promise.catch(() => {});
  expect(h.updates).toHaveLength(before);
  expect(h.pendingRead.current).toBe(current);
  fresh.resolve(consent()); await fresh.promise;
  expect(h.state.snapshot?.ownerId).toBe("owner-b");
  expect(h.presentation().label).toBe("phone.board.weather.on");
});

test("read and revoke do nothing before a focus scope exists", async () => {
  const h = harness(); h.scope.current = null; h.state.failure = "read";
  await h.read(); await h.revoke();
  expect(h.load).not.toHaveBeenCalled(); expect(h.save).not.toHaveBeenCalled();
});

test("a read failure permits withdrawal with an unknown snapshot, then shows confirmed OFF", async () => {
  const h = await readFailure();
  h.save.mockResolvedValueOnce(consent(false, false));
  await h.revoke();
  expect(h.save).toHaveBeenCalledWith("owner-a", null, false, "ko", h.scope.current!.signal);
  expect(h.state.snapshot?.revoked).toBe(true);
  expect(h.presentation()).toMatchObject({ readError: false, saveError: false, canRevoke: false, label: "phone.board.weather.off" });
  expect(source).toContain("if (!WEATHER_LOCATION_ENABLED && !canRevoke) return null");
});

test.each([new Error("save failed"), new WeatherConsentConflictError(consent(false, false))])(
  "withdrawal failure keeps the save copy and withdrawal available: %s", async (error) => {
    const h = await readFailure(); h.save.mockRejectedValueOnce(error); await h.revoke();
    expect(h.state.snapshot).toBeNull();
    expect(h.presentation()).toMatchObject({ readError: false, saveError: true, canRevoke: true, label: "" });
    expect(h.state.busy).toBe(false); expect(h.saving.current).toBe(false);
  },
);

test.each(["resolve", "reject"] as const)("withdrawal wins over the superseded retry's late %s", async (settle) => {
  const h = await readFailure();
  const pending = deferred<WeatherConsent>();
  h.load.mockReturnValueOnce(pending.promise); const read = h.read();
  h.save.mockResolvedValueOnce(consent(false, false)); await h.revoke();
  const before = h.updates.length;
  if (settle === "resolve") pending.resolve(consent()); else pending.reject(new Error("late"));
  await read;
  expect(h.updates).toHaveLength(before);
  expect(h.state.readBusy).toBe(false);
  expect(h.presentation()).toMatchObject({ readError: false, saveError: false, label: "phone.board.weather.off" });
});

test("a late retry cannot clear the failure of a withdrawal made while it was pending", async () => {
  const h = await readFailure(); const pending = deferred<WeatherConsent>();
  h.load.mockReturnValueOnce(pending.promise); const read = h.read();
  h.save.mockRejectedValueOnce(new Error("save failed")); await h.revoke();
  const before = h.updates.length;
  pending.resolve(consent(false)); await read;
  expect(h.updates).toHaveLength(before);
  expect(h.presentation()).toMatchObject({ readError: false, saveError: true, canRevoke: true, label: "" });
});

test("a pending withdrawal blocks retry and duplicate withdrawal before another render", async () => {
  const h = await readFailure(); const pending = deferred<WeatherConsent>();
  h.save.mockReturnValueOnce(pending.promise); const revoke = h.revoke();
  await h.read(); await h.revoke();
  expect(h.load).toHaveBeenCalledTimes(1); expect(h.save).toHaveBeenCalledTimes(1);
  expect(h.presentation().retryDisabled).toBe(true);
  pending.resolve(consent(false)); await revoke;
});

test.each(["resolve", "reject"] as const)("withdrawal settlement after leaving is ignored: %s", async (settle) => {
  const h = await readFailure(); const pending = deferred<WeatherConsent>();
  h.save.mockReturnValueOnce(pending.promise); const revoke = h.revoke(); h.leave();
  const before = h.updates.length;
  if (settle === "resolve") pending.resolve(consent(false)); else pending.reject(new Error("late"));
  await revoke;
  expect(h.updates).toHaveLength(before);
});

test.each(["ko", "en", "es", "pt", "id"])("%s reuses existing, distinct read/save messages and a retry label", (locale) => {
  const ops = JSON.parse(readFileSync(resolve(__dirname, "../../../../locales", locale, "ops.json"), "utf8"));
  const common = JSON.parse(readFileSync(resolve(__dirname, "../../../../locales", locale, "common.json"), "utf8"));
  expect(ops.phone.board.generation.unavailable.length).toBeGreaterThan(0);
  expect(common.actions.retry.length).toBeGreaterThan(0);
  expect(ops.phone.board.generation.unavailable).not.toBe(ops.phone.board.weather.failed);
  // The read-failure line borrows the board's generation key: pin every language so a board-only
  // rewording cannot silently change what the consent row says.
  const expected: Record<string, [string, string]> = {
    ko: ["불러오지 못했습니다. 다시 시도해 주세요.", "다시 시도"],
    en: ["Could not load. Please try again.", "Retry"],
    es: ["No se pudo cargar. Vuelve a intentarlo.", "Reintentar"],
    pt: ["Não foi possível carregar. Tente novamente.", "Tentar novamente"],
    id: ["Tidak dapat memuat. Silakan coba lagi.", "Coba lagi"],
  };
  expect(ops.phone.board.generation.unavailable).toBe(expected[locale][0]);
  expect(common.actions.retry).toBe(expected[locale][1]);
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { defaultPrivacyPrefs, type PrivacyPrefs } from "../../privacy/prefs";

let mockPrefs: PrivacyPrefs;
const mockRead = jest.fn(async () => ({ data: { privacy_prefs: { ...mockPrefs } }, error: null }));
const mockWrite = jest.fn(async (prefs: PrivacyPrefs) => { mockPrefs = prefs; return { error: null as Error | null }; });
jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => ({
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: () => mockRead() }) }),
    update: ({ privacy_prefs }: { privacy_prefs: PrivacyPrefs }) => ({ eq: () => mockWrite(privacy_prefs) }),
    insert: async () => ({ error: null }),
  }),
}) }));

import { createChatAutosaveSession } from "../autosave-session";
import { findPromptIndex } from "../keep-exchange";
import { savePrivacyPrefs } from "../../supabase/privacy";
import { resetPrivacyChangesForTests } from "../../privacy/changes";
import { __resetAccountEpochForTests, beginAccountOwnerTransition, noteResolvedOwner } from "../../auth/account-epoch";

beforeEach(() => {
  resetPrivacyChangesForTests(); __resetAccountEpochForTests(); noteResolvedOwner("a");
  mockPrefs = defaultPrivacyPrefs(); mockRead.mockClear(); mockWrite.mockClear();
});

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

test("shipping autosave does not retroactively save the last turn when consent changes to ON", async () => {
  // Execute the shipped effect rather than asserting that its last-index line exists.
  const source = readFileSync(join(__dirname, "../../../app/secondb.tsx"), "utf8");
  const ast = ts.createSourceFile("secondb.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect = "";
  const walk = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect" &&
      node.arguments[0]?.getText(ast).includes("const idx = turns.length - 1;")) effect = node.arguments[0].getText(ast);
    ts.forEachChild(node, walk);
  };
  walk(ast); expect(effect).not.toBe("");
  const keep = jest.fn().mockResolvedValue(true);
  const session = createChatAutosaveSession("a", () => 1, jest.fn());
  mockPrefs.chat_autosave = true;
  await session.hydrate();
  const code = ts.transpileModule(`const effect = ${effect};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const run = new Function("chatAutosaveAllowed", "autosaveConsent", "userId", "keeping", "turns", "isKeepable", "autosaveSessionRef", "keptIdx", "keepExchange", "findPromptIndex", `${code}; return effect;`);
  run((value: unknown) => value === true, true, "a", null, [{ role: "secondb", text: "Already received before consent" }], () => true, { current: session }, new Set(), keep, findPromptIndex)();
  await Promise.resolve();
  expect(keep).not.toHaveBeenCalled();
  session.stop();
});

test("a reply received after grant does not retroactively save its earlier user prompt", async () => {
  let count = 1;
  const session = createChatAutosaveSession("a", () => count, jest.fn());
  await session.hydrate();
  await savePrivacyPrefs("a", { ...mockPrefs, chat_autosave: true });
  const turns = [
    { role: "user" as const, text: "Asked while OFF" },
    { role: "secondb" as const, text: "Temporary status", synthetic: true },
    { role: "secondb" as const, text: "Reply after grant" },
  ];
  count = turns.length;
  const keep = jest.fn();
  expect(await session.save(2, keep, findPromptIndex(turns, 2) ?? 2)).toBe(false);
  expect(keep).not.toHaveBeenCalled(); session.stop();
});

test("OFF and unknown block capture; successful grant skips existing turns and permits only a new turn once", async () => {
  let count = 2;
  const session = createChatAutosaveSession("a", () => count, jest.fn());
  const keep = jest.fn().mockResolvedValue(true);
  expect(await session.save(1, keep)).toBe(false);
  await session.hydrate();
  expect(await session.save(1, keep)).toBe(false);
  await savePrivacyPrefs("a", { ...mockPrefs, chat_autosave: true });
  expect(await session.save(1, keep)).toBe(false);
  count = 4;
  expect(await session.save(3, keep)).toBe(true);
  expect(await session.save(3, keep)).toBe(false);
  expect(keep).toHaveBeenCalledTimes(1);
  session.stop();
});

test("withdrawal aborts capture immediately and a failed server write does not reopen the mounted session", async () => {
  let count = 0;
  mockPrefs.chat_autosave = true;
  const session = createChatAutosaveSession("a", () => count, jest.fn());
  await session.hydrate(); count = 2;
  const started = deferred<AbortSignal>();
  const finish = deferred<boolean>();
  const saved = session.save(1, async (signal) => { started.resolve(signal); return finish.promise; });
  const signal = await started.promise;
  mockWrite.mockResolvedValueOnce({ error: new Error("write failed") });
  const withdrawal = savePrivacyPrefs("a", { ...mockPrefs, chat_autosave: false });
  expect(signal.aborted).toBe(true);
  await expect(withdrawal).rejects.toThrow("write failed");
  finish.resolve(false); await saved;
  await session.hydrate();
  const keep = jest.fn(); expect(await session.save(1, keep)).toBe(false);
  expect(keep).not.toHaveBeenCalled(); session.stop();
});

test("the fresh server OFF decision blocks a stale local ON before capture", async () => {
  let count = 0; mockPrefs.chat_autosave = true;
  const session = createChatAutosaveSession("a", () => count, jest.fn());
  await session.hydrate(); count = 2;
  mockPrefs.chat_autosave = false;
  const keep = jest.fn(); expect(await session.save(1, keep)).toBe(false);
  expect(keep).not.toHaveBeenCalled(); session.stop();
});

test.each(["withdraw", "account"])("a pending server consent read cannot start capture after %s", async (action) => {
  let count = 0; mockPrefs.chat_autosave = true;
  const session = createChatAutosaveSession("a", () => count, jest.fn());
  await session.hydrate(); count = 2;
  const held = deferred<Awaited<ReturnType<typeof mockRead>>>();
  mockRead.mockImplementationOnce(() => held.promise);
  const keep = jest.fn(); const saving = session.save(1, keep);
  if (action === "withdraw") await savePrivacyPrefs("a", { ...mockPrefs, chat_autosave: false });
  else beginAccountOwnerTransition("b");
  held.resolve({ data: { privacy_prefs: { ...mockPrefs, chat_autosave: true } }, error: null });
  expect(await saving).toBe(false); expect(keep).not.toHaveBeenCalled(); session.stop();
});

test("an owner transition aborts already-started capture", async () => {
  let count = 0; mockPrefs.chat_autosave = true;
  const session = createChatAutosaveSession("a", () => count, jest.fn());
  await session.hydrate(); count = 2;
  const started = deferred<AbortSignal>(); const finish = deferred<boolean>();
  const saving = session.save(1, async (signal) => { started.resolve(signal); return finish.promise; });
  const signal = await started.promise;
  beginAccountOwnerTransition("b"); expect(signal.aborted).toBe(true);
  finish.resolve(false); await saving; session.stop();
});

test("a late successful ON write cannot overtake a newer OFF action", async () => {
  const changes = jest.fn(); const session = createChatAutosaveSession("a", () => 0, changes);
  await session.hydrate();
  const held = deferred<{ error: Error | null }>();
  mockWrite.mockImplementationOnce(() => held.promise);
  const grant = savePrivacyPrefs("a", { ...mockPrefs, chat_autosave: true });
  await new Promise<void>((resolve) => setImmediate(resolve));
  await savePrivacyPrefs("a", { ...mockPrefs, chat_autosave: false });
  held.resolve({ error: null }); await grant;
  const keep = jest.fn(); expect(await session.save(1, keep)).toBe(false);
  expect(changes.mock.calls.some(([enabled]) => enabled === true)).toBe(false);
  session.stop();
});

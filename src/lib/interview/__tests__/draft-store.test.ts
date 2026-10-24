import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { inspect } from "node:util";

const mockFenceValues = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => mockFenceValues.get(key) ?? null,
    setItem: async (key: string, value: string) => { mockFenceValues.set(key, value); },
  },
}));

import {
  __resetAccountEpochForTests, beginAccountOwnerTransition, clearAccountTransition,
  currentAccountEpoch, noteResolvedOwner,
} from "../../auth/account-epoch";
import {
  __resetAccountLocalDeletionFencesForTests, installAccountLocalDeletionFence,
} from "../../account/local-deletion-fence";
import {
  createEncryptedNativeStorage, type EncryptedNativeStorageDependencies,
} from "../../storage/encrypted-native-storage";
import {
  decodeInterviewDraft, interviewDraftKey, INTERVIEW_DRAFT_MAX_BYTES,
  INTERVIEW_DRAFT_TTL_MS, type InterviewDraftContent,
} from "../draft-codec";
import { createInterviewDraftStore, interviewDraftsForOwner, type InterviewDraftResult } from "../draft-store";
import { createInterviewSnapshotStore, interviewSnapshotKey, interviewSnapshotsForOwner,
  type InterviewSnapshotContent, type InterviewSnapshotResult } from "../draft-snapshot-store";
import { encodeInterviewDraftSnapshot, type InterviewDraftSnapshot } from "../draft-snapshot";
import { prepareInterviewDraftRestore } from "../draft-restore";
import { emptyCoverage } from "../probe";

jest.mock("../../llm/boundary", () => ({ callLlm: jest.fn(() => { throw new Error("model I/O forbidden"); }) }));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function harness() {
  const values = new Map<string, string>();
  const secrets = new Map<string, string>();
  const dependencies: EncryptedNativeStorageDependencies = {
    backing: {
      getItem: jest.fn(async (key) => values.get(key) ?? null),
      setItem: jest.fn(async (key, value) => { values.set(key, value); }),
      removeItem: jest.fn(async (key) => { values.delete(key); }),
      getAllKeys: async () => [...values.keys()],
    },
    secrets: {
      getItem: async (key) => secrets.get(key) ?? null,
      setItem: async (key, value) => { secrets.set(key, value); },
      removeItem: async (key) => { secrets.delete(key); },
    },
    // Real AES-256-GCM under the production encrypted-storage module. Native
    // SecureStore/Expo binding behavior still requires device verification.
    crypto: {
      generateKey: async () => randomBytes(32).toString("base64"),
      fingerprintKey: async (key) => createHash("sha256").update(key).digest("hex"),
      encrypt: async (plaintext, key, aad) => {
        const iv = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "base64"), iv);
        cipher.setAAD(Buffer.from(aad));
        const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
        return Buffer.concat([iv, encrypted, cipher.getAuthTag()]).toString("base64");
      },
      decrypt: async (sealed, key, aad) => {
        const bytes = Buffer.from(sealed, "base64");
        const decipher = createDecipheriv("aes-256-gcm", Buffer.from(key, "base64"), bytes.subarray(0, 12));
        decipher.setAAD(Buffer.from(aad));
        decipher.setAuthTag(bytes.subarray(-16));
        return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString("utf8");
      },
    },
  };
  let time = 1_800_000_000_000;
  let storage = createEncryptedNativeStorage(dependencies);
  const makeStore = () => createInterviewDraftStore({ storage: () => storage, now: () => time, newId: randomUUID });
  let generation = "generation-1";
  let contentEpoch = 0;
  let contentStatus: "confirmed" | "unconfirmed" | "wipe-pending" = "confirmed";
  let checkHook: (() => void) | null = null;
  const makeSnapshots = () => createInterviewSnapshotStore({ storage: () => storage, now: () => time, newId: randomUUID,
    contentLease: () => {
      const captured = contentEpoch;
      return { generation, check: () => {
        const result = contentStatus !== "confirmed" ? "unconfirmed" : captured === contentEpoch ? "current" : "stale";
        checkHook?.(); // Exercises a reentrant provider, not just a passive boolean mock.
        return result;
      } };
    } });
  return {
    values, secrets, dependencies, store: makeStore(), snapshots: makeSnapshots(), storage,
    now: () => time,
    advance: (amount: number) => { time += amount; },
    restart: () => { storage = createEncryptedNativeStorage(dependencies); return makeStore(); },
    restartSnapshots: () => { storage = createEncryptedNativeStorage(dependencies); return makeSnapshots(); },
    setContent: (next: string, status: typeof contentStatus = "confirmed") => { generation = next; contentStatus = status; contentEpoch += 1; },
    onContentCheck: (hook: typeof checkHook) => { checkHook = hook; },
  };
}

const content = (): InterviewDraftContent => ({
  period: "now", locale: "ko", growthOrigin: false, phase: "active", draft: "private unfinished answer",
  turns: [
    { role: "interviewer", text: "synthetic question", layer: "fact", sceneStart: true },
    { role: "user", text: "neutral synthetic answer", answered: null },
    { role: "user", text: "miss", answered: false },
    { role: "user", text: "pending", unsettled: true },
  ],
});

function draftOf(result: InterviewDraftResult) {
  if (result.status !== "ready") throw new Error(`expected ready, got ${result.status}`);
  return result.draft;
}

test.each([undefined, false, true])("T37 v1 storage roundtrip preserves old and marked answers: %s", async fromOpener => {
  const h = harness(); const input = content();
  input.turns[1] = { ...input.turns[1]!, ...(fromOpener === undefined ? {} : { fromOpener }) };
  const created = draftOf(await h.store.forOwner("owner-a").create(input));
  expect(draftOf(await h.restart().forOwner("owner-a").load()).turns).toEqual(created.turns);
  expect(created.turns).toEqual(input.turns);
});

function owner(value: string | null) {
  noteResolvedOwner(value);
  clearAccountTransition(currentAccountEpoch());
}

test.each([1, 2])("T37 v%s encrypted restart preserves an unsent chip selection", async version => {
  const h = harness();
  const turns = [{ role: "interviewer" as const, text: "Original question?", layer: "fact" as const }];
  const draft = "Unedited candidate";
  const openerSelection = { questionIndex: 0, questionText: turns[0].text, openerIndex: 0, text: draft };
  if (version === 1) {
    const first = draftOf(await h.store.forOwner("owner-a").create({ ...content(), turns, draft, openerSelection }));
    const loaded = draftOf(await h.restart().forOwner("owner-a").load());
    expect(loaded).toEqual(first); expect(loaded.openerSelection).toEqual(openerSelection);
  } else {
    const input = snapshotContent();
    Object.assign(input.state, { turns, draft, openerSelection, openers: [draft] });
    const first = snapshotOf(await h.snapshots.forOwner("owner-a").create(input));
    const loaded = snapshotOf(await h.restartSnapshots().forOwner("owner-a").load());
    expect(loaded).toEqual(first); expect(loaded.state.openerSelection).toEqual(openerSelection);
  }
});

const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
beforeEach(() => {
  __resetAccountEpochForTests();
  __resetAccountLocalDeletionFencesForTests();
  mockFenceValues.clear();
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { product: "ReactNative" } });
  owner("owner-a");
});
afterAll(() => {
  if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
  else delete (globalThis as { navigator?: unknown }).navigator;
});

test("real AES-GCM persists across adapter restart and preserves neutral/false/missing verdicts", async () => {
  const h = harness();
  const draft = draftOf(await h.store.forOwner("owner-a").create(content()));
  const raw = h.values.get(interviewDraftKey("owner-a"))!;
  expect(raw).toMatch(/^SBENC1:/);
  expect(raw).not.toContain("private unfinished answer");
  expect(raw).not.toContain("neutral synthetic answer");
  const restored = draftOf(await h.restart().forOwner("owner-a").load());
  expect(restored).toEqual(draft);
  expect(restored.turns.map((turn) => turn.answered)).toEqual([undefined, null, false, undefined]);
});

test("reads and edits preserve the original seven-day deadline; exact expiry deletes without revival", async () => {
  const h = harness();
  const access = h.store.forOwner("owner-a");
  const first = draftOf(await access.create(content()));
  h.advance(INTERVIEW_DRAFT_TTL_MS - 1);
  const loaded = draftOf(await access.load());
  expect(loaded.expiresAt).toBe(first.createdAt + INTERVIEW_DRAFT_TTL_MS);
  const edited = draftOf(await access.replace(first, { ...content(), draft: "edited" }));
  expect(edited.expiresAt).toBe(first.expiresAt);
  expect(edited.revision).toBe(2);
  h.advance(1);
  await expect(access.load()).resolves.toEqual({ status: "expired" });
  expect(h.values.has(interviewDraftKey("owner-a"))).toBe(false);
  await expect(access.replace(edited, content())).resolves.toEqual({ status: "conflict" });
  await expect(access.create(content())).resolves.toEqual({ status: "conflict" });
});

test("expired deletion failure is unconfirmed, never returned as a readable draft", async () => {
  const h = harness();
  const access = h.store.forOwner("owner-a");
  await access.create(content());
  h.advance(INTERVIEW_DRAFT_TTL_MS);
  jest.mocked(h.dependencies.backing.removeItem).mockRejectedValueOnce(new Error("private failure detail"));
  await expect(access.load()).resolves.toEqual({ status: "unconfirmed" });
  await expect(access.load()).resolves.toEqual({ status: "expired" });
});

test("clock rollback does not extend retention", async () => {
  const h = harness();
  const access = h.store.forOwner("owner-a");
  await access.create(content());
  h.advance(-1);
  await expect(access.load()).resolves.toEqual({ status: "expired" });
});

test("tampered ciphertext, a swapped owner key and wrong-owner envelope all fail closed", async () => {
  const h = harness();
  const first = draftOf(await h.store.forOwner("owner-a").create(content()));
  const raw = h.values.get(interviewDraftKey("owner-a"))!;
  h.values.set(interviewDraftKey("owner-b"), raw);
  owner("owner-b");
  await expect(h.store.forOwner("owner-b").load()).resolves.toEqual({ status: "unconfirmed" });
  owner("owner-a");
  const corrupted = Buffer.from(raw.slice("SBENC1:".length), "base64");
  corrupted[20] ^= 1;
  h.values.set(interviewDraftKey("owner-a"), `SBENC1:${corrupted.toString("base64")}`);
  await expect(h.store.forOwner("owner-a").load()).resolves.toEqual({ status: "unconfirmed" });
  expect(() => decodeInterviewDraft(JSON.stringify(first), "owner-b")).toThrow("interview_draft_invalid");
});

test("unknown version/fields and oversized content fail without writing or leaking an error", async () => {
  const h = harness();
  const access = h.store.forOwner("owner-a");
  await expect(access.create({ ...content(), draft: "x".repeat(INTERVIEW_DRAFT_MAX_BYTES) }))
    .resolves.toEqual({ status: "unconfirmed" });
  await expect(access.create({ ...content(), token: "secret" } as InterviewDraftContent))
    .resolves.toEqual({ status: "unconfirmed" });
  expect(h.values.has(interviewDraftKey("owner-a"))).toBe(false);
  const first = draftOf(await access.create(content()));
  await h.storage.setItem(interviewDraftKey("owner-a"), JSON.stringify({ ...first, v: 2 }));
  await expect(access.load()).resolves.toEqual({ status: "unconfirmed" });
});

test("unknown/null auth retains native ciphertext but prevents exposure and invalidates old ABA access", async () => {
  const h = harness();
  const access = h.store.forOwner("owner-a");
  const first = draftOf(await access.create(content()));
  const raw = h.values.get(interviewDraftKey("owner-a"));
  owner(null); // AuthContext also publishes this on unknown session, not only logout.
  await expect(access.load()).resolves.toEqual({ status: "stale" });
  expect(h.values.get(interviewDraftKey("owner-a"))).toBe(raw);
  owner("owner-b");
  await expect(h.store.forOwner("owner-b").load()).resolves.toEqual({ status: "empty" });
  owner("owner-a");
  await expect(access.replace(first, content())).resolves.toEqual({ status: "stale" });
  expect(draftOf(await h.store.forOwner("owner-a").load())).toEqual(first);
});

test("pre-publication hold invalidates access before the new owner is exposed", async () => {
  const h = harness();
  const access = h.store.forOwner("owner-a");
  beginAccountOwnerTransition("owner-b");
  await expect(access.create(content())).resolves.toEqual({ status: "stale" });
  expect(h.values.size).toBe(0);
});

test("a late in-flight write is rolled back before a fresh A lease can read or edit", async () => {
  const h = harness();
  const access = h.store.forOwner("owner-a");
  const first = draftOf(await access.create(content()));
  const entered = deferred(); const release = deferred();
  const original = h.dependencies.backing.setItem;
  let intercept = true;
  jest.mocked(h.dependencies.backing.setItem).mockImplementation(async (key, value) => {
    if (intercept && key === interviewDraftKey("owner-a")) {
      intercept = false; entered.resolve(); await release.promise;
    }
    h.values.set(key, value);
  });
  const late = access.replace(first, { ...content(), draft: "stale write" });
  await entered.promise;
  owner("owner-b"); owner("owner-a");
  const freshLoad = h.store.forOwner("owner-a").load();
  release.resolve();
  await expect(late).resolves.toEqual({ status: "stale" });
  expect(draftOf(await freshLoad)).toEqual(first);
  expect(original).toHaveBeenCalled();
});

test("a late read never publishes A's text after account change", async () => {
  const h = harness();
  const access = h.store.forOwner("owner-a");
  await access.create(content());
  const entered = deferred(); const release = deferred();
  jest.mocked(h.dependencies.backing.getItem).mockImplementationOnce(async (key) => {
    entered.resolve(); await release.promise; return h.values.get(key) ?? null;
  });
  const pending = access.load();
  await entered.promise; owner("owner-b"); release.resolve();
  await expect(pending).resolves.toEqual({ status: "stale" });
});

test("stale discard/save acknowledgements cannot delete or overwrite a newer revision or new draft", async () => {
  const h = harness();
  const access = h.store.forOwner("owner-a");
  const first = draftOf(await access.create(content()));
  const second = draftOf(await access.replace(first, { ...content(), draft: "newer" }));
  await expect(access.discard(first)).resolves.toEqual({ status: "conflict" });
  await expect(access.replace(first, content())).resolves.toEqual({ status: "conflict" });
  await expect(access.discard(second)).resolves.toEqual({ status: "discarded" });
  const fresh = h.store.forOwner("owner-a");
  const newDraft = draftOf(await fresh.create(content()));
  expect(newDraft.draftId).not.toBe(first.draftId);
  await expect(access.discard(first)).resolves.toEqual({ status: "conflict" });
  expect(draftOf(await fresh.load())).toEqual(newDraft);
});

test("a queued edit snapshots caller input and does not resurrect after a preceding discard", async () => {
  const h = harness();
  const access = h.store.forOwner("owner-a");
  const first = draftOf(await access.create(content()));
  const input = content();
  const edit = access.replace(first, input);
  input.draft = "mutated outside";
  const edited = draftOf(await edit);
  expect(edited.draft).toBe("private unfinished answer");
  const discard = access.discard(edited);
  const late = access.replace(edited, input);
  await expect(discard).resolves.toEqual({ status: "discarded" });
  await expect(late).resolves.toEqual({ status: "conflict" });
});

test("a slow physical discard finishes before a fresh draft can be created", async () => {
  const h = harness();
  const access = h.store.forOwner("owner-a");
  const first = draftOf(await access.create(content()));
  const entered = deferred(); const release = deferred();
  jest.mocked(h.dependencies.backing.removeItem).mockImplementationOnce(async (key) => {
    entered.resolve(); await release.promise; h.values.delete(key);
  });
  const discard = access.discard(first);
  await entered.promise;
  const fresh = h.store.forOwner("owner-a");
  const create = fresh.create({ ...content(), draft: "new conversation" });
  release.resolve();
  await expect(discard).resolves.toEqual({ status: "discarded" });
  const next = draftOf(await create);
  expect(next.draftId).not.toBe(first.draftId);
  expect(draftOf(await fresh.load())).toEqual(next);
});

test("failed storage write has no plaintext fallback and retries keep the first-attempt deadline", async () => {
  const h = harness();
  const access = h.store.forOwner("owner-a");
  const start = h.now();
  jest.mocked(h.dependencies.backing.setItem).mockImplementation(async (key, value) => {
    if (key === interviewDraftKey("owner-a")) throw new Error("private disk details");
    h.values.set(key, value);
  });
  await expect(access.create(content())).resolves.toEqual({ status: "unconfirmed" });
  expect(h.values.has(interviewDraftKey("owner-a"))).toBe(false);
  h.advance(123_456);
  jest.mocked(h.dependencies.backing.setItem).mockImplementation(async (key, value) => { h.values.set(key, value); });
  const draft = draftOf(await access.create(content()));
  expect(draft.createdAt).toBe(start);
  expect(draft.expiresAt).toBe(start + INTERVIEW_DRAFT_TTL_MS);
});

test("failed rollback blocks subsequent reads until repaired, and expired previous text is never restored", async () => {
  const h = harness();
  const access = h.store.forOwner("owner-a");
  const first = draftOf(await access.create(content()));
  const entered = deferred(); const release = deferred();
  let writes = 0;
  jest.mocked(h.dependencies.backing.setItem).mockImplementation(async (key, value) => {
    if (key === interviewDraftKey("owner-a")) {
      writes += 1;
      if (writes === 1) { entered.resolve(); await release.promise; }
      else throw new Error("disk unavailable during rollback");
    }
    h.values.set(key, value);
  });
  const late = access.replace(first, { ...content(), draft: "unconfirmed late text" });
  await entered.promise;
  owner(null); owner("owner-a");
  release.resolve();
  await expect(late).resolves.toEqual({ status: "unconfirmed" });
  const fresh = h.store.forOwner("owner-a");
  await expect(fresh.load()).resolves.toEqual({ status: "unconfirmed" });
  h.advance(INTERVIEW_DRAFT_TTL_MS);
  await expect(fresh.load()).resolves.toEqual({ status: "empty" });
  expect(h.values.has(interviewDraftKey("owner-a"))).toBe(false);
});

test("a failed first attempt cannot be retried after its fixed seven-day deadline", async () => {
  const h = harness();
  const access = h.store.forOwner("owner-a");
  jest.mocked(h.dependencies.backing.setItem).mockImplementation(async (key, value) => {
    if (key === interviewDraftKey("owner-a")) throw new Error("disk unavailable");
    h.values.set(key, value);
  });
  await expect(access.create(content())).resolves.toEqual({ status: "unconfirmed" });
  h.advance(INTERVIEW_DRAFT_TTL_MS);
  jest.mocked(h.dependencies.backing.setItem).mockImplementation(async (key, value) => { h.values.set(key, value); });
  await expect(access.create(content())).resolves.toEqual({ status: "expired" });
  expect(h.values.has(interviewDraftKey("owner-a"))).toBe(false);
});

test("lost device key does not create a replacement or fall back to a readable body", async () => {
  const h = harness();
  await h.store.forOwner("owner-a").create(content());
  const raw = h.values.get(interviewDraftKey("owner-a"));
  h.secrets.clear();
  await expect(h.restart().forOwner("owner-a").load()).resolves.toEqual({ status: "unconfirmed" });
  expect(h.secrets.size).toBe(0);
  expect(h.values.get(interviewDraftKey("owner-a"))).toBe(raw);
});

test("terminal deletion fences a running write, waits for cleanup and never removes B's draft", async () => {
  const h = harness();
  owner("owner-b");
  await h.store.forOwner("owner-b").create({ ...content(), draft: "B only" });
  owner("owner-a");
  const access = h.store.forOwner("owner-a");
  const entered = deferred(); const release = deferred();
  jest.mocked(h.dependencies.backing.setItem).mockImplementation(async (key, value) => {
    if (key === interviewDraftKey("owner-a")) { entered.resolve(); await release.promise; }
    h.values.set(key, value);
  });
  const write = access.create(content());
  await entered.promise;
  const deletion = installAccountLocalDeletionFence("owner-a").then(() => h.store.purgeDeletedOwner("owner-a"));
  release.resolve();
  await expect(write).resolves.toEqual({ status: "stale" });
  await expect(deletion).resolves.toBe(true);
  expect(h.values.has(interviewDraftKey("owner-a"))).toBe(false);
  await expect(access.create(content())).resolves.toEqual({ status: "stale" });
  owner("owner-b");
  expect(draftOf(await h.store.forOwner("owner-b").load()).draft).toBe("B only");
});

test("terminal purge requires its irreversible fence and reports remove failure", async () => {
  const h = harness();
  await h.store.forOwner("owner-a").create(content());
  await expect(h.store.purgeDeletedOwner("owner-a")).resolves.toBe(false);
  await installAccountLocalDeletionFence("owner-a");
  jest.mocked(h.dependencies.backing.removeItem).mockRejectedValueOnce(new Error("disk unavailable"));
  await expect(h.store.purgeDeletedOwner("owner-a")).resolves.toBe(false);
  await expect(h.store.purgeDeletedOwner("owner-a")).resolves.toBe(true);
});

test("web support is explicitly pending and never silently uses plaintext localStorage", async () => {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
  await expect(interviewDraftsForOwner("owner-a").create(content())).resolves.toEqual({ status: "unsupported" });
  await expect(interviewDraftsForOwner("owner-a").load()).resolves.toEqual({ status: "unsupported" });
});

const deliveryCases = (["load", "create", "replace", "discard"] as const)
  .flatMap((operation) => (["switch", "aba", "deletion"] as const).map((transition) => [operation, transition] as const));

test.each(deliveryCases)("public Promise %s rejects %s before final settlement", async (operation, transition) => {
  let pendingWindows = 0;
  let reachedSettlement = false;
  // Explore every microtask cut up to actual public settlement. The budget is
  // a test safety bound, not a product timing contract or a fixed reproduction tick.
  for (let ticks = 0; ticks < 256; ticks += 1) {
    __resetAccountEpochForTests();
    __resetAccountLocalDeletionFencesForTests();
    mockFenceValues.clear();
    owner("owner-a");
    const h = harness();
    const access = h.store.forOwner("owner-a");
    const first = operation === "create" ? null : draftOf(await access.create(content()));
    const pending = operation === "load" ? access.load()
      : operation === "create" ? access.create(content())
        : operation === "replace" ? access.replace(first!, { ...content(), draft: "replacement" })
          : access.discard(first!);
    for (let tick = 0; tick < ticks; tick += 1) await Promise.resolve();
    // A .then observer can lag a settled Promise by a tick. Inspect the native
    // Promise's state itself; depth 0 never formats the stored body.
    if (!inspect(pending, { depth: 0 }).includes("<pending>")) {
      await pending;
      reachedSettlement = true;
      break;
    }
    pendingWindows += 1;
    const fence = transition === "deletion" ? installAccountLocalDeletionFence("owner-a") : null;
    if (transition !== "deletion") {
      owner("owner-b");
      if (transition === "aba") owner("owner-a");
    }
    const result = await pending;
    if (fence) await fence;
    expect({ ticks, status: result.status }).toEqual({ ticks, status: "stale" });
    expect(result).not.toHaveProperty("draft");
  }
  expect(reachedSettlement).toBe(true);
  expect(pendingWindows).toBeGreaterThan(0);
});

function snapshotContent(): InterviewSnapshotContent {
  const base = emptyCoverage(); base.school.fact = 2;
  const current = emptyCoverage(); current.school.fact = 3;
  return { period: "work", uiLanguage: "es", conversationLocale: "en", growthOrigin: true, pending: null,
    state: { turns: content().turns, draft: "private v2 words", inputRevision: 4, pendingLayer: "fact",
      openers: ["original opener"], stuckStreak: 2, abandoned: ["belief"], concreteOnly: true,
      phase: "active", endReason: null, crisisHotline: null, notice: "drill.dayLimit",
      coverage: { base, current, baseline: "unconfirmed" } } };
}
function snapshotOf(result: InterviewSnapshotResult): InterviewDraftSnapshot {
  if (!("draft" in result)) throw new Error(`expected local snapshot, got ${result.status}`);
  return result.draft;
}

test("v2 uses real AES-GCM and its own namespace/key AAD; v1 bytes and shared device key survive", async () => {
  const h = harness();
  const v1 = draftOf(await h.store.forOwner("owner-a").create(content()));
  const v1raw = h.values.get(interviewDraftKey("owner-a"));
  const secret = [...h.secrets.entries()];
  const input = snapshotContent();
  const pending = h.snapshots.forOwner("owner-a").create(input);
  input.state.draft = "changed after first clone";
  const first = snapshotOf(await pending);
  expect(first.state.draft).toBe("private v2 words");
  expect(h.values.get(interviewSnapshotKey("owner-a"))).toMatch(/^SBENC1:/);
  expect(h.values.get(interviewSnapshotKey("owner-a"))).not.toContain("private v2 words");
  expect(h.values.get(interviewDraftKey("owner-a"))).toBe(v1raw);
  expect([...h.secrets.entries()]).toEqual(secret);
  const loaded = snapshotOf(await h.restartSnapshots().forOwner("owner-a").load());
  expect(loaded).toEqual(first);
  expect(loaded.state.turns.map(turn => turn.answered)).toEqual([undefined, null, false, undefined]);
  expect(Object.hasOwn(loaded.state.turns[3], "answered")).toBe(false);
  const ctx = { ownerId: "owner-a", accountEpoch: currentAccountEpoch(), viewGeneration: 1, inputRevision: 4,
    content: { status: "confirmed" as const, generation: "generation-1" } };
  expect(prepareInterviewDraftRestore(encodeInterviewDraftSnapshot(loaded), ctx, ctx, h.now()))
    .toEqual({ status: "restored", draft: first, next: "resume-choice" });
  expect(draftOf(await h.store.forOwner("owner-a").load())).toEqual(v1);
  h.values.set(interviewSnapshotKey("owner-a"), v1raw!);
  await expect(h.restartSnapshots().forOwner("owner-a").load()).resolves.toEqual({ status: "unconfirmed" });
  expect(h.values.get(interviewDraftKey("owner-a"))).toBe(v1raw);
});

test.each(["ended", "crisis-ended", "request"] as const)("v2 roundtrips %s without model execution or reactivation", async phase => {
  const h = harness(); const input = snapshotContent();
  if (phase === "request") input.pending = { kind: "request", requestId: "request-1", submittedAnswer: "submitted original",
    inputRevision: 4, before: structuredClone(input.state) };
  else Object.assign(input.state, { phase, endReason: phase === "ended" ? "user-stop" : "crisis",
    crisisHotline: phase === "ended" ? null : "KR_1388", pendingLayer: null, openers: [] });
  const first = snapshotOf(await h.snapshots.forOwner("owner-a").create(input));
  const restarted = h.restartSnapshots().forOwner("owner-a");
  expect(snapshotOf(await restarted.load())).toEqual(first);
  if (phase !== "request") await expect(restarted.replace(first, snapshotContent())).resolves.toEqual({ status: "conflict" });
  else {
    const changed = structuredClone(input); changed.pending!.requestId = "replacement-request";
    await expect(restarted.replace(first, changed)).resolves.toEqual({ status: "conflict" });
    expect(snapshotOf(await restarted.load()).pending).toEqual(first.pending);
  }
});

test("v2 serializes revision CAS and clones queued input even when it aliases a returned object", async () => {
  const h = harness(); const access = h.snapshots.forOwner("owner-a");
  const first = snapshotOf(await access.create(snapshotContent()));
  const expected = { draftId: first.draftId, revision: first.revision };
  const gate = deferred(); const entered = deferred(); let held = false;
  jest.mocked(h.dependencies.backing.getItem).mockImplementation(async key => {
    if (key === interviewSnapshotKey("owner-a") && !held) { held = true; entered.resolve(); await gate.promise; }
    return h.values.get(key) ?? null;
  });
  // The input state is the SAME reference returned by create, not a fresh fixture.
  const input = { ...snapshotContent(), state: first.state };
  input.state.draft = "queued original";
  const one = access.replace(first, input);
  const two = access.replace(expected, { ...snapshotContent(), state: { ...snapshotContent().state, draft: "must lose CAS" } });
  await entered.promise;
  first.draftId = "mutated-return"; first.revision = 800;
  first.state.draft = "late mutation"; first.state.coverage.current.school.fact = 900;
  first.state.turns[0].text = "late turn";
  gate.resolve();
  const saved = snapshotOf(await one);
  expect(saved.draftId).toBe(expected.draftId); expect(saved.revision).toBe(2);
  expect(saved.state.draft).toBe("queued original"); expect(saved.state.coverage.current.school.fact).toBe(3);
  expect(saved.state.turns[0].text).toBe("synthetic question");
  await expect(two).resolves.toEqual({ status: "conflict" });
  await expect(access.discard(expected)).resolves.toEqual({ status: "conflict" });
  expect(snapshotOf(await access.load())).toEqual(saved);
  await expect(access.discard(saved)).resolves.toEqual({ status: "discarded" });
  await expect(access.create(snapshotContent())).resolves.toEqual({ status: "conflict" });
  const newer = snapshotOf(await h.snapshots.forOwner("owner-a").create(snapshotContent()));
  expect(newer.draftId).not.toBe(saved.draftId);
  await expect(access.discard(saved)).resolves.toEqual({ status: "conflict" });
  expect(snapshotOf(await h.snapshots.forOwner("owner-a").load())).toEqual(newer);
});

test("v2 immutable pending/unknown intent freezes metadata and has no generic cleanup or resend", async () => {
  const h = harness(); const access = h.snapshots.forOwner("owner-a");
  const first = snapshotOf(await access.create(snapshotContent()));
  const keys = { requestId: "save-original", sessionId: "session-original" };
  const beginning = access.beginSave(first, keys); keys.requestId = "late-replaced-key";
  const pending = snapshotOf(await beginning);
  expect(pending.revision).toBe(2);
  expect(pending.pending).toEqual({ kind: "save", status: "pending", intent: { requestId: "save-original", sessionId: "session-original",
    draftId: first.draftId, revision: 1, contentGeneration: "generation-1", snapshot: first.state } });
  const modifications = [{ period: "school" }, { growthOrigin: false }, { uiLanguage: "pt" }, { conversationLocale: "ko" },
    { state: { ...first.state, draft: "edited after submit" } }, { pending: null }];
  for (const patch of modifications) await expect(access.replace(pending, { ...snapshotContent(), ...patch } as InterviewSnapshotContent))
    .resolves.toEqual({ status: "conflict" });
  await expect(access.discard(pending)).resolves.toEqual({ status: "conflict" });
  await expect(access.beginSave(pending, { requestId: "new-key", sessionId: "new-session" })).resolves.toEqual({ status: "conflict" });
  await expect(access.markSaveUnknown(pending, "different-request")).resolves.toEqual({ status: "conflict" });
  const unknown = snapshotOf(await access.markSaveUnknown(pending, "save-original"));
  expect(unknown.pending).toEqual({ ...pending.pending, status: "unknown" });
  expect(unknown.expiresAt).toBe(first.expiresAt);
  expect(snapshotOf(await h.restartSnapshots().forOwner("owner-a").load())).toEqual(unknown);
  await expect(access.replace(unknown, snapshotContent())).resolves.toEqual({ status: "conflict" });
  await expect(access.discard(unknown)).resolves.toEqual({ status: "conflict" });
  await expect(access.beginSave(unknown, { requestId: "retry", sessionId: "new" })).resolves.toEqual({ status: "conflict" });
  const input = { ...snapshotContent(), pending: unknown.pending } as unknown as InterviewSnapshotContent;
  await expect(access.replace(unknown, input)).resolves.toEqual({ status: "unconfirmed" });
  expect(snapshotOf(await access.load())).toEqual(unknown);
  h.advance(INTERVIEW_DRAFT_TTL_MS);
  await expect(access.load()).resolves.toEqual({ status: "expired" });
  expect(h.values.has(interviewSnapshotKey("owner-a"))).toBe(false);
});

test("v2 production has no authority: valid operations return no body, empty, or success", async () => {
  const access = interviewSnapshotsForOwner("owner-a"); const version = { draftId: "old", revision: 1 };
  for (const action of [() => access.load(), () => access.create(snapshotContent()), () => access.replace(version, snapshotContent()),
    () => access.beginSave(version, { requestId: "r", sessionId: "s" }), () => access.markSaveUnknown(version, "r"), () => access.discard(version)]) {
    await expect(action()).resolves.toEqual({ status: "unconfirmed" });
  }
  expect(mockFenceValues.size).toBe(0);
});

test.each(["unconfirmed", "wipe-pending"] as const)("v2 %s cannot read, seed, or replace even before a body exists", async status => {
  const h = harness(); h.setContent("generation-1", status);
  const access = h.snapshots.forOwner("owner-a");
  await expect(access.load()).resolves.toEqual({ status: "unconfirmed" });
  await expect(access.create(snapshotContent())).resolves.toEqual({ status: "unconfirmed" });
  expect(h.dependencies.backing.getItem).not.toHaveBeenCalled();
  expect(h.values.size).toBe(0);
});

test("v2 same-owner wipe during a write preserves quarantined original words and immutable unknown intent", async () => {
  const h = harness(); const access = h.snapshots.forOwner("owner-a");
  const first = snapshotOf(await access.create(snapshotContent()));
  const pending = snapshotOf(await access.beginSave(first, { requestId: "r", sessionId: "s" }));
  const entered = deferred(); const gate = deferred(); let held = false;
  jest.mocked(h.dependencies.backing.setItem).mockImplementation(async (key, value) => {
    if (key === interviewSnapshotKey("owner-a") && !held) { held = true; entered.resolve(); await gate.promise; }
    h.values.set(key, value);
  });
  const late = access.markSaveUnknown(pending, "r");
  await entered.promise; h.setContent("generation-2", "wipe-pending"); gate.resolve();
  await expect(late).resolves.toEqual({ status: "unconfirmed" });
  await expect(h.restartSnapshots().forOwner("owner-a").load()).resolves.toEqual({ status: "unconfirmed" });
  h.setContent("generation-2");
  const fresh = h.snapshots.forOwner("owner-a");
  await expect(fresh.load()).resolves.toEqual({ status: "quarantined", draft: pending });
  await expect(fresh.replace(pending, snapshotContent())).resolves.toEqual({ status: "conflict" });
  await expect(fresh.discard(pending)).resolves.toEqual({ status: "conflict" });
  await expect(fresh.create(snapshotContent())).resolves.toEqual({ status: "conflict" });
  await expect(access.load()).resolves.toEqual({ status: "stale" });
  expect(snapshotOf(await fresh.load()).expiresAt).toBe(first.expiresAt);
});

test("v2 retries preserve first-attempt TTL, failed expiry removal hides body, and clock rollback cannot extend it", async () => {
  const h = harness(); const access = h.snapshots.forOwner("owner-a"); const start = h.now();
  jest.mocked(h.dependencies.backing.setItem).mockImplementation(async (key, value) => {
    if (key === interviewSnapshotKey("owner-a")) throw new Error("synthetic write failure");
    h.values.set(key, value);
  });
  await expect(access.create(snapshotContent())).resolves.toEqual({ status: "unconfirmed" });
  h.advance(60_000);
  jest.mocked(h.dependencies.backing.setItem).mockImplementation(async (key, value) => { h.values.set(key, value); });
  const first = snapshotOf(await access.create(snapshotContent()));
  expect(first.createdAt).toBe(start); expect(first.expiresAt).toBe(start + INTERVIEW_DRAFT_TTL_MS);
  const edited = snapshotOf(await access.replace(first, snapshotContent())); expect(edited.expiresAt).toBe(first.expiresAt);
  h.advance(INTERVIEW_DRAFT_TTL_MS - 60_001);
  expect(snapshotOf(await h.restartSnapshots().forOwner("owner-a").load())).toEqual(edited);
  h.advance(1);
  jest.mocked(h.dependencies.backing.removeItem).mockRejectedValueOnce(new Error("synthetic remove failure"));
  await expect(access.load()).resolves.toEqual({ status: "unconfirmed" });
  expect(h.values.has(interviewSnapshotKey("owner-a"))).toBe(true);
  await expect(access.load()).resolves.toEqual({ status: "expired" });
  expect(h.values.has(interviewSnapshotKey("owner-a"))).toBe(false);
  const newer = h.snapshots.forOwner("owner-a"); const created = snapshotOf(await newer.create(snapshotContent()));
  h.advance(-1);
  await expect(newer.load()).resolves.toEqual({ status: "expired" });
  expect(h.now()).toBe(created.createdAt - 1);
});

test("v2 failed rollback remains unconfirmed until repaired and never restores expired text", async () => {
  const h = harness(); const access = h.snapshots.forOwner("owner-a");
  const first = snapshotOf(await access.create(snapshotContent()));
  const entered = deferred(); const gate = deferred(); let writes = 0;
  jest.mocked(h.dependencies.backing.setItem).mockImplementation(async (key, value) => {
    if (key === interviewSnapshotKey("owner-a")) {
      writes += 1;
      if (writes === 1) { entered.resolve(); await gate.promise; }
      else throw new Error("synthetic rollback failure");
    }
    h.values.set(key, value);
  });
  const late = access.replace(first, { ...snapshotContent(), state: { ...first.state, draft: "unconfirmed late words" } });
  await entered.promise; owner(null); owner("owner-a"); gate.resolve();
  await expect(late).resolves.toEqual({ status: "unconfirmed" });
  const fresh = h.snapshots.forOwner("owner-a");
  await expect(fresh.load()).resolves.toEqual({ status: "unconfirmed" });
  h.advance(INTERVIEW_DRAFT_TTL_MS);
  await expect(fresh.load()).resolves.toEqual({ status: "empty" });
  expect(h.values.has(interviewSnapshotKey("owner-a"))).toBe(false);
});

test("v2 cannot restart a failed create after its original deadline or fall back from unsupported storage", async () => {
  const h = harness(); const access = h.snapshots.forOwner("owner-a");
  jest.mocked(h.dependencies.backing.setItem).mockImplementation(async (key, value) => {
    if (key === interviewSnapshotKey("owner-a")) throw new Error("synthetic write failure");
    h.values.set(key, value);
  });
  await expect(access.create(snapshotContent())).resolves.toEqual({ status: "unconfirmed" });
  h.advance(INTERVIEW_DRAFT_TTL_MS);
  jest.mocked(h.dependencies.backing.setItem).mockImplementation(async (key, value) => { h.values.set(key, value); });
  await expect(access.create(snapshotContent())).resolves.toEqual({ status: "expired" });
  expect(h.values.has(interviewSnapshotKey("owner-a"))).toBe(false);
  const absent = createInterviewSnapshotStore({ storage: () => null, now: h.now, newId: randomUUID,
    contentLease: () => ({ generation: "test-only", check: () => "current" }) }).forOwner("owner-a");
  await expect(absent.load()).resolves.toEqual({ status: "unsupported" });
  await expect(absent.create(snapshotContent())).resolves.toEqual({ status: "unsupported" });
});

test("v2 owner/AAD substitution, lost key and oversized input never become readable drafts", async () => {
  const h = harness(); const access = h.snapshots.forOwner("owner-a");
  const oversized = snapshotContent(); oversized.state.draft = "x".repeat(INTERVIEW_DRAFT_MAX_BYTES);
  await expect(access.create(oversized)).resolves.toEqual({ status: "unconfirmed" });
  const first = snapshotOf(await access.create(snapshotContent()));
  const raw = h.values.get(interviewSnapshotKey("owner-a"))!;
  h.values.set(interviewSnapshotKey("owner-b"), raw); owner("owner-b");
  await expect(h.snapshots.forOwner("owner-b").load()).resolves.toEqual({ status: "unconfirmed" });
  owner("owner-a");
  await h.storage.setItem(interviewSnapshotKey("owner-a"), encodeInterviewDraftSnapshot({ ...first, ownerId: "owner-b" }));
  await expect(h.snapshots.forOwner("owner-a").load()).resolves.toEqual({ status: "unconfirmed" });
  h.values.set(interviewSnapshotKey("owner-a"), raw); h.secrets.clear();
  await expect(h.restartSnapshots().forOwner("owner-a").load()).resolves.toEqual({ status: "unconfirmed" });
  expect(h.secrets.size).toBe(0); expect(h.values.get(interviewSnapshotKey("owner-a"))).toBe(raw);
});

test("v2 native null auth retains ciphertext; terminal purge joins late writes and preserves both B namespaces", async () => {
  const h = harness();
  owner("owner-b"); await h.store.forOwner("owner-b").create(content()); await h.snapshots.forOwner("owner-b").create(snapshotContent());
  const other = [h.values.get(interviewDraftKey("owner-b")), h.values.get(interviewSnapshotKey("owner-b"))];
  owner("owner-a"); await h.store.forOwner("owner-a").create(content());
  const access = h.snapshots.forOwner("owner-a"); const first = snapshotOf(await access.create(snapshotContent()));
  const raw = h.values.get(interviewSnapshotKey("owner-a")); owner(null);
  await expect(access.load()).resolves.toEqual({ status: "stale" }); expect(h.values.get(interviewSnapshotKey("owner-a"))).toBe(raw);
  owner("owner-a"); const fresh = h.snapshots.forOwner("owner-a"); expect(snapshotOf(await fresh.load())).toEqual(first);
  const entered = deferred(); const gate = deferred(); let held = false;
  jest.mocked(h.dependencies.backing.setItem).mockImplementation(async (key, value) => {
    if (key === interviewSnapshotKey("owner-a") && !held) { held = true; entered.resolve(); await gate.promise; }
    h.values.set(key, value);
  });
  const late = fresh.replace(first, snapshotContent()); await entered.promise;
  const deleting = installAccountLocalDeletionFence("owner-a").then(() => Promise.all([
    h.store.purgeDeletedOwner("owner-a"), h.snapshots.purgeDeletedOwner("owner-a"),
  ]));
  gate.resolve(); await expect(late).resolves.toEqual({ status: "stale" }); await expect(deleting).resolves.toEqual([true, true]);
  expect(h.values.has(interviewDraftKey("owner-a"))).toBe(false); expect(h.values.has(interviewSnapshotKey("owner-a"))).toBe(false);
  expect([h.values.get(interviewDraftKey("owner-b")), h.values.get(interviewSnapshotKey("owner-b"))]).toEqual(other);
});

test("v2 terminal purge requires its fence, handles remove failure and needs neither a key nor generation authority", async () => {
  const h = harness(); await h.snapshots.forOwner("owner-a").create(snapshotContent());
  const noAuthority = createInterviewSnapshotStore({ storage: () => h.storage, now: h.now, newId: randomUUID, contentLease: () => null });
  await expect(noAuthority.purgeDeletedOwner("owner-a")).resolves.toBe(false);
  await installAccountLocalDeletionFence("owner-a"); h.secrets.clear();
  jest.mocked(h.dependencies.backing.removeItem).mockRejectedValueOnce(new Error("synthetic removal failure"));
  await expect(noAuthority.purgeDeletedOwner("owner-a")).resolves.toBe(false);
  await expect(noAuthority.purgeDeletedOwner("owner-a")).resolves.toBe(true);
  expect(h.values.has(interviewSnapshotKey("owner-a"))).toBe(false); expect(h.secrets.size).toBe(0);
});

const snapshotOperations = ["load", "empty", "create", "replace", "discard", "beginSave", "markSaveUnknown"] as const;
type SnapshotOperation = typeof snapshotOperations[number];
async function snapshotAction(h: ReturnType<typeof harness>, operation: SnapshotOperation) {
  const access = h.snapshots.forOwner("owner-a");
  let first = ["create", "empty"].includes(operation) ? null : snapshotOf(await access.create(snapshotContent()));
  if (operation === "markSaveUnknown") first = snapshotOf(await access.beginSave(first!, { requestId: "r", sessionId: "s" }));
  return () => operation === "load" || operation === "empty" ? access.load()
    : operation === "create" ? access.create(snapshotContent()) : operation === "replace" ? access.replace(first!, snapshotContent())
      : operation === "discard" ? access.discard(first!) : operation === "beginSave" ? access.beginSave(first!, { requestId: "r", sessionId: "s" })
        : access.markSaveUnknown(first!, "r");
}
const snapshotDeliveryCases = snapshotOperations.flatMap(operation =>
  (["switch", "aba", "wipe", "wipe-pending", "deletion"] as const).map(transition => [operation, transition] as const));
test.each(snapshotDeliveryCases)("v2 public Promise %s rejects %s at every unsettled microtask cut", async (operation, transition) => {
  let pendingWindows = 0; let settled = false;
  for (let ticks = 0; ticks < 256; ticks += 1) {
    __resetAccountEpochForTests(); __resetAccountLocalDeletionFencesForTests(); mockFenceValues.clear(); owner("owner-a");
    const h = harness(); const action = await snapshotAction(h, operation); const pending = action();
    for (let tick = 0; tick < ticks; tick += 1) await Promise.resolve();
    if (!inspect(pending, { depth: 0 }).includes("<pending>")) { await pending; settled = true; break; }
    pendingWindows += 1;
    const fence = transition === "deletion" ? installAccountLocalDeletionFence("owner-a") : null;
    if (transition === "wipe" || transition === "wipe-pending") h.setContent("generation-2", transition === "wipe" ? "confirmed" : "wipe-pending");
    if (transition === "switch" || transition === "aba") { owner("owner-b"); if (transition === "aba") owner("owner-a"); }
    const result = await pending; if (fence) await fence;
    expect({ ticks, status: result.status }).toEqual({ ticks, status: transition === "wipe-pending" ? "unconfirmed" : "stale" });
    expect(result).not.toHaveProperty("draft");
  }
  expect(settled).toBe(true); expect(pendingWindows).toBeGreaterThan(0);
});

test.each(["load", "create", "beginSave"] as const)("v2 %s rejects reentrant owner publication inside every content check including final settlement", async operation => {
  let checkedWindows = 0;
  for (let cut = 1; cut < 64; cut += 1) {
    __resetAccountEpochForTests(); __resetAccountLocalDeletionFencesForTests(); mockFenceValues.clear(); owner("owner-a");
    const h = harness(); const action = await snapshotAction(h, operation); let checks = 0;
    h.onContentCheck(() => { checks += 1; if (checks === cut) { owner("owner-b"); owner("owner-a"); } });
    const result = await action();
    if (checks < cut) { expect(["loaded", "stored"]).toContain(result.status); break; }
    checkedWindows += 1; expect(result).toEqual({ status: "stale" });
  }
  expect(checkedWindows).toBeGreaterThan(3);
});

const finalTimeCases = (["load", "create", "replace", "beginSave", "markSaveUnknown", "quarantined"] as const)
  .flatMap(operation => (["expiry", "rollback", "invalid"] as const).map(clock => [operation, clock] as const));
test.each(finalTimeCases)("v2 final time guard: %s hides bodies and success across %s at every pending cut", async (operation, clock) => {
  let settled = false; let lateUnconfirmed = 0;
  for (let ticks = 0; ticks < 256; ticks += 1) {
    __resetAccountEpochForTests(); __resetAccountLocalDeletionFencesForTests(); mockFenceValues.clear(); owner("owner-a");
    const h = harness();
    let action = await snapshotAction(h, operation === "quarantined" ? "load" : operation);
    if (operation === "quarantined") { h.setContent("generation-2"); action = () => h.snapshots.forOwner("owner-a").load(); }
    if (clock === "expiry" && operation !== "create") h.advance(INTERVIEW_DRAFT_TTL_MS - 1);
    const pending = action();
    for (let tick = 0; tick < ticks; tick += 1) await Promise.resolve();
    if (!inspect(pending, { depth: 0 }).includes("<pending>")) { await pending; settled = true; break; }
    h.advance(clock === "invalid" ? Number.NaN : clock === "rollback" ? -1 : operation === "create" ? INTERVIEW_DRAFT_TTL_MS : 1);
    const result = await pending;
    expect(result).not.toHaveProperty("draft");
    expect(["expired", "unconfirmed"]).toContain(result.status);
    if (result.status === "unconfirmed" && h.values.has(interviewSnapshotKey("owner-a"))) lateUnconfirmed += 1;
  }
  expect(settled).toBe(true);
  // Must reach the final return gap, not only the earlier read/write expiration checks.
  expect(lateUnconfirmed).toBeGreaterThan(0);
});

test("v2 final expiry leaves cleanup unconfirmed; failed and queued cleanup cannot delete a new draft", async () => {
  let retained: { h: ReturnType<typeof harness>; first: InterviewDraftSnapshot } | undefined;
  for (let ticks = 0; ticks < 256; ticks += 1) {
    __resetAccountEpochForTests(); __resetAccountLocalDeletionFencesForTests(); mockFenceValues.clear(); owner("owner-a");
    const h = harness(); const access = h.snapshots.forOwner("owner-a");
    const first = snapshotOf(await access.create(snapshotContent())); h.advance(INTERVIEW_DRAFT_TTL_MS - 1);
    const pending = access.load();
    for (let tick = 0; tick < ticks; tick += 1) await Promise.resolve();
    if (!inspect(pending, { depth: 0 }).includes("<pending>")) { await pending; break; }
    h.advance(1);
    const result = await pending;
    if (result.status === "unconfirmed" && h.values.has(interviewSnapshotKey("owner-a"))) { retained = { h, first }; break; }
  }
  expect(retained).toBeDefined();
  if (!retained) throw new Error("missing final expiry gap");
  const { h, first } = retained;
  expect(h.dependencies.backing.removeItem).not.toHaveBeenCalled(); // No unacknowledged background cleanup.
  const raw = h.values.get(interviewSnapshotKey("owner-a"));
  expect(JSON.parse((await h.storage.getItem(interviewSnapshotKey("owner-a")))!)).toEqual(first);
  jest.mocked(h.dependencies.backing.removeItem).mockRejectedValueOnce(new Error("synthetic expiry removal failure"));
  await expect(h.snapshots.forOwner("owner-a").load()).resolves.toEqual({ status: "unconfirmed" });
  expect(h.values.get(interviewSnapshotKey("owner-a"))).toBe(raw);
  const entered = deferred(); const release = deferred();
  jest.mocked(h.dependencies.backing.removeItem).mockImplementation(async key => {
    if (key === interviewSnapshotKey("owner-a")) { entered.resolve(); await release.promise; }
    h.values.delete(key);
  });
  const cleanup = h.snapshots.forOwner("owner-a").load(); await entered.promise;
  const newer = h.snapshots.forOwner("owner-a").create(snapshotContent());
  release.resolve(); await expect(cleanup).resolves.toEqual({ status: "expired" });
  const saved = snapshotOf(await newer);
  expect(saved.draftId).not.toBe(first.draftId); expect(saved.createdAt).toBe(first.expiresAt);
  expect(saved.expiresAt).toBe(saved.createdAt + INTERVIEW_DRAFT_TTL_MS);
  const fresh = h.snapshots.forOwner("owner-a");
  await expect(fresh.discard(first)).resolves.toEqual({ status: "conflict" });
  expect(snapshotOf(await fresh.load())).toEqual(saved);
});

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";

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
  return {
    values, secrets, dependencies, store: makeStore(), storage,
    now: () => time,
    advance: (amount: number) => { time += amount; },
    restart: () => { storage = createEncryptedNativeStorage(dependencies); return makeStore(); },
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

function owner(value: string | null) {
  noteResolvedOwner(value);
  clearAccountTransition(currentAccountEpoch());
}

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

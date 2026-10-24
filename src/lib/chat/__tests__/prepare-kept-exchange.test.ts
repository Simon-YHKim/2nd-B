import { createChatSessionRegistry } from "../session-registry";
import { prepareKeptExchange, type KeptExchangePreparation } from "../prepare-kept-exchange";
import { CHAT_KEEP_TAG, KEEP_MAX_CHARS, composeExchangeBody, exchangeMarkdown, exchangeTopic } from "../keep-exchange";
import type { ChatContentBoundary, ChatContentState, ChatWorkKind, SessionTurn } from "../session-types";
import { __resetAccountEpochForTests, noteResolvedOwner, clearAccountTransition, currentAccountEpoch } from "../../auth/account-epoch";
import { __resetAccountLocalDeletionFencesForTests, installAccountLocalDeletionFence } from "../../account/local-deletion-fence";

const options = { locale: "ko" as const, speaker: "세컨비" };
const pair = (): SessionTurn[] => [
  { id: "u1", exchangeId: "x1", sequence: 0, role: "user", text: "  첫 줄\n다음 줄  " },
  { id: "r1", exchangeId: "x1", sequence: 1, role: "secondb", text: "  남긴 답변  " },
];
const registries: ReturnType<typeof createChatSessionRegistry>[] = [];
function fixture(turns = pair(), kind: ChatWorkKind = "keep", key = "r1") {
  let content: ChatContentState = { generation: 0, phase: "open", wipeId: null };
  const listeners = new Set<() => boolean>();
  const boundary: ChatContentBoundary = {
    read: () => content,
    subscribe: (_owner, listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    startAfterWipe: () => false,
  };
  let nextId = 0;
  const registry = createChatSessionRegistry(boundary, () => `id-${++nextId}`);
  registries.push(registry);
  const session = registry.attachView("a", "entry")!.snapshot.session!;
  expect(registry.replaceTurns(session, turns)).toBe(true);
  const beforeClaim = registry.getSessionSnapshot(session)!.revision;
  const work = registry.claimWork(session, kind, key, () => undefined)!;
  expect(work).not.toBeNull();
  const revision = registry.getSessionSnapshot(work)!.revision;
  return { registry, session, work, revision, beforeClaim,
    prepare: (id = "r1", expected = revision) => prepareKeptExchange(registry, work, id, expected, options),
    changeContent() {
      content = { generation: 1, phase: "blocked", wipeId: "wipe-1" };
      for (const listener of listeners) listener();
    } };
}
function prepared(result: KeptExchangePreparation) {
  if (result.status !== "prepared") throw new Error(`expected prepared, received ${result.status}`);
  return result;
}
function owner(id: string) { noteResolvedOwner(id); clearAccountTransition(currentAccountEpoch()); }
beforeEach(() => { __resetAccountEpochForTests(); __resetAccountLocalDeletionFencesForTests(); owner("a"); });
afterEach(() => { for (const registry of registries.splice(0)) registry.dispose(); });

test.each(["en", "ko"] as const)("uses the actual formatter and owned identity in %s without granting AI reuse", locale => {
  const h = fixture();
  const result = prepared(prepareKeptExchange(h.registry, h.work, "r1", h.revision, { ...options, locale }));
  const prompt = pair()[0].text.trim(), reply = pair()[1].text;
  const body = composeExchangeBody({ prompt, reply, speaker: options.speaker }, locale);
  expect(result.payload).toEqual({ rawMd: exchangeMarkdown(exchangeTopic(prompt, reply), body),
    kindOverride: "self_knowledge", userTags: [CHAT_KEEP_TAG] });
  expect(result.subject).toEqual({ ownerId: "a", ownerEpoch: h.work.ownerEpoch,
    contentGeneration: 0, sessionId: h.work.sessionId, sessionGeneration: h.work.sessionGeneration,
    snapshotRevision: h.revision, operationId: h.work.operationId, exchangeId: "x1",
    prompt: { turnId: "u1", sequence: 0 }, reply: { turnId: "r1", sequence: 1 } });
  expect(result.aiReuse).toEqual({ state: "unconfirmed" });
  expect(result).not.toHaveProperty("rawMd"); expect(result).not.toHaveProperty("userId");
});

test.each(["prompt", "reply", "both"] as const)("keeps known RED from the selected %s even when all saved text looks ordinary", red => {
  const turns = pair().map(turn => ({ ...turn, text: "ordinary synthetic words",
    ...((red === "both" || red === (turn.role === "user" ? "prompt" : "reply")) ? { safetyZone: "red" as const } : {}) }));
  const result = prepared(fixture(turns).prepare());
  expect(result.aiReuse).toEqual({ state: "hold-required", evidence:
    (red === "both" ? ["u1", "r1"] : [red === "prompt" ? "u1" : "r1"])
      .map(turnId => ({ kind: "turn-zone-red", turnId })) });
});

test("full-turn RED survives clipping and a fixed guidance reply", () => {
  const turns = pair();
  turns[0] = { ...turns[0], text: "ordinary ".repeat(KEEP_MAX_CHARS) + " withheld tail", safetyZone: "red" };
  turns[1] = { ...turns[1], text: "fixed synthetic guidance", safetyZone: "green", crisisNotice: true };
  const result = prepared(fixture(turns).prepare());
  expect(result.payload.rawMd).not.toContain("withheld tail");
  expect(result.payload.rawMd).toContain("…");
  expect(result.aiReuse).toEqual({ state: "hold-required", evidence: [{ kind: "turn-zone-red", turnId: "u1" }] });
});

test.each([undefined, "green", "yellow"] as const)("%s is unconfirmed, never an AI permission or false hold", safetyZone => {
  const result = prepared(fixture(pair().map(turn => ({ ...turn, safetyZone }))).prepare());
  expect(result.aiReuse).toEqual({ state: "unconfirmed" });
  expect(JSON.stringify(result)).not.toMatch(/"(allowed|safe|ai_hold|receipt)":/);
});

test("a different exchange's RED cannot contaminate the selected pair", () => {
  const old: SessionTurn[] = pair().map(turn => ({ ...turn, safetyZone: "red" }));
  const current = pair().map(turn => ({ ...turn, id: `${turn.id}-new`, exchangeId: "x2", sequence: turn.sequence + 2 }));
  const h = fixture([...old, ...current], "keep", "r1-new");
  const result = prepared(h.prepare("r1-new"));
  expect(result.subject.prompt?.turnId).toBe("u1-new");
  expect(result.aiReuse.state).toBe("unconfirmed");
});

test.each(["first", "previous-reply", "blank-prompt"] as const)("normal %s unpaired replies preserve prompt:null formatting", cause => {
  const reply = pair()[1];
  const turns = cause === "first" ? [reply]
    : cause === "blank-prompt" ? [{ ...pair()[0], text: "  " }, reply]
      : [{ ...reply, id: "previous", sequence: 0, exchangeId: "prior" }, reply];
  const result = prepared(fixture(turns).prepare());
  expect(result.subject.prompt).toBeNull();
  expect(result.payload.rawMd).toBe(exchangeMarkdown(exchangeTopic(null, reply.text),
    composeExchangeBody({ prompt: null, reply: reply.text, speaker: options.speaker }, options.locale)));
});

test("finds the real prompt across a synthetic assistant line", () => {
  const turns = pair(); turns[1] = { ...turns[1], sequence: 2 };
  turns.splice(1, 0, { id: "synthetic", exchangeId: "x1", sequence: 1, role: "secondb", text: "waiting", synthetic: true });
  expect(prepared(fixture(turns).prepare()).subject.prompt?.turnId).toBe("u1");
});

test.each(["missing", "synthetic", "empty", "user", "foreign-exchange"] as const)("rejects %s pair without returning a body", cause => {
  const turns = pair();
  if (cause === "synthetic") turns[1] = { ...turns[1], synthetic: true };
  if (cause === "empty") turns[1] = { ...turns[1], text: "  " };
  if (cause === "user") turns[1] = { ...turns[1], role: "user" };
  if (cause === "foreign-exchange") turns[0] = { ...turns[0], exchangeId: "other" };
  const target = cause === "missing" ? "missing" : "r1";
  const h = fixture(turns, "keep", target);
  expect(h.prepare(target)).toEqual({ status: "invalid-pair", code: cause === "foreign-exchange" ? "exchange" : "reply" });
});

test.each(["duplicate-id", "bad-sequence", "missing-exchange"] as const)("rejects %s even from a malformed reader; actual registry refuses it too", cause => {
  const h = fixture(); const snapshot = h.registry.getSessionSnapshot(h.work)!;
  const turns = pair();
  if (cause === "duplicate-id") turns[0] = { ...turns[0], id: "r1" };
  if (cause === "bad-sequence") turns[1] = { ...turns[1], sequence: 0 };
  if (cause === "missing-exchange") turns[0] = { ...turns[0], exchangeId: "" };
  expect(h.registry.replaceTurns(h.session, turns)).toBe(false);
  const malformed = { getSessionSnapshot: () => ({ ...snapshot, turns }) };
  expect(prepareKeptExchange(malformed, h.work, "r1", h.revision, options))
    .toEqual({ status: "invalid-pair", code: "turn-identity" });
});

test("requires the exact registered work object, not an equal copied token", () => {
  const h = fixture();
  expect(prepareKeptExchange(h.registry, { ...h.work }, "r1", h.revision, options)).toEqual({ status: "stale" });
  expect(h.prepare().status).toBe("prepared");
});

test.each(["send", "safety", "plan", "wrong-key"] as const)("rejects actual %s work as keep authority", kind => {
  const h = fixture(pair(), kind === "wrong-key" ? "keep" : kind, kind === "wrong-key" ? "another" : "r1");
  expect(h.prepare()).toEqual({ status: "stale" });
});

test.each(["ownerId", "ownerEpoch", "contentGeneration", "sessionId", "sessionGeneration"] as const)("rejects mismatched %s even from a malformed reader", field => {
  const h = fixture(); const current = h.registry.getSessionSnapshot(h.work)!;
  const bad = { ...current, [field]: typeof current[field] === "number" ? 99 : "other" };
  expect(prepareKeptExchange({ getSessionSnapshot: () => bad }, h.work, "r1", h.revision, options)).toEqual({ status: "stale" });
});

test("requires the post-claim revision and rejects same-ID text changes; fresh preparation is explicit", () => {
  const h = fixture(); expect(h.prepare("r1", h.beforeClaim)).toEqual({ status: "stale" });
  const old = prepared(h.prepare());
  const replacement = pair(); replacement[0] = { ...replacement[0], text: "changed input", safetyZone: "red" };
  expect(h.registry.replaceTurns(h.session, replacement)).toBe(true);
  expect(h.prepare()).toEqual({ status: "stale" });
  const fresh = prepared(h.prepare("r1", h.registry.getSessionSnapshot(h.work)!.revision));
  expect(fresh.payload.rawMd).toContain("changed input"); expect(fresh.aiReuse.state).toBe("hold-required");
  expect(old.payload.rawMd).not.toContain("changed input");
});

test("unrelated appended turns conservatively invalidate the captured snapshot revision", () => {
  const h = fixture();
  expect(h.registry.replaceTurns(h.session, [...pair(), { ...pair()[0], id: "next", sequence: 2, exchangeId: "x2" }])).toBe(true);
  expect(h.prepare()).toEqual({ status: "stale" });
  expect(h.prepare("r1", h.registry.getSessionSnapshot(h.work)!.revision).status).toBe("prepared");
});

test.each(["settled", "replacement", "account", "aba", "wipe", "disposed", "deletion"] as const)("reads the real registry at entry after %s and returns no body", async transition => {
  const h = fixture();
  if (transition === "settled" || transition === "replacement") h.registry.settleWork(h.work);
  if (transition === "replacement") h.registry.attachView("a", "new-entry", { fromNode: null, mode: "analytic", persona: "secondb", seed: "new" });
  if (transition === "account" || transition === "aba") owner("b");
  if (transition === "aba") owner("a");
  if (transition === "wipe") h.changeContent();
  if (transition === "disposed") h.registry.dispose();
  if (transition === "deletion") await installAccountLocalDeletionFence("a");
  expect(h.prepare()).toEqual({ status: "stale" });
});

test("a failed current-snapshot read is stale, never an empty allowed preparation", () => {
  const h = fixture();
  expect(prepareKeptExchange({ getSessionSnapshot: () => { throw new Error("offline"); } }, h.work, "r1", h.revision, options))
    .toEqual({ status: "stale" });
});

test("detaches and freezes payload, identity and RED evidence; no later GREEN clears the prepared requirement", () => {
  const turns = pair(); turns[0] = { ...turns[0], safetyZone: "red" };
  const h = fixture(turns);
  // The real registry copied the caller's object before preparation.
  Object.assign(turns[0], { text: "caller changed", safetyZone: "green" });
  const result = prepared(h.prepare());
  expect(result.payload.rawMd).not.toContain("caller changed");
  expect(result.aiReuse.state).toBe("hold-required");
  for (const value of [result, result.subject, result.subject.reply, result.subject.prompt,
    result.payload, result.payload.userTags, result.aiReuse]) expect(Object.isFrozen(value)).toBe(true);
  if (result.aiReuse.state !== "hold-required") throw new Error("missing hold");
  expect(Object.isFrozen(result.aiReuse.evidence)).toBe(true);
  expect(Object.isFrozen(result.aiReuse.evidence[0])).toBe(true);
  expect(() => Object.assign(result.aiReuse, { state: "unconfirmed" })).toThrow(TypeError);
  expect(h.registry.replaceTurns(h.session, pair())).toBe(true);
  expect(prepared(h.prepare("r1", h.registry.getSessionSnapshot(h.work)!.revision)).aiReuse.state).toBe("unconfirmed");
  expect(result.aiReuse.state).toBe("hold-required"); // A new unknown plan cannot release a prior durable hold.
});

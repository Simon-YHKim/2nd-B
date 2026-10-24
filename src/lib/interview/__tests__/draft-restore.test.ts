import { INTERVIEW_DRAFT_TTL_MS, encodeInterviewDraft, type InterviewDraft } from "../draft-codec";
import { decodeInterviewDraftSnapshot, encodeInterviewDraftSnapshot, type InterviewDraftSnapshot } from "../draft-snapshot";
import { prepareInterviewDraftRestore, type InterviewRestoreContext } from "../draft-restore";
import { emptyCoverage } from "../probe";

jest.mock("../../llm/boundary", () => ({ callLlm: jest.fn(() => { throw new Error("model I/O forbidden"); }) }));

function context(): InterviewRestoreContext {
  return { ownerId: "A", accountEpoch: 7, viewGeneration: 3, inputRevision: 0,
    content: { status: "confirmed", generation: "generation-1" } };
}
function fixture(): InterviewDraftSnapshot {
  return { v: 2, ownerId: "A", draftId: "draft-1", revision: 2, createdAt: 1000,
    expiresAt: 1000 + INTERVIEW_DRAFT_TTL_MS, contentGeneration: "generation-1", period: "work",
    uiLanguage: "es", conversationLocale: "en", growthOrigin: true,
    state: { turns: [{ role: "interviewer", text: "Original question?", layer: "fact", period: "work", sceneStart: true }],
      draft: "Unsent words", inputRevision: 0, pendingLayer: "fact", openers: ["Original opener"],
      stuckStreak: 2, abandoned: ["belief"], concreteOnly: true, phase: "active", endReason: null, crisisHotline: null,
      notice: "drill.dayLimit", coverage: { base: emptyCoverage(), current: emptyCoverage(), baseline: "unconfirmed" } }, pending: null };
}
function read(value = fixture(), captured = context(), current = context(), now = 1001) {
  return prepareInterviewDraftRestore(encodeInterviewDraftSnapshot(value), captured, current, now);
}

test.each([undefined, false, true])("T37 v2 keeps old and marked turns: %s", fromOpener => {
  const value = fixture();
  value.state.turns.push({ role: "user", text: "I joined a band", ...(fromOpener === undefined ? {} : { fromOpener }) });
  const restored = read(value);
  expect(restored.status).toBe("restored");
  if (restored.status !== "restored") throw new Error("expected restored");
  expect(restored.draft.state.turns).toEqual(value.state.turns);
});

test.each([null, "true", 1])("T37 rejects invalid opener provenance: %s", fromOpener => {
  const value = fixture();
  value.state.turns.push({ role: "user", text: "I joined a band", ...{ fromOpener: fromOpener as unknown as boolean } });
  expect(() => encodeInterviewDraftSnapshot(value)).toThrow("interview_draft_invalid");
});

test("T37 interviewer turns cannot claim answer provenance", () => {
  const value = fixture(); value.state.turns[0].fromOpener = true;
  expect(() => encodeInterviewDraftSnapshot(value)).toThrow("interview_draft_invalid");
});

function selectedFixture() {
  const value = fixture(); value.state.draft = value.state.openers[0];
  value.state.openerSelection = { questionIndex: 0, questionText: value.state.turns[0].text, openerIndex: 0, text: value.state.draft };
  return value;
}

test.each(["state", "request", "save"])("T37 selection survives %s snapshot preparation", kind => {
  const value = selectedFixture();
  if (kind === "request") value.pending = { kind: "request", requestId: "request-1", submittedAnswer: value.state.draft,
    inputRevision: value.state.inputRevision, before: structuredClone(value.state) };
  if (kind === "save") value.pending = { kind: "save", status: "unknown", intent: { requestId: "save-1", sessionId: "session-1",
    draftId: value.draftId, revision: value.revision, contentGeneration: value.contentGeneration, snapshot: structuredClone(value.state) } };
  const restored = read(value);
  expect(restored.status).toBe("restored");
  if (restored.status !== "restored") throw new Error("expected restored");
  expect(restored.draft).toEqual(value);
  expect(restored.draft.state.openerSelection).toEqual(value.state.openerSelection);
});

test("T37 v1 legacy-body-only preparation preserves selected text's source", () => {
  const selected = selectedFixture();
  const value: InterviewDraft = { v: 1, ownerId: "A", draftId: "draft-1", revision: 1, createdAt: 1000,
    expiresAt: 1000 + INTERVIEW_DRAFT_TTL_MS, period: "work", locale: "en", growthOrigin: false,
    phase: "active", turns: selected.state.turns, draft: selected.state.draft, openerSelection: selected.state.openerSelection };
  expect(prepareInterviewDraftRestore(encodeInterviewDraft(value), context(), context(), 1001))
    .toEqual({ status: "legacy-body-only", draft: value });
});

test.each(["space", "newline", "question-index", "question-text", "candidate-index", "candidate-text", "null", "extra"])(
  "T37 malformed or mismatched selection %s rejects the snapshot without losing only the source", change => {
    const value = selectedFixture();
    const selection = value.state.openerSelection!;
    if (change === "space") value.state.draft = ` ${value.state.draft}`;
    if (change === "newline") value.state.draft += "\n";
    if (change === "question-index") selection.questionIndex = 1;
    if (change === "question-text") selection.questionText = "Other question?";
    if (change === "candidate-index") selection.openerIndex = 1;
    if (change === "candidate-text") value.state.openers[0] = "Other candidate";
    if (change === "null") Object.assign(value.state, { openerSelection: null });
    if (change === "extra") Object.assign(selection, { unrelated: true });
    expect(() => encodeInterviewDraftSnapshot(value)).toThrow("interview_draft_invalid");
    expect(prepareInterviewDraftRestore(JSON.stringify(value), context(), context(), 1001)).toEqual({ status: "invalid" });
  },
);

test("a detached roundtrip preserves every field without inventing baseline confirmation", () => {
  const value = fixture(); value.state.coverage.base.school.fact = 2; value.state.coverage.current.school.fact = 3;
  const result = read(value); expect(result.status).toBe("restored");
  if (result.status !== "restored") throw new Error("expected restored");
  expect(result.next).toBe("resume-choice"); expect(result.draft).toEqual(value);
  expect(result.draft.state.coverage.baseline).toBe("unconfirmed");
  value.state.turns[0].text = "Later mutation"; value.state.coverage.current.school.fact = 900;
  expect(result.draft.state.turns[0].text).toBe("Original question?");
  expect(result.draft.state.coverage.current.school.fact).toBe(3);
  expect(result.draft.conversationLocale).toBe("en"); expect(result.draft.uiLanguage).toBe("es");
});

test.each([true, false, null, undefined])("preserves verdict %s independently of a missing verdict", answered => {
  const value = fixture(); value.state.turns.push({ role: "user", text: "Original answer", answered });
  const copy = decodeInterviewDraftSnapshot(encodeInterviewDraftSnapshot(value), "A");
  expect(copy.state.turns[1].answered).toBe(answered);
  expect(Object.hasOwn(copy.state.turns[1], "answered")).toBe(answered !== undefined);
});

test.each([
  ["owner switch", { ownerId: "B" }], ["same owner ABA", { accountEpoch: 9 }],
  ["discard/new view", { viewGeneration: 4 }], ["late hydrate after edit", { inputRevision: 1 }],
  ["same owner wipe", { content: { status: "confirmed", generation: "generation-2" } }],
] as const)("%s rejects both a body and empty observation from the old ticket", (_name, change) => {
  const current = { ...context(), ...change } as InterviewRestoreContext;
  expect(read(fixture(), context(), current)).toEqual({ status: "stale" });
  expect(prepareInterviewDraftRestore(null, context(), current, 1001)).toEqual({ status: "stale" });
});

test.each(["unconfirmed", "wipe-pending"] as const)("%s never seeds or offers a save/resume", status => {
  const current: InterviewRestoreContext = { ...context(), content: { status } };
  expect(read(fixture(), context(), current)).toEqual({ status: "unconfirmed" });
  expect(prepareInterviewDraftRestore(null, context(), current, 1001)).toEqual({ status: "unconfirmed" });
  expect(read(fixture(), current, context())).toEqual({ status: "unconfirmed" });
});

test("a confirmed new generation quarantines pre-wipe words without extending TTL or an old save intent", () => {
  const value = fixture(); const current = context(); current.content = { status: "confirmed", generation: "generation-2" };
  const result = read(value, current, current);
  expect(result).toEqual({ status: "quarantined", draft: value });
  expect(read(value, current, current, value.expiresAt)).toEqual({ status: "expired" });
});

test.each([-1, 999, 1000 + INTERVIEW_DRAFT_TTL_MS, Number.NaN, Number.POSITIVE_INFINITY])("clock %s cannot extend fixed seven days", now => {
  expect(read(fixture(), context(), context(), now)).toEqual({ status: "expired" });
});

test("the final millisecond remains readable and an expired v1 stays expired", () => {
  const value = fixture(); expect(read(value, context(), context(), value.expiresAt - 1).status).toBe("restored");
  const old: InterviewDraft = { v: 1, ownerId: "A", draftId: "old", revision: 8, createdAt: 1000,
    expiresAt: value.expiresAt, period: "work", locale: "ko", growthOrigin: false, phase: "save-unknown", turns: [], draft: "Old words" };
  expect(prepareInterviewDraftRestore(encodeInterviewDraft(old), context(), context(), old.expiresAt)).toEqual({ status: "expired" });
  expect(prepareInterviewDraftRestore(encodeInterviewDraft(old), context(), context(), 1001)).toEqual({ status: "legacy-body-only", draft: old });
});

test("an interrupted request preserves submitted words, the stable state and a later edit without a verdict", () => {
  const value = fixture(); const before = structuredClone(value.state);
  value.pending = { kind: "request", requestId: "request-1", submittedAnswer: "Submitted words", inputRevision: 0, before };
  value.state.inputRevision = 1; value.state.draft = "Newer unsent edit";
  value.state.turns.push({ role: "user", text: "Submitted words", layer: "fact" });
  value.state.pendingLayer = null; value.state.openers = [];
  const result = read(value);
  expect(result).toEqual({ status: "restored", draft: value, next: "request-unconfirmed" });
  expect(result.status === "restored" && result.draft.state.turns.at(-1)?.answered).toBeUndefined();
});

test.each(["pending", "unknown"] as const)("%s save remains unconfirmed with the original intent snapshot", status => {
  const value = fixture();
  value.pending = { kind: "save", status, intent: { requestId: "save-1", sessionId: "session-1", draftId: value.draftId,
    revision: 1, contentGeneration: value.contentGeneration, snapshot: structuredClone(value.state) } };
  value.state.draft = "Newer UI text";
  const result = read(value); expect(result).toEqual({ status: "restored", draft: value, next: "save-unconfirmed" });
  expect(result.status === "restored" && result.draft.pending?.kind === "save" && result.draft.pending.intent.snapshot.draft).toBe("Unsent words");
});

test.each(["ended", "crisis-ended"] as const)("%s overrides an interrupted request without reactivating it", phase => {
  const value = fixture(); value.pending = { kind: "request", requestId: "request-1", submittedAnswer: "Submitted", inputRevision: 0, before: structuredClone(value.state) };
  value.state.phase = phase; value.state.endReason = phase === "ended" ? "user-stop" : "crisis";
  value.state.pendingLayer = null; value.state.openers = [];
  value.state.crisisHotline = phase === "crisis-ended" ? "KR_1388" : null;
  expect(read(value)).toEqual({ status: "restored", draft: value, next: "ended" });
});

test.each([
  (v: InterviewDraftSnapshot) => { (v as unknown as Record<string, unknown>).token = "unexpected"; },
  (v: InterviewDraftSnapshot) => { v.expiresAt++; },
  (v: InterviewDraftSnapshot) => { v.state.coverage.base.work.fact = 1; },
  (v: InterviewDraftSnapshot) => { v.state.coverage.current.work.fact = -1; },
  (v: InterviewDraftSnapshot) => { v.state.stuckStreak = Number.NaN; },
  (v: InterviewDraftSnapshot) => { v.state.phase = "ended"; },
  (v: InterviewDraftSnapshot) => { v.state.abandoned = ["fact", "fact"]; },
  (v: InterviewDraftSnapshot) => { delete (v.state as Partial<typeof v.state>).pendingLayer; },
  (v: InterviewDraftSnapshot) => { v.state.draft = "x".repeat(256 * 1024); },
])("malformed/partial/oversized snapshot %s is rejected without repairing progress", mutate => {
  const value = fixture(); mutate(value);
  expect(() => encodeInterviewDraftSnapshot(value)).toThrow();
  expect(prepareInterviewDraftRestore(JSON.stringify(value), context(), context(), 1001)).toEqual({ status: "invalid" });
});

test("cross-owner bodies and mismatched save generation are never returned", () => {
  const value = fixture(); value.ownerId = "B";
  expect(read(value)).toEqual({ status: "invalid" });
  value.ownerId = "A";
  value.pending = { kind: "save", status: "unknown", intent: { requestId: "save-1", sessionId: "session-1", draftId: value.draftId,
    revision: 1, contentGeneration: "generation-old", snapshot: structuredClone(value.state) } };
  expect(() => encodeInterviewDraftSnapshot(value)).toThrow();
});


test("a response lost during save cannot cross a wipe or reuse its intent in the new generation", () => {
  const value = fixture();
  value.pending = { kind: "save", status: "unknown", intent: { requestId: "save-1", sessionId: "session-1", draftId: value.draftId,
    revision: 1, contentGeneration: value.contentGeneration, snapshot: structuredClone(value.state) } };
  const after: InterviewRestoreContext = { ...context(), content: { status: "confirmed", generation: "generation-2" } };
  expect(read(value, context(), after)).toEqual({ status: "stale" });
  expect(read(value, after, after)).toEqual({ status: "quarantined", draft: value });
  // Relabeling only the envelope cannot make an old immutable intent current.
  value.contentGeneration = "generation-2";
  expect(() => encodeInterviewDraftSnapshot(value)).toThrow();
});

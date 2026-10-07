// Daily board contract invariants (PS-DASH-001 v2.1 · RD-261007-09 · Q-261007-38).
import {
  BASES,
  BOARD_SEATS,
  CONSENT_GATED_INPUTS,
  DAILY_NOTE_MAX_SUGGESTIONS,
  DAY_SUMMARY_LIMITS,
  INBOX_TRIAGE_LIMITS,
  NEVER_TO_LLM,
  SEAT_INPUT_ALLOWLIST,
  SOURCES,
  aiLineOrFallback,
  dailyNoteProblems,
  daySummaryProblems,
  inboxTriageProblems,
  pickFixedSentence,
  seatMayRead,
  toneFor,
  type BoardLine,
  type BoardRef,
  type DailyNote,
  type HealthRow,
  type ReminderItem,
} from "../contract";

const ref: BoardRef = { kind: "reminder", id: "r1" };

describe("basis decides the tone; the screen never picks it", () => {
  it("ai = accent, fact and rule = neutral, locked = dashed", () => {
    expect(BASES.map((b) => [b, toneFor(b)])).toEqual([
      ["ai", "accent"],
      ["fact", "neutral"],
      ["rule", "neutral"],
      ["locked", "dashed"],
    ]);
  });
});

describe("flow 2 never reaches an LLM (RD-261007-09 · Q14)", () => {
  it("the measurement ledgers are exactly the flow-2 sources", () => {
    const flow2 = Object.values(SOURCES).filter((s) => s.flow === "flow2").map((s) => s.id).sort();
    expect(flow2).toEqual(["diet", "health_samples", "ops_ledger"]);
  });

  it("no seat's allowlist contains a never-to-LLM field", () => {
    for (const seat of BOARD_SEATS) {
      for (const field of SEAT_INPUT_ALLOWLIST[seat]) expect(NEVER_TO_LLM).not.toContain(field);
    }
  });

  it("health values and ledger amounts are refused for every seat", () => {
    for (const seat of BOARD_SEATS) {
      expect(seatMayRead(seat, "health.values")).toBe(false);
      expect(seatMayRead(seat, "ledger.amounts")).toBe(false);
      expect(seatMayRead(seat, "notification.raw")).toBe(false);
      expect(seatMayRead(seat, "mail.raw")).toBe(false);
      expect(seatMayRead(seat, "otp")).toBe(false);
    }
  });

  it("reminders and routine completion feed daily_note and day_summary", () => {
    for (const seat of ["daily_note", "day_summary"] as const) {
      expect(seatMayRead(seat, "reminders")).toBe(true);
      expect(seatMayRead(seat, "routineCompletion")).toBe(true);
    }
  });

  it("inbox_triage gets sender and title only; the preview reaches no seat (RD-261007-11 = B)", () => {
    expect([...SEAT_INPUT_ALLOWLIST.inbox_triage].sort()).toEqual([
      "inboxCandidate.sender",
      "inboxCandidate.title",
    ]);
    expect(NEVER_TO_LLM).toContain("inboxCandidate.preview200");
    for (const seat of ["daily_note", "day_summary", "inbox_triage"] as const) {
      expect(seatMayRead(seat, "inboxCandidate.preview200")).toBe(false);
    }
  });

  it("record originals are behind the Q13 consent", () => {
    expect(CONSENT_GATED_INPUTS).toEqual(["recordExcerpts"]);
  });

  it("device raw content stays on the device", () => {
    for (const s of Object.values(SOURCES)) {
      if (s.flow === "device") expect(s.retention).toBe("device:24h");
    }
  });
});

describe("an AI line needs a ref; otherwise a fixed sentence", () => {
  it("text with refs becomes an ai line", () => {
    const line = aiLineOrFallback(" call back ", [ref], { pool: "dailyNote.morning", poolSize: 4, seed: "u|d|m" });
    expect(line).toEqual({ basis: "ai", text: "call back", refs: [ref] });
  });

  it("no refs or no text falls back to the pool, as a rule line", () => {
    const a = aiLineOrFallback("call back", [], { pool: "dailyNote.morning", poolSize: 4, seed: "u|d|m" });
    const b = aiLineOrFallback("   ", [ref], { pool: "dailyNote.morning", poolSize: 4, seed: "u|d|m" });
    expect(a.basis).toBe("rule");
    expect(b.basis).toBe("rule");
    expect("pool" in a && a.pool).toBe("dailyNote.morning");
  });

  it("the pool pick is deterministic and inside the pool", () => {
    const one = pickFixedSentence("dailyNote.evening", 5, "user|2026-10-07|evening");
    const two = pickFixedSentence("dailyNote.evening", 5, "user|2026-10-07|evening");
    expect(one).toEqual(two);
    expect("index" in one && one.index >= 0 && one.index < 5).toBe(true);
    expect(() => pickFixedSentence("dailyNote.evening", 0, "x")).toThrow(/empty fixed pool/);
  });

  it("the type refuses an ai line without refs", () => {
    // @ts-expect-error an ai line needs at least one ref
    const bad: BoardLine = { basis: "ai", text: "x", refs: [] };
    expect(bad.basis).toBe("ai");
  });
});

describe("seat output schemas", () => {
  const note = (over: Partial<DailyNote>): DailyNote => ({
    slot: "morning",
    line: "x",
    basis_refs: [ref],
    reminder_suggestions: [],
    ...over,
  });

  it("daily_note: refs required, midday has no suggestions, at most the threshold", () => {
    expect(dailyNoteProblems(note({}))).toEqual([]);
    expect(dailyNoteProblems(note({ basis_refs: [] }))).toContain("line without basis_refs");
    const s = { title: "t", when: "w", why: "y", source_ref: ref };
    expect(dailyNoteProblems(note({ slot: "midday", reminder_suggestions: [s] }))).toContain(
      "midday suggestions must be empty",
    );
    const many = Array.from({ length: DAILY_NOTE_MAX_SUGGESTIONS + 1 }, () => s);
    expect(dailyNoteProblems(note({ reminder_suggestions: many }))).toContain("too many suggestions");
    expect(DAILY_NOTE_MAX_SUGGESTIONS).toBe(2);
  });

  it("day_summary: limits come from the threshold table and ai suggestions carry refs", () => {
    expect(DAY_SUMMARY_LIMITS).toEqual({ facts: 4, links: 2, suggestions: 3 });
    const fact = { kind: "k", title: "t", who: null, since: null, action: null, source_ref: ref };
    const problems = daySummaryProblems({
      headline: "h",
      facts: Array.from({ length: 5 }, () => fact),
      links: [{ text: "l", refs: [] }],
      suggestions: [{ text: "s", action: null, basis: "ai", refs: [] }],
      tail_counts: {},
    });
    expect(problems).toEqual(
      expect.arrayContaining(["too many facts", "link without refs", "ai suggestion without refs"]),
    );
  });

  it("inbox_triage: at most five candidates and only known ids", () => {
    expect(INBOX_TRIAGE_LIMITS).toEqual({ candidates: 5 });
    expect(inboxTriageProblems({ order: ["a"], items: [] }, ["a", "b"])).toEqual([]);
    expect(inboxTriageProblems({ order: ["z"], items: [] }, ["a"])).toContain("unknown id z");
    expect(inboxTriageProblems({ order: [], items: [] }, ["1", "2", "3", "4", "5", "6"])).toContain(
      "too many candidates",
    );
  });
});

describe("Q-261007-38: what the old widgets showed now lives in part fields", () => {
  it("P-03 items carry reason and alarm_at; P-06 rows carry source and synced_at as facts", () => {
    // Removing any of these fields breaks the build here (excess-property check).
    const item: ReminderItem = {
      id: "r1",
      kind: "routine",
      title: "walk",
      at: "2026-10-07T07:00:00+09:00",
      reason: "after breakfast",
      alarm_at: "2026-10-07T06:50:00+09:00",
      state: "open",
      basis: "fact",
      ref,
    };
    const row: HealthRow = {
      metric: "sleep",
      value: 410,
      unit: "min",
      usualDelta: -40,
      source: "Health Connect",
      synced_at: "2026-10-07T06:00:00+09:00",
      basis: "fact",
    };
    expect(Object.keys(item)).toEqual(expect.arrayContaining(["reason", "alarm_at"]));
    expect(Object.keys(row)).toEqual(expect.arrayContaining(["source", "synced_at"]));
    expect(row.basis).toBe("fact");
  });
});

import { validateBoardOutput } from "../generation-output";
import type { PreparedBoardInput } from "../generation-input";
import type { BoardSeat } from "../contract";

const ref = { kind: "reminder" as const, id: "r1" };
const input = (seat: BoardSeat): PreparedBoardInput => ({
  seat, payload: {}, refs: [ref], candidateIds: ["a", "b"], prompt: "",
});
const note = () => ({ slot: "morning", line: "Lunch is on your list.", basis_refs: [ref], reminder_suggestions: [] });
const summary = () => ({
  headline: "Today",
  facts: [{ kind: "reminder", title: "Lunch", who: null, since: null, action: null, source_ref: ref }],
  links: [], suggestions: [], tail_counts: {},
});

test("valid grounded outputs retain the W0 shape", () => {
  expect(validateBoardOutput(input("daily_note"), note(), "morning"))
    .toEqual({ ok: true, seat: "daily_note", value: note() });
  expect(validateBoardOutput(input("day_summary"), summary()))
    .toEqual({ ok: true, seat: "day_summary", value: summary() });
});

test.each([null, [], "not JSON", {}, { ...note(), basis_refs: null }, { ...note(), slot: "night" }])(
  "malformed output %j returns a fixed error, never a property-access exception", (raw) => {
    expect(() => validateBoardOutput(input("daily_note"), raw, "morning")).not.toThrow();
    expect(validateBoardOutput(input("daily_note"), raw, "morning"))
      .toEqual({ ok: false, reason: "invalid_output" });
  },
);

test("a model cannot change the requested slot or suggest reminders at midday", () => {
  expect(validateBoardOutput(input("daily_note"), note(), "midday").ok).toBe(false);
  expect(validateBoardOutput(input("daily_note"), note()).ok).toBe(false);
  expect(validateBoardOutput(input("daily_note"), {
    ...note(), slot: "midday",
    reminder_suggestions: [{ title: "Do it", when: "2026-10-07T14:00:00Z", why: "Reason", source_ref: ref }],
  }, "midday").ok).toBe(false);
});

test.each([{ kind: "record", id: "someone_else" }, { kind: "ledger", id: "r1" }, { kind: "health", id: "r1" }])(
  "rejects a fabricated or flow-2 reference %j", (badRef) => {
    expect(validateBoardOutput(input("daily_note"), { ...note(), basis_refs: [badRef] }, "morning").ok).toBe(false);
    expect(validateBoardOutput(input("day_summary"), {
      ...summary(), links: [{ text: "Invented connection", refs: [badRef] }],
    }).ok).toBe(false);
  },
);

test("checks nested suggestion references too", () => {
  expect(validateBoardOutput(input("daily_note"), {
    ...note(), reminder_suggestions: [{
      title: "Do it", when: "2026-10-07T14:00:00Z", why: "Reason",
      source_ref: { kind: "reminder", id: "missing" },
    }],
  }, "morning").ok).toBe(false);
});

test("does not let extra model fields, executable links or invalid counts become UI data", () => {
  expect(validateBoardOutput(input("daily_note"), { ...note(), execute: "order" }, "morning").ok).toBe(false);
  expect(validateBoardOutput(input("day_summary"), { ...summary(), tail_counts: { reminders: -1 } }).ok).toBe(false);
  expect(validateBoardOutput(input("day_summary"), {
    ...summary(), facts: [{ ...summary().facts[0], action: "https://untrusted.invalid/checkout" }],
  }).ok).toBe(false);
});

test("model output cannot claim to be a rule or supply made-up numeric totals", () => {
  expect(validateBoardOutput(input("day_summary"), {
    ...summary(), suggestions: [{ text: "Do it", action: null, basis: "rule", refs: [ref] }],
  }).ok).toBe(false);
  expect(validateBoardOutput(input("day_summary"), {
    ...summary(), tail_counts: { health: 900, reminders: 200 },
  }).ok).toBe(false);
});

test("inbox output must contain each input ID exactly once in both lists", () => {
  const triage = {
    order: ["b", "a"],
    items: [{ id: "a", action_line: "Read", why: "First" }, { id: "b", action_line: "Review", why: "Next" }],
  };
  expect(validateBoardOutput(input("inbox_triage"), triage))
    .toEqual({ ok: true, seat: "inbox_triage", value: triage });
  for (const order of [["a", "a"], ["a"], ["a", "foreign"]]) {
    expect(validateBoardOutput(input("inbox_triage"), { ...triage, order }).ok).toBe(false);
  }
  expect(validateBoardOutput(input("inbox_triage"), { ...triage, items: [triage.items[0], triage.items[0]] }).ok).toBe(false);
});

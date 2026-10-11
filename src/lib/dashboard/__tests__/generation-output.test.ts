import { decodeBoardResponse, validateBoardOutput } from "../generation-output";
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

// Every free-text surface, including nullable fields, consumes the same matcher.
const surfaces: [BoardSeat, string][] = [
  ["daily_note", "line"], ["daily_note", "reminder_suggestions.0.title"], ["daily_note", "reminder_suggestions.0.why"],
  ["day_summary", "headline"], ["day_summary", "facts.0.kind"], ["day_summary", "facts.0.title"],
  ["day_summary", "facts.0.who"], ["day_summary", "facts.0.since"], ["day_summary", "links.0.text"],
  ["day_summary", "suggestions.0.text"], ["inbox_triage", "items.0.action_line"], ["inbox_triage", "items.0.why"],
];
function displayValue(seat: BoardSeat, path: string, text: string): unknown {
  const value = seat === "daily_note" ? { ...note(), reminder_suggestions: [
    { title: "Read", when: "2026-10-11T14:00:00Z", why: "On your list", source_ref: ref },
  ] } : seat === "day_summary" ? { ...summary(), links: [{ text: "Today", refs: [ref] }],
    suggestions: [{ text: "Read", action: null, basis: "ai", refs: [ref] }],
  } : { order: ["a", "b"], items: [{ id: "a", action_line: "Read", why: "First" }, { id: "b", action_line: "Review", why: "Next" }] };
  const keys = path.split(".");
  let parent = value as unknown as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) parent = parent[key] as Record<string, unknown>;
  parent[keys[keys.length - 1]] = text;
  return value;
}
import { ANALYSIS_UNIVERSAL_FORBIDDEN, FORBIDDEN_TERMS } from "../../safety/lexicon";
const forbidden = [...new Set([...Object.values(FORBIDDEN_TERMS).flat(), ...Object.values(ANALYSIS_UNIVERSAL_FORBIDDEN).flat()])];
describe.each(surfaces)("%s %s wording", (seat, path) => {
  test.each(forbidden)("rejects canonical term %s before persistence and cached display", (term) => {
    const value = displayValue(seat, path, term);
    expect(validateBoardOutput(input(seat), value, "morning")).toEqual({ ok: false, reason: "invalid_output" });
    expect(decodeBoardResponse({ kind: "ready", purpose: seat, value })).toEqual({ ok: false, reason: "invalid_output" });
  });
  test.each(["Read today.", "오늘 할 일을 확인해요.", "secure curiosity"]) (
    "accepts ordinary text %s", (text) => {
      const value = displayValue(seat, path, text);
      expect(validateBoardOutput(input(seat), value, "morning").ok).toBe(true);
      expect(decodeBoardResponse({ kind: "ready", purpose: seat, value }).ok).toBe(true);
    },
  );
});
test.each(["MENTAL\nHEALTH", "ｔｈｅｒａｐｙ", FORBIDDEN_TERMS.ko[0].normalize("NFD")])(
  "keeps canonical case/whitespace/Unicode matching: %s", (text) => {
    expect(validateBoardOutput(input("daily_note"), { ...note(), line: text }, "morning").ok).toBe(false);
  },
);

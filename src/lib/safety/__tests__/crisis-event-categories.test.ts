import {
  CRISIS_EVENT_CATEGORY_LIMIT,
  CLASSIFIER_REPORTED_CATEGORIES,
  CRISIS_EVENT_FIXED_CATEGORIES,
  UNLISTED_CRISIS_CATEGORY,
  classifierReportedCategories,
  recordableCrisisCategories,
} from "../crisis-event-categories";

describe("the closed list of crisis record categories", () => {
  it("is exactly these names", () => {
    expect([...CRISIS_EVENT_FIXED_CATEGORIES]).toEqual([
      "input_red",
      "input_semantic_red",
      "interview_input_red",
      "record_save_red",
      "proxy_input_red",
      "proxy_input_red_unconfirmed",
      "output_swap",
      "crisis",
      "forbidden_lexicon",
      "lexicon_match",
      "passive_ideation",
      "active_ideation_no_method",
      "active_ideation_with_method",
      "intent_no_plan",
      "intent_with_plan",
      "behavior_past",
      "behavior_preparation",
      "behavior_recent",
      "self_harm_non_suicidal",
      "unlisted",
    ]);
  });

  it("holds only short lowercase identifiers", () => {
    for (const name of CRISIS_EVENT_FIXED_CATEGORIES) {
      expect(name).toMatch(/^[a-z][a-z_]{1,39}$/);
    }
  });
});

describe("recordableCrisisCategories: a record of a replaced AI reply (it carries output_swap)", () => {
  it("keeps fixed names and term numbers in their order", () => {
    expect(recordableCrisisCategories(["lexicon_match", "output_swap", "crisis_term:15"])).toEqual([
      "lexicon_match",
      "output_swap",
      "crisis_term:15",
    ]);
    expect(recordableCrisisCategories(["crisis", "input_red"])).toEqual(["crisis", "input_red"]);
    expect(recordableCrisisCategories([])).toEqual([]);
  });

  it.each([
    ["a sentence a model wrote", "The user says they want to disappear tonight."],
    ["Korean text", "사용자가 가족에게 짐이 된다고 말함"],
    ["a quoted piece of the message", "\"I can't go on\""],
    ["a name that looks like a category but is not on the list", "active_ideation"],
    ["a different case", "Output_Swap"],
    ["a listed name with something after it", "output_swap extra"],
    ["an empty string", ""],
    ["a very long string", "x".repeat(500)],
  ])("turns %s into the fixed stand-in", (_label, entry) => {
    const list = recordableCrisisCategories(["lexicon_match", entry, "output_swap"]);
    expect(list).toEqual(["lexicon_match", UNLISTED_CRISIS_CATEGORY, "output_swap"]);
    expect(JSON.stringify(list)).not.toContain(entry.length > 0 ? entry : "\"\"");
  });

  it.each([
    "crisis_term:0",
    "crisis_term:22",
    "crisis_term:99",
    "crisis_term:01",
    "crisis_term:-1",
    "crisis_term:1.5",
    "crisis_term:15 ",
    "crisis_term:15 and the reply",
    "crisis_term:",
    "crisis_term:x",
    "CRISIS_TERM:5",
  ])("refuses a number outside 1 to 19 or anything after it: %s", (entry) => {
    expect(recordableCrisisCategories(["output_swap", entry])).toEqual(["output_swap", UNLISTED_CRISIS_CATEGORY]);
  });

  it("accepts every number from 1 to 19", () => {
    const all = Array.from({ length: 19 }, (_, i) => `crisis_term:${i + 1}`);
    for (const entry of all) expect(recordableCrisisCategories(["output_swap", entry])).toEqual(["output_swap", entry]);
  });

  it("records several unknown entries as one stand-in, so their number says nothing", () => {
    expect(recordableCrisisCategories(["one free string", "another free string", "output_swap", "a third"])).toEqual([
      UNLISTED_CRISIS_CATEGORY,
      "output_swap",
    ]);
  });

  it("turns values that are not strings into the stand-in", () => {
    expect(recordableCrisisCategories([null, 7, { text: "x" }, undefined, "crisis", "output_swap"])).toEqual([
      UNLISTED_CRISIS_CATEGORY,
      "crisis",
      "output_swap",
    ]);
  });

  it("drops duplicates", () => {
    expect(recordableCrisisCategories(["crisis", "crisis", "input_red", "crisis"])).toEqual(["crisis", "input_red"]);
  });

  it("never passes the server's limit", () => {
    const many = [...CRISIS_EVENT_FIXED_CATEGORIES, ...Array.from({ length: 19 }, (_, i) => `crisis_term:${i + 1}`)];
    const list = recordableCrisisCategories(many);
    expect(list).toHaveLength(CRISIS_EVENT_CATEGORY_LIMIT);
    expect(list).toEqual(many.slice(0, CRISIS_EVENT_CATEGORY_LIMIT));
  });

  it("gives the same list when applied again", () => {
    const once = recordableCrisisCategories(["free text", "crisis", "output_swap", "crisis_term:3", "crisis_term:30"]);
    expect(once).toEqual([UNLISTED_CRISIS_CATEGORY, "crisis", "output_swap", "crisis_term:3"]);
    expect(recordableCrisisCategories(once)).toEqual(once);
  });

  it("every recorded entry fits the server's bounds (1 to 64 characters)", () => {
    const list = recordableCrisisCategories(["x".repeat(500), ...CRISIS_EVENT_FIXED_CATEGORIES]);
    for (const entry of list) {
      expect(entry.length).toBeGreaterThanOrEqual(1);
      expect(entry.length).toBeLessThanOrEqual(64);
    }
  });
});

// Q-261013-66, the legal conditions of 2026-10-13: "what falls outside the list is recorded as
// unlisted only, never as its own value; a record whose source is the user's input records neither a
// code nor unlisted."
describe("recordableCrisisCategories: a record of the user's own words (no output_swap)", () => {
  it("keeps the fixed names", () => {
    expect(recordableCrisisCategories(["crisis", "input_red"])).toEqual(["crisis", "input_red"]);
    expect(recordableCrisisCategories(["passive_ideation", "intent_with_plan"])).toEqual(["passive_ideation", "intent_with_plan"]);
    expect(recordableCrisisCategories(["crisis", "proxy_input_red"])).toEqual(["crisis", "proxy_input_red"]);
  });

  it.each([
    "crisis_term:1",
    "crisis_term:7",
    "crisis_term:19",
    "crisis_term:0",
    "crisis_term:20",
  ])("drops a term number, in range or not: %s", (entry) => {
    expect(recordableCrisisCategories(["crisis", entry, "input_red"])).toEqual(["crisis", "input_red"]);
    expect(recordableCrisisCategories([entry])).toEqual([]);
  });

  it.each([
    ["a sentence a model wrote", "The user says they want to disappear tonight."],
    ["Korean text", "사용자가 가족에게 짐이 된다고 말함"],
    ["a name that is not on the list", "active_ideation"],
    ["the stand-in itself", "unlisted"],
    ["an empty string", ""],
  ])("drops %s and writes no stand-in", (_label, entry) => {
    const list = recordableCrisisCategories(["passive_ideation", entry, "input_semantic_red"]);
    expect(list).toEqual(["passive_ideation", "input_semantic_red"]);
    expect(list).not.toContain(UNLISTED_CRISIS_CATEGORY);
  });

  it("drops values that are not strings, and may end up empty", () => {
    expect(recordableCrisisCategories([null, 7, { text: "x" }, undefined, "crisis"])).toEqual(["crisis"]);
    expect(recordableCrisisCategories(["free text", "more free text"])).toEqual([]);
    expect(recordableCrisisCategories([])).toEqual([]);
  });

  it("gives the same list when applied again, and stays within the limit", () => {
    const once = recordableCrisisCategories(["free text", "crisis", "crisis_term:3", "unlisted", "input_red"]);
    expect(once).toEqual(["crisis", "input_red"]);
    expect(recordableCrisisCategories(once)).toEqual(once);
    const names = CRISIS_EVENT_FIXED_CATEGORIES.filter((name) => name !== "output_swap");
    expect(recordableCrisisCategories(names).length).toBeLessThanOrEqual(CRISIS_EVENT_CATEGORY_LIMIT);
    expect(recordableCrisisCategories(names)).not.toContain(UNLISTED_CRISIS_CATEGORY);
  });

  it("every source name of a user-input record counts as one: only output_swap marks an AI reply", () => {
    for (const source of ["input_red", "input_semantic_red", "interview_input_red", "record_save_red", "proxy_input_red", "proxy_input_red_unconfirmed"]) {
      expect(recordableCrisisCategories([source, "crisis_term:5", "something else"])).toEqual([source]);
    }
    expect(recordableCrisisCategories(["output_swap", "crisis_term:5", "something else"])).toEqual([
      "output_swap",
      "crisis_term:5",
      UNLISTED_CRISIS_CATEGORY,
    ]);
  });
});

describe("what a classifier may report", () => {
  it("is the word list's three names and the meaning classifier's nine", () => {
    expect([...CLASSIFIER_REPORTED_CATEGORIES]).toEqual([
      "crisis",
      "forbidden_lexicon",
      "lexicon_match",
      "passive_ideation",
      "active_ideation_no_method",
      "active_ideation_with_method",
      "intent_no_plan",
      "intent_with_plan",
      "behavior_past",
      "behavior_preparation",
      "behavior_recent",
      "self_harm_non_suicidal",
    ]);
    for (const name of CLASSIFIER_REPORTED_CATEGORIES) expect(CRISIS_EVENT_FIXED_CATEGORIES).toContain(name);
  });

  it.each([
    "output_swap",
    "input_red",
    "input_semantic_red",
    "interview_input_red",
    "record_save_red",
    "proxy_input_red",
    "proxy_input_red_unconfirmed",
    "crisis_term:1",
    "crisis_term:7",
    "crisis_term:19",
    "unlisted",
    "The user wrote that they cannot go on.",
  ])("never takes a source name, a term number or free text from a classifier: %s", (entry) => {
    expect(classifierReportedCategories([entry])).toEqual([UNLISTED_CRISIS_CATEGORY]);
    expect(classifierReportedCategories(["passive_ideation", entry, "crisis"])).toEqual([
      "passive_ideation",
      UNLISTED_CRISIS_CATEGORY,
      "crisis",
    ]);
  });

  it("keeps its own names in order, drops duplicates, and turns non-strings into the stand-in", () => {
    expect(classifierReportedCategories(["lexicon_match", "lexicon_match", "intent_with_plan"])).toEqual(["lexicon_match", "intent_with_plan"]);
    expect(classifierReportedCategories([null, 3, "crisis"])).toEqual([UNLISTED_CRISIS_CATEGORY, "crisis"]);
    expect(classifierReportedCategories([])).toEqual([]);
  });

  it("can never be longer than thirteen entries: twelve names and the stand-in", () => {
    const everything = [...CRISIS_EVENT_FIXED_CATEGORIES, "crisis_term:3", "free text", "more free text"];
    const list = classifierReportedCategories(everything);
    expect(list.length).toBeLessThanOrEqual(13);
    expect(list.length).toBeLessThanOrEqual(CRISIS_EVENT_CATEGORY_LIMIT);
    for (const entry of list) expect([...CLASSIFIER_REPORTED_CATEGORIES, UNLISTED_CRISIS_CATEGORY]).toContain(entry);
  });
});

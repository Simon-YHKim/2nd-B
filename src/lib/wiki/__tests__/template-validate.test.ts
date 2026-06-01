import { FORBIDDEN_TERMS } from "../../safety/lexicon";
import {
  draftHasForbiddenTerm,
  partitionTemplates,
  validateTemplateDraft,
  type TemplateDraft,
} from "../template-validate";

function draft(over: Partial<TemplateDraft> = {}): TemplateDraft {
  return {
    baseKind: "article",
    name: { en: "Recipe", ko: "레시피" },
    what: { en: "A cooking recipe", ko: "요리 레시피" },
    triggers: [],
    defaultTags: ["recipe"],
    targetCategory: "concepts",
    wikiTarget: "",
    aiProperties: [{ name: "servings", type: "number", describe: { en: "How many", ko: "몇 인분" } }],
    ...over,
  };
}

describe("partitionTemplates", () => {
  it("splits own rows from community (others') rows, preserving order", () => {
    const list = [
      { id: "a", ownerId: "me" },
      { id: "b", ownerId: "other" },
      { id: "c", ownerId: "me" },
      { id: "d", ownerId: "other2" },
    ];
    const { mine, community } = partitionTemplates(list, "me");
    expect(mine.map((t) => t.id)).toEqual(["a", "c"]);
    expect(community.map((t) => t.id)).toEqual(["b", "d"]);
  });

  it("returns empty arrays for an empty list", () => {
    expect(partitionTemplates([], "me")).toEqual({ mine: [], community: [] });
  });
});

describe("validateTemplateDraft", () => {
  it("accepts a clean draft", () => {
    expect(validateTemplateDraft(draft(), "ko")).toEqual({ ok: true, errors: [] });
  });

  it("accepts a name in only one locale", () => {
    expect(validateTemplateDraft(draft({ name: { en: "", ko: "레시피" } }), "en").ok).toBe(true);
    expect(validateTemplateDraft(draft({ name: { en: "Recipe", ko: "" } }), "en").ok).toBe(true);
  });

  it("requires a name in at least one locale", () => {
    const r = validateTemplateDraft(draft({ name: { en: "  ", ko: "" } }), "en");
    expect(r.ok).toBe(false);
    expect(r.errors).toHaveLength(1);
  });

  it("blocks a forbidden clinical term wherever it appears (en)", () => {
    const term = FORBIDDEN_TERMS.en[0];
    expect(draftHasForbiddenTerm(draft({ what: { en: `About ${term} stuff`, ko: "" } }))).toBe(true);
    expect(validateTemplateDraft(draft({ what: { en: `About ${term}`, ko: "" } }), "en").ok).toBe(false);
  });

  it("blocks a forbidden clinical term in Korean surfaces", () => {
    const term = FORBIDDEN_TERMS.ko[0];
    expect(validateTemplateDraft(draft({ name: { en: "X", ko: term } }), "ko").ok).toBe(false);
  });

  it("does not false-positive on a forbidden term embedded in a larger word (boundary-aware)", () => {
    // "cure" is in the lexicon, but "Secure" / "Procurement" must not trip the
    // gate — the canonical matcher uses English word boundaries.
    expect(draftHasForbiddenTerm(draft({ name: { en: "Secure inbox", ko: "" } }))).toBe(false);
    expect(validateTemplateDraft(draft({ name: { en: "Procurement log", ko: "" } }), "en").ok).toBe(true);
  });

  it("still blocks a forbidden term that first appears embedded but later standalone", () => {
    // "secure" contains "cure" (embedded), but a later standalone "cure" must
    // still trip the gate; the matcher scans every occurrence, not just the first.
    expect(draftHasForbiddenTerm(draft({ what: { en: "secure cure", ko: "" } }))).toBe(true);
    expect(validateTemplateDraft(draft({ what: { en: "a secure cure here", ko: "" } }), "en").ok).toBe(false);
  });

  it("scans nested aiProperty describe text for forbidden terms", () => {
    const term = FORBIDDEN_TERMS.en[0];
    const bad = draft({
      aiProperties: [{ name: "k", type: "text", describe: { en: term, ko: "" } }],
    });
    expect(draftHasForbiddenTerm(bad)).toBe(true);
  });

  it("is clean when no forbidden term is present", () => {
    expect(draftHasForbiddenTerm(draft())).toBe(false);
  });
});

// What may be written into a crisis record's category field
// (crisis_events.trigger_categories). The field is categorical: it must never
// carry anything a person or a model wrote. A classifier that reads meaning
// answers with free strings, so every list passes through here on its way to the
// record and only fixed names survive. Dependency-free on purpose.

// The server takes at most 16 entries for one record and refuses the whole
// record above that (0181, assert_client_crisis_event_payload).
export const CRISIS_EVENT_CATEGORY_LIMIT = 16;

// Stands in, once, for anything that is not on the list below.
export const UNLISTED_CRISIS_CATEGORY = "unlisted";

// The closed list. A new name is a decision, not a convenience: it is added here
// and nowhere else.
export const CRISIS_EVENT_FIXED_CATEGORIES: readonly string[] = [
  // where the record came from
  "input_red",
  "input_semantic_red",
  "interview_input_red",
  "record_save_red",
  "proxy_input_red",
  "proxy_input_red_unconfirmed",
  "output_swap",
  // the word list
  "crisis",
  "forbidden_lexicon",
  "lexicon_match",
  // the meaning classifier's rubric (llm/safety.ts, SYSTEM_PROMPT)
  "passive_ideation",
  "active_ideation_no_method",
  "active_ideation_with_method",
  "intent_no_plan",
  "intent_with_plan",
  "behavior_past",
  "behavior_preparation",
  "behavior_recent",
  "self_harm_non_suicidal",
  UNLISTED_CRISIS_CATEGORY,
];

const FIXED = new Set(CRISIS_EVENT_FIXED_CATEGORIES);

// crisis_term:1 to crisis_term:19, the fixed numbers of the Korean gate terms
// (model-reply-scan.ts). No other number and nothing after the number.
function isTermNumber(entry: string): boolean {
  const prefix = "crisis_term:";
  if (!entry.startsWith(prefix)) return false;
  const digits = entry.slice(prefix.length);
  if (digits.length < 1 || digits.length > 2) return false;
  for (const char of digits) {
    const code = char.charCodeAt(0);
    if (code < 48 || code > 57) return false;
  }
  if (digits.length === 2 && digits[0] === "0") return false;
  const value = Number(digits);
  return value >= 1 && value <= 19;
}

// The list as it may be recorded: fixed names and term numbers are kept in their
// order, anything else becomes one "unlisted", duplicates are dropped, and the
// list never passes the server's limit.
export function recordableCrisisCategories(categories: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const entry of categories) {
    const kept = typeof entry === "string" && (FIXED.has(entry) || isTermNumber(entry)) ? entry : UNLISTED_CRISIS_CATEGORY;
    if (!out.includes(kept)) out.push(kept);
  }
  return out.slice(0, CRISIS_EVENT_CATEGORY_LIMIT);
}

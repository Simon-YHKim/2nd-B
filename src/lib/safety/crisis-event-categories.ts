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

// crisis_term:1 to crisis_term:21, the fixed numbers of the Korean gate terms (0260 widened the server's list
// from 19; applied in production 2026-10-17). What the app writes uses the same cap
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
  return value >= 1 && value <= 21;
}

// The marker of a replaced AI reply. Only the app's code adds it (see
// classifierReportedCategories below), so a list that holds it is the record of
// an AI reply and a list without it is a record of the user's own words.
const AI_REPLY_MARKER = "output_swap";

// The list as it may be recorded. Fixed names are kept in their order,
// duplicates are dropped, and the list never passes the server's limit.
//
// Term numbers and the "unlisted" stand-in belong to records of a replaced AI
// reply only (Q-261013-66, the legal conditions of 2026-10-13):
//  - with the marker: a term number is kept, anything else off the list becomes
//    one "unlisted";
//  - without it (the user's own words): a term number or anything off the list
//    is dropped, and no stand-in is written. Such a record may end up empty.
export function recordableCrisisCategories(categories: readonly unknown[]): string[] {
  const aiReply = categories.includes(AI_REPLY_MARKER);
  const out: string[] = [];
  for (const entry of categories) {
    let kept: string | null = null;
    if (typeof entry === "string" && FIXED.has(entry) && entry !== UNLISTED_CRISIS_CATEGORY) kept = entry;
    else if (aiReply) kept = typeof entry === "string" && isTermNumber(entry) ? entry : UNLISTED_CRISIS_CATEGORY;
    if (kept !== null && !out.includes(kept)) out.push(kept);
  }
  return out.slice(0, CRISIS_EVENT_CATEGORY_LIMIT);
}

// What a classifier may report: the word list's three names and the meaning
// classifier's nine. The names that say where a record came from, and the term
// numbers, are never taken from a classifier's answer. Only the app's own code
// adds them, so a model cannot write "output_swap" or "crisis_term:7" into a
// record by answering with it.
export const CLASSIFIER_REPORTED_CATEGORIES: readonly string[] = [
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
];

const REPORTABLE = new Set(CLASSIFIER_REPORTED_CATEGORIES);

// A classifier's answer as it may be recorded: its twelve names are kept in their
// order, anything else (free text, a source name, a term number) becomes one
// "unlisted", duplicates are dropped, and the list stays within the limit.
export function classifierReportedCategories(reported: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const entry of reported) {
    const kept = typeof entry === "string" && REPORTABLE.has(entry) ? entry : UNLISTED_CRISIS_CATEGORY;
    if (!out.includes(kept)) out.push(kept);
  }
  return out.slice(0, CRISIS_EVENT_CATEGORY_LIMIT);
}

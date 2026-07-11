// RAG support engines per build-rag-wiki: fuse, distill, memorize.
// Engines retrieve/classify/rank already live in their own modules.
// Each function here is pure (no side effects beyond the explicit Supabase
// call in memorize) so tests can drive them deterministically.

import type { KnowledgeRow } from "./types";

// FUSE — multi-framework synthesis. Groups a flat candidate list by
// framework, then interleaves rows round-robin across groups. Yields a
// balanced spread when 2+ frameworks matched, so the Advisor prompt
// doesn't end up dominated by whichever framework happens to have more
// rows in knowledge_sources.
//
// Falls back to the input order when only one framework is present.
export function fuseFrameworks(rows: KnowledgeRow[], topN: number): KnowledgeRow[] {
  if (rows.length === 0) return [];
  const groups = new Map<string, KnowledgeRow[]>();
  for (const r of rows) {
    const k = r.framework;
    const arr = groups.get(k) ?? [];
    arr.push(r);
    groups.set(k, arr);
  }
  if (groups.size <= 1) return rows.slice(0, topN);
  const out: KnowledgeRow[] = [];
  const lists = [...groups.values()];
  let i = 0;
  while (out.length < topN) {
    let pulled = false;
    for (const list of lists) {
      if (list[i]) {
        out.push(list[i]);
        pulled = true;
        if (out.length >= topN) break;
      }
    }
    if (!pulled) break;
    i += 1;
  }
  return out;
}

// DISTILL — condense long context blocks down to a target character budget
// without losing structural cues. Splits on sentence boundaries (Korean
// 다/요/까/네 + Western .!?), keeps the first + last sentence (intro + most
// recent signal), and packs as many middle sentences as fit in priority
// order: shortest-first (cheaper) until budget exhausted.
export function distillContext(text: string, maxChars: number): string {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  const sentences = splitSentences(text);
  if (sentences.length <= 2) return text.slice(0, maxChars - 1) + "…";
  const first = sentences[0]!;
  const last = sentences[sentences.length - 1]!;
  const middle = sentences.slice(1, -1).slice().sort((a, b) => a.length - b.length);
  const kept: string[] = [first];
  let budget = maxChars - first.length - last.length - 4; // " … " separator
  for (const s of middle) {
    if (s.length + 1 <= budget) {
      kept.push(s);
      budget -= s.length + 1;
    }
  }
  kept.push(last);
  if (kept.length < sentences.length) {
    // Insert an ellipsis between non-contiguous segments. Collapse the empty-middle
    // case (only first + last survived, e.g. their combined length already blows the
    // budget) to a single gap so the result is never "first …  … last", and hard-cap
    // to maxChars — the two 3-char " … " separators otherwise let the output run a
    // few chars past the budget the caller (and DB column) sized for.
    const mid = kept.slice(1, -1).join(" ");
    const out = mid ? `${first} … ${mid} … ${last}` : `${first} … ${last}`;
    return out.length > maxChars ? out.slice(0, maxChars - 1) + "…" : out;
  }
  return kept.join(" ");
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|(?<=[다요까네])\s+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// MEMORIZE — persist an observed pattern keyed by user. Pure builder
// function — returns the row payload to write. The actual insert is the
// caller's responsibility (so this module stays free of supabase deps
// and easy to test).
export interface MemorizeInput {
  userId: string;
  matchedBatches: string[];
  triggers: string[];
  text: string;
  zone: "green" | "yellow" | "red";
}

export interface MemorizedPattern {
  user_id: string;
  pattern_kind: string;
  evidence_batches: string[];
  triggers: string[];
  summary: string;
  recorded_zone: "green" | "yellow" | "red";
}

// Distillation cap on stored summaries — short enough that the personas
// table doesn't bloat across years of journaling, long enough to keep
// the signal recoverable. Aligns with ai_followup max length (~8KB).
const MEMORIZE_MAX_CHARS = 280;

export function buildMemorizedPattern(input: MemorizeInput): MemorizedPattern {
  const kind = input.matchedBatches[0] ?? "general";
  const summary = distillContext(input.text, MEMORIZE_MAX_CHARS);
  return {
    user_id: input.userId,
    pattern_kind: kind,
    evidence_batches: input.matchedBatches,
    triggers: input.triggers,
    summary,
    recorded_zone: input.zone,
  };
}

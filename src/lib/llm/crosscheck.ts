// Adversarial cross-validation: gpt-5.6-sol tries to break a draft, claude opus
// answers it and rewrites. REQ-260823-03 §3, Simon 2026-08-23.
//
// ── WHAT THIS IS FOR ─────────────────────────────────────────────────────────
//
// The whole-corpus deep reads (persona_synthesis first) produce a claim about
// who someone is, from everything they have written, and the user reads the
// result as a statement about themselves. That is the one place in this app
// where a fluent wrong answer costs the most and is hardest to notice - it
// sounds exactly like a fluent right one.
//
// So the output gets attacked before it ships. One model drafts, a DIFFERENT
// model on a DIFFERENT vendor tries to find what is unsupported in it, and the
// drafter answers the objections in a rewrite.
//
// ── THE PROPERTY THAT MAKES IT WORTH THE MONEY, AND HOW IT CAN VANISH ────────
//
// The value here is disagreement that costs something to produce. Two calls to
// the same model is not that: it is one model agreeing with itself at twice the
// price, and it would look identical in the ledger, in the logs and on screen.
//
// That is not hypothetical. Vendor comes from the purpose (PHASE2_VENDOR), and
// EXPO_PUBLIC_LLM_VENDOR=openai - a value this project has held for most of the
// week - collapses every seat onto one vendor, including both sides of this.
// So the split is CHECKED before anything is spent, and a collapsed split is
// refused rather than silently served. `ready()` is the load-bearing function
// in this file, not `crosscheck()`.
//
// ── COST ─────────────────────────────────────────────────────────────────────
//
// A round is two calls, both on the most expensive rungs in the system
// (sol at high, opus at max). The floor is therefore 3x a plain synthesis, not
// 2x. Hence: off by default, an explicit allowlist of low-frequency purposes,
// a hard round cap, and an early exit the moment the challenger has nothing
// substantive left.

import { callLlm } from "./boundary";
import { INJECTION_GUARD, wrapUntrusted } from "./untrusted";
import { resolveVendorForPurpose } from "./routing";
import type { LlmVendor } from "./routing";
import type { PromptPurpose, ReasoningEffort } from "./types";

/**
 * Purposes allowed to run a cross-check.
 *
 * Deliberately tiny. Every entry multiplies that purpose's cost by at least
 * three, so this list is a spending decision and reads as one. persona_synthesis
 * is first because Simon named it and because it is the claim the user is most
 * likely to take personally.
 */
export const CROSSCHECKABLE: ReadonlySet<PromptPurpose> = new Set<PromptPurpose>(["persona_synthesis"]);

/**
 * Hard ceiling on rounds, not a default.
 *
 * Two is already six calls with the draft. A debate that has not converged by
 * then is not going to converge by spending more - it is a sign the draft's
 * evidence is thin, which the caller should surface rather than pay to argue
 * about.
 */
export const MAX_ROUNDS = 2;

/** Off unless an operator turns it on. See the cost note in the header. */
export function crosscheckEnabled(): boolean {
  return (process.env.EXPO_PUBLIC_CROSSCHECK ?? "").trim() === "1";
}

export type NotReady =
  | { ok: false; reason: "disabled" }
  | { ok: false; reason: "purpose_not_allowed" }
  | { ok: false; reason: "vendors_collapsed"; vendor: LlmVendor };

export type Ready = { ok: true; challenger: LlmVendor; defender: LlmVendor };

/**
 * Can a cross-check run right now, and would it mean anything if it did?
 *
 * Called BEFORE any spending. The third answer is the one worth having: when
 * both sides resolve to the same vendor the check is refused, because the
 * result would be indistinguishable from a real one while being worth nothing.
 */
export function ready(purpose: PromptPurpose): Ready | NotReady {
  if (!crosscheckEnabled()) return { ok: false, reason: "disabled" };
  if (!CROSSCHECKABLE.has(purpose)) return { ok: false, reason: "purpose_not_allowed" };

  const challenger = resolveVendorForPurpose("crosscheck_challenge", false);
  const defender = resolveVendorForPurpose("crosscheck_defend", false);
  if (challenger === defender) return { ok: false, reason: "vendors_collapsed", vendor: challenger };
  return { ok: true, challenger, defender };
}

export interface CrosscheckInput {
  /** The draft to attack. Produced by the caller's normal path. */
  draft: string;
  /** The evidence the draft was built from, passed to both sides verbatim. */
  evidence: string;
  purpose: PromptPurpose;
  userId: string;
  locale: "en" | "ko";
  minor?: boolean;
  rounds?: number;
  /**
   * Appended to the defender's instructions when the draft is not prose.
   *
   * The whole-corpus deep reads emit structured JSON, and a defender told only
   * to "return the rewritten claim" can reasonably answer in sentences. The
   * caller would then parse nothing and lose the output entirely - a
   * cross-check that destroys what it was checking. The caller still has to
   * guard the parse (see persona-synthesis), because a prompt is a request and
   * not a guarantee; this just stops the obvious failure.
   */
  outputContract?: string;
  signal?: AbortSignal;
}

export interface CrosscheckRound {
  objections: string[];
  substantive: boolean;
}

export interface CrosscheckResult {
  /** The text to use. The draft itself when nothing survived challenge. */
  text: string;
  rounds: CrosscheckRound[];
  /** True when the challenger ran out of substantive objections. */
  consensus: boolean;
  challenger: LlmVendor;
  defender: LlmVendor;
  /** Set when the check could not run; `text` is then the untouched draft. */
  skipped?: NotReady["reason"];
}

const CHALLENGE_SCHEMA = {
  type: "object",
  properties: {
    objections: { type: "array", items: { type: "string" } },
    substantive: { type: "boolean" },
  },
  required: ["objections", "substantive"],
} as const;

// The challenger is told to attack the EVIDENCE LINK, not the writing. A critic
// pointed at style produces style notes, which read like work and change
// nothing about whether the claim is true.
const CHALLENGE_SYSTEM = [
  "You are reviewing a claim another model wrote about a person, using only the evidence given.",
  "Find statements the evidence does not support: leaps, invented specifics, and confident",
  "generalisations from one or two data points.",
  "Ignore style, tone and length entirely - they are not your job.",
  'Set "substantive" to false when every objection you have is a matter of wording,',
  "or when you have none. Saying there is nothing left is a valid and useful answer;",
  "inventing an objection to look thorough is not.",
].join("\n");

const DEFEND_SYSTEM = [
  "Another model challenged a claim you wrote about a person. Answer the objections",
  "by REWRITING the claim, not by arguing with the critic.",
  "Where an objection is right, cut or soften what the evidence does not carry.",
  "Where it is wrong, keep the statement and let the evidence speak.",
  "Return only the rewritten claim.",
].join("\n");

/**
 * Run the adversarial rounds. Both calls go through callLlm, so both land in
 * ai_audit_log with their own vendor and effort - the ledger shows the debate,
 * not just its conclusion, which is what makes the spend auditable after the
 * fact.
 *
 * Fails SOFT in every direction: a refused pre-flight, a thrown call or an
 * unusable reply all return the original draft. A cross-check that cannot run
 * must never cost the user their synthesis.
 */
export async function crosscheck(input: CrosscheckInput): Promise<CrosscheckResult> {
  const gate = ready(input.purpose);
  if (!gate.ok) {
    return {
      text: input.draft,
      rounds: [],
      consensus: false,
      challenger: "gemini",
      defender: "gemini",
      skipped: gate.reason,
    };
  }

  const limit = Math.max(1, Math.min(input.rounds ?? 1, MAX_ROUNDS));
  const rounds: CrosscheckRound[] = [];
  let current = input.draft;
  let consensus = false;

  for (let i = 0; i < limit; i++) {
    let round: CrosscheckRound;
    try {
      const challenge = await callLlm<CrosscheckRound>({
        purpose: "crosscheck_challenge",
        // F-07 (audit 260904): evidence is user-influenced (clipped/imported
        // content, user tags) and the claim is a prior model draft — either can
        // carry instruction-like text into this reviewer prompt. Fence both as
        // untrusted data and prepend the injection guard, the same protection
        // every other LLM surface uses (src/lib/llm/untrusted.ts). The final
        // persona parser still re-grounds the output, so this is defense in depth.
        system: `${INJECTION_GUARD[input.locale]}\n\n${CHALLENGE_SYSTEM}`,
        user: `EVIDENCE:\n${wrapUntrusted("evidence", input.evidence)}\n\nCLAIM:\n${wrapUntrusted("claim", current)}`,
        responseSchema: CHALLENGE_SCHEMA as unknown as Record<string, unknown>,
        userId: input.userId,
        locale: input.locale,
        minor: input.minor,
        signal: input.signal,
      });
      const parsed = challenge.text as unknown as CrosscheckRound | string;
      round =
        typeof parsed === "object" && parsed !== null && Array.isArray(parsed.objections)
          ? { objections: parsed.objections, substantive: parsed.substantive === true }
          : { objections: [], substantive: false };
    } catch {
      // The challenger failing is not a reason to lose the draft. Stop here and
      // return what we have, marked as no-consensus so a caller can tell this
      // from a clean agreement.
      break;
    }

    rounds.push(round);
    if (!round.substantive || round.objections.length === 0) {
      consensus = true;
      break;
    }

    try {
      const defence = await callLlm({
        purpose: "crosscheck_defend",
        // Same F-07 fencing. The objections are the challenger's own output re-fed
        // here, so they are model-generated-but-untrusted too. outputContract is a
        // hardcoded caller constant (persona-synthesis.ts), the one genuinely
        // trusted instruction in this prompt, so it stays OUTSIDE the fence.
        system: input.outputContract
          ? `${INJECTION_GUARD[input.locale]}\n\n${DEFEND_SYSTEM}\n\n${input.outputContract}`
          : `${INJECTION_GUARD[input.locale]}\n\n${DEFEND_SYSTEM}`,
        user: [
          `EVIDENCE:\n${wrapUntrusted("evidence", input.evidence)}`,
          `YOUR CLAIM:\n${wrapUntrusted("claim", current)}`,
          `OBJECTIONS:\n${wrapUntrusted("objections", round.objections.map((o, n) => `${n + 1}. ${o}`).join("\n"))}`,
        ].join("\n\n"),
        userId: input.userId,
        locale: input.locale,
        minor: input.minor,
        signal: input.signal,
      });
      const rewritten = typeof defence.text === "string" ? defence.text.trim() : "";
      // An empty rewrite is a failed defence, not an instruction to publish
      // nothing. Keep the previous text.
      if (rewritten.length > 0) current = rewritten;
    } catch {
      break;
    }
  }

  return { text: current, rounds, consensus, challenger: gate.challenger, defender: gate.defender };
}

/** The effort each side asks for, exported so the cost of a round is legible. */
export const CROSSCHECK_EFFORT: Readonly<Record<"challenge" | "defend", ReasoningEffort>> = {
  challenge: "high",
  defend: "max",
};

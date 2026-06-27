// Layer C of the constellation 3-layer model (PRD §4.4, docs/CONSTELLATION-DESIGN.md
// §3): the 북극성 synthesis harness. Takes the deterministic layer-A domain
// summaries + the layer-B construct estimates and proposes real-time persona(s)
// (역할/모자). Mirrors propose-self-model.ts: a pure prompt builder + a defensive,
// lexicon-guarded parser, plus a thin callGemini orchestrator so C1/C3/C9 hold.
//
// Hard rules enforced here, not trusted to the model:
//  - Grounding (C8, §3.1): a persona is kept ONLY if it cites >=1 domain AND >=1
//    construct that actually exist in the input. Ungrounded claims are dropped.
//  - claimStrength is COMPUTED (min level over the cited evidence), never set by
//    the LLM — the brightness-honesty rule: a claim is only as strong as its
//    weakest evidence.
//  - Lexicon (§11): any persona carrying clinical/medical wording is dropped.
//  - Display cap 3 (§17-b): keep the strongest-grounded personas.
// The synthesis NEVER writes the self-model; it is a proposal (propose->ratify).

import { callGemini } from "../llm/gemini";
import { containsForbiddenLexicon } from "../safety/classifier";
import type { LadderLevel } from "./brightness";
import { isDomainId, type DomainId } from "./domain-stars";

// Deterministic layer-A summary for one domain star (LLM-free; from domain-confidence).
export interface DomainSummary {
  domain: DomainId;
  level: LadderLevel;
  itemCount: number;
  topTags?: string[];
}

// One layer-B construct estimate (Big Five trait / attachment / SDT / VIA / ...).
// `level` is its brightness/confidence; `domains` are the corroborating domains
// (§2.2 triangulation), used for evidence display.
export interface ConstructEstimate {
  construct: string;
  level: LadderLevel;
  domains?: DomainId[];
}

export interface PersonaSynthesisInput {
  domainSummaries: DomainSummary[];
  constructEstimates: ConstructEstimate[];
  // Stability (§3.3): prior ratified/proposed personas, so the LLM proposes a diff
  // rather than a fresh set each run ("매 세션 다른 나" 방지).
  priorPersonas?: SynthesizedPersona[];
}

export interface SynthesizedPersona {
  /** Stable id (role slug) so the persona survives across syntheses. */
  id: string;
  /** The role / 모자 label. */
  label: string;
  evidence: { domains: DomainId[]; constructs: string[] };
  /** Computed = min level over cited evidence. NOT LLM-set. */
  claimStrength: LadderLevel;
  summary: string;
  strengths: string[];
  advice: string;
}

export const PERSONA_SYNTHESIS_MAX = 3 as const;

// Gemini structured-output schema (matches wiki/phase1.ts casing). claimStrength is
// intentionally absent — it is computed, never emitted by the model.
export const PERSONA_SYNTHESIS_SCHEMA = {
  type: "OBJECT",
  properties: {
    personas: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          label: { type: "STRING" },
          evidence: {
            type: "OBJECT",
            properties: {
              domains: { type: "ARRAY", items: { type: "STRING" } },
              constructs: { type: "ARRAY", items: { type: "STRING" } },
            },
            required: ["domains", "constructs"],
          },
          summary: { type: "STRING" },
          strengths: { type: "ARRAY", items: { type: "STRING" } },
          advice: { type: "STRING" },
        },
        required: ["label", "evidence", "summary"],
      },
    },
  },
  required: ["personas"],
} as const;

function slugify(label: string, index: number): string {
  const s = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return s.length > 0 ? s.slice(0, 48) : `persona-${index + 1}`;
}

// Pure -> deterministic. Builds the synthesis prompt. Lists the AVAILABLE domain
// ids + construct names so the model can only cite real evidence, and passes prior
// personas so it proposes a diff (stability).
export function buildPersonaSynthesisPrompt(
  input: PersonaSynthesisInput,
  locale: "en" | "ko",
): { system: string; user: string } {
  const domainList = input.domainSummaries.map((d) => d.domain).join(", ");
  const constructList = input.constructEstimates.map((c) => c.construct).join(", ");
  const system =
    locale === "ko"
      ? [
          "사용자의 삶 도메인 요약과 검증틀(구인) 추정을 종합해 대표 페르소나(역할/모자)를 1~3개 제안하세요. JSON만 출력합니다.",
          "각 페르소나는 반드시 제공된 도메인 1개 이상 + 구인 1개 이상을 근거(evidence)로 인용해야 합니다. 근거 없는 페르소나는 만들지 마세요.",
          "임상·의료 용어는 절대 쓰지 마세요. 판단이 아니라 기록에서 보이는 패턴으로 표현합니다.",
          `인용 가능한 도메인: ${domainList}`,
          `인용 가능한 구인: ${constructList}`,
          "",
          "JSON 형식:",
          '{ "personas": [ { "id": "역할 슬러그", "label": "역할 이름",',
          '   "evidence": { "domains": ["..."], "constructs": ["..."] },',
          '   "summary": "한두 문장 요약", "strengths": ["강점", ...], "advice": "조언 한 줄" } ] }',
        ].join("\n")
      : [
          "Synthesize the user's life-domain summaries and validation-framework (construct) estimates into 1-3 representative personas (roles / hats). Return strict JSON only.",
          "Every persona MUST cite at least one provided domain AND at least one construct as evidence. Do not invent ungrounded personas.",
          "Never use clinical or medical vocabulary. Frame as patterns seen in the records, not a verdict.",
          `Citable domains: ${domainList}`,
          `Citable constructs: ${constructList}`,
          "",
          "JSON shape:",
          '{ "personas": [ { "id": "role-slug", "label": "Role name",',
          '   "evidence": { "domains": ["..."], "constructs": ["..."] },',
          '   "summary": "one or two sentences", "strengths": ["strength", ...], "advice": "one-line advice" } ] }',
        ].join("\n");

  const domainLines = input.domainSummaries
    .map((d) => `- ${d.domain}: L${d.level}, ${d.itemCount} items${d.topTags?.length ? ` (${d.topTags.join(", ")})` : ""}`)
    .join("\n");
  const constructLines = input.constructEstimates
    .map((c) => `- ${c.construct}: L${c.level}${c.domains?.length ? ` (from ${c.domains.join(", ")})` : ""}`)
    .join("\n");
  const priorLines = input.priorPersonas?.length
    ? `\n\nPrior personas (propose a diff, keep stable ones):\n` +
      input.priorPersonas.map((p) => `- ${p.label} [${p.evidence.domains.join("/")}]`).join("\n")
    : "";
  const user = `Domains:\n${domainLines}\n\nConstructs:\n${constructLines}${priorLines}`;
  return { system, user };
}

// Pure -> tested. Parses + grounds + scores the LLM reply into SynthesizedPersona[].
// Drops ungrounded / lexicon-flagged personas; computes claimStrength from the
// input levels (never the LLM); caps to PERSONA_SYNTHESIS_MAX by strength.
export function parsePersonaSynthesis(
  raw: string,
  input: PersonaSynthesisInput,
): SynthesizedPersona[] {
  let parsed: { personas?: unknown };
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return [];
    parsed = JSON.parse(match[0]) as { personas?: unknown };
  } catch {
    return [];
  }
  if (!Array.isArray(parsed.personas)) return [];

  const domainLevel = new Map<DomainId, LadderLevel>(
    input.domainSummaries.map((d) => [d.domain, d.level]),
  );
  const constructLevel = new Map<string, LadderLevel>(
    input.constructEstimates.map((c) => [c.construct, c.level]),
  );

  const out: SynthesizedPersona[] = [];
  parsed.personas.forEach((rawP, i) => {
    if (!rawP || typeof rawP !== "object") return;
    const p = rawP as Record<string, unknown>;
    const ev = (p.evidence ?? {}) as Record<string, unknown>;

    // Keep only cited evidence that actually exists in the input (anti-hallucination).
    const domains = (Array.isArray(ev.domains) ? ev.domains : [])
      .map((d) => String(d))
      .filter((d): d is DomainId => isDomainId(d) && domainLevel.has(d as DomainId));
    const constructs = (Array.isArray(ev.constructs) ? ev.constructs : [])
      .map((c) => String(c))
      .filter((c) => constructLevel.has(c));

    // Grounding (C8): need >=1 real domain AND >=1 real construct, else drop.
    if (domains.length === 0 || constructs.length === 0) return;

    const label = typeof p.label === "string" ? p.label.trim().slice(0, 60) : "";
    const summary = typeof p.summary === "string" ? p.summary.trim().slice(0, 400) : "";
    if (label.length === 0 || summary.length === 0) return;
    const strengths = (Array.isArray(p.strengths) ? p.strengths : [])
      .map((s) => String(s).trim().slice(0, 80))
      .filter((s) => s.length > 0)
      .slice(0, 5);
    const advice = typeof p.advice === "string" ? p.advice.trim().slice(0, 280) : "";

    // Lexicon gate (§11): drop any persona with clinical/medical wording.
    const surface = [label, summary, advice, ...strengths].join(" \n ");
    if (
      containsForbiddenLexicon(surface, "en").length > 0 ||
      containsForbiddenLexicon(surface, "ko").length > 0
    ) {
      return;
    }

    // claimStrength = min level over cited evidence (brightness-honesty).
    const levels = [
      ...domains.map((d) => domainLevel.get(d)!),
      ...constructs.map((c) => constructLevel.get(c)!),
    ];
    const claimStrength = Math.min(...levels) as LadderLevel;

    const id = typeof p.id === "string" && p.id.trim() ? slugify(p.id, i) : slugify(label, i);
    // dedupe both unique-domain and unique-construct lists
    out.push({
      id,
      label,
      evidence: { domains: [...new Set(domains)], constructs: [...new Set(constructs)] },
      claimStrength,
      summary,
      strengths,
      advice,
    });
  });

  // Strongest-grounded first; break ties by evidence breadth. Cap to display max.
  out.sort(
    (a, b) =>
      b.claimStrength - a.claimStrength ||
      b.evidence.domains.length + b.evidence.constructs.length -
        (a.evidence.domains.length + a.evidence.constructs.length),
  );
  return out.slice(0, PERSONA_SYNTHESIS_MAX);
}

// Thin orchestrator: C1 (single wrapper) + C9/C3 enforced inside callGemini. Returns
// [] in mock mode (until a mock entry lands), on a bad reply, or when nothing is
// grounded. The result is a PROPOSAL — the ratify bridge (persona target) lands next.
export async function synthesizePersonas(
  userId: string,
  input: PersonaSynthesisInput,
  locale: "en" | "ko",
  minor = false,
): Promise<SynthesizedPersona[]> {
  if (input.domainSummaries.length === 0 || input.constructEstimates.length === 0) return [];
  const { system, user } = buildPersonaSynthesisPrompt(input, locale);
  const reply = await callGemini({
    userId,
    locale,
    purpose: "persona_synthesis",
    system,
    user,
    responseSchema: PERSONA_SYNTHESIS_SCHEMA as unknown as Record<string, unknown>,
    minor,
  });
  return parsePersonaSynthesis(reply.text, input);
}

// LLM orchestrator for the self-model propose -> ratify loop (memo §3f). Mirrors
// wiki/propose-template.ts: a pure prompt builder + a defensive, lexicon-guarded
// parser, plus a thin callGemini orchestrator so C1/C3/C9 hold at the call site.
// The AI proposes a SelfModelProposal (diff + cited rationale + target level); it
// NEVER writes the self-model - the user ratifies (persona/proposal.ts). The
// parser drops any proposal that is unchanged, empty, or clinically worded.

import { callGemini } from "../llm/gemini";
import type { LadderLevel } from "./brightness";
import {
  isPresentableProposal,
  type ProposalTarget,
  type SelfModelProposal,
} from "./proposal";

function targetLabel(target: ProposalTarget): string {
  if (target.kind === "star") return `self-understanding star "${target.star}"`;
  if (target.kind === "soulCore") return "Soul Core aggregate reading";
  return "north-star philosophy sentence";
}

// Pure -> deterministic. Builds the propose-a-change prompt for one self-model target.
export function buildSelfModelProposalPrompt(
  target: ProposalTarget,
  currentValue: string,
  evidence: string,
  locale: "en" | "ko",
): { system: string; user: string } {
  const what = targetLabel(target);
  const system =
    locale === "ko"
      ? [
          `사용자의 자기 모델 중 ${what} 에 대한 변경을 제안하세요. JSON만 출력합니다.`,
          "임상·의료 용어는 절대 쓰지 마세요. 판단이 아니라 기록에서 보이는 패턴으로 표현합니다.",
          "",
          "JSON 형식:",
          '{ "after": "제안하는 새 값(한 줄)",',
          '  "rationale": "근거 - 기록에서 관찰된 패턴, 일상어로",',
          '  "citations": ["근거가 된 기록 id 또는 슬러그", ...] }',
        ].join("\n")
      : [
          `Propose a change to the user's self-model for the ${what}. Return strict JSON only.`,
          "Never use clinical or medical vocabulary. Frame it as patterns seen in the records, not a verdict.",
          "",
          "JSON shape:",
          '{ "after": "the proposed new value (one line)",',
          '  "rationale": "why - patterns observed in the records, everyday language",',
          '  "citations": ["record id or slug behind it", ...] }',
        ].join("\n");
  const user = `Current: ${currentValue}\n\nEvidence:\n${evidence.trim().slice(0, 3000)}`;
  return { system, user };
}

// Pure -> tested. Parses + sanitizes the LLM reply into a SelfModelProposal, or
// null when unusable / unchanged / lexicon-flagged (the C-vocabulary gate lives
// in isPresentableProposal -> isProposalClean), so the caller offers no proposal.
export function parseSelfModelProposal(
  raw: string,
  target: ProposalTarget,
  before: string,
  targetLevel: LadderLevel,
): SelfModelProposal | null {
  let parsed: Record<string, unknown>;
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    parsed = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
  const after = typeof parsed.after === "string" ? parsed.after.trim().slice(0, 280) : "";
  const rationale = typeof parsed.rationale === "string" ? parsed.rationale.trim().slice(0, 600) : "";
  const citations = Array.isArray(parsed.citations)
    ? parsed.citations.map((c) => String(c).slice(0, 80)).filter((c) => c.length > 0).slice(0, 8)
    : [];
  const proposal: SelfModelProposal = { target, before, after, rationale, citations, targetLevel };
  return isPresentableProposal(proposal) ? proposal : null;
}

// Thin orchestrator: C1 (single wrapper) + C9/C3 are enforced inside callGemini.
// Returns null in mock mode, on a bad reply, or when the proposal is filtered.
export async function proposeSelfModelChange(
  userId: string,
  target: ProposalTarget,
  before: string,
  evidence: string,
  targetLevel: LadderLevel,
  locale: "en" | "ko",
  minor = false,
): Promise<SelfModelProposal | null> {
  if (evidence.trim().length === 0) return null;
  const { system, user } = buildSelfModelProposalPrompt(target, before, evidence, locale);
  const reply = await callGemini({ userId, locale, purpose: "self_model_propose", system, user, minor });
  return parseSelfModelProposal(reply.text, target, before, targetLevel);
}

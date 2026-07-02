// Cheap, no-Gemini path to the seven-star levels + Soul Core brightness, for
// surfaces that need the constellation WITHOUT paying for buildPersona's LLM
// narrative summary (e.g. the home shell, which mounts on every app open).
// Reuses build.ts's signal loaders + deriveStarLevels; buildPersona stays the
// full path. deriveStarLevels reads only traitConfidence / attachment / values /
// patterns, so `traits` here is a placeholder and no Gemini call is made.

import { getSupabaseClient } from "../supabase/client";
import {
  DEFAULT_TRAITS,
  deriveValues,
  isMeasuredSource,
  loadLatestAttachment,
  loadLatestBfi,
  loadLatestIpip,
  loadMemorizedHistogram,
  traitConfidenceFor,
  type AuditResponseRow,
  type PersonaCard,
  type PersonaTraits,
  type TraitConfidence,
  type TraitsSource,
} from "./build";
import type { LadderLevel } from "./brightness";
import { deriveStarLevels } from "./star-levels";
import { loadEsmCount } from "./esm-count";
import { soulCoreBrightness, type StarId } from "./stars";

export interface StarBrightness {
  starLevels: Record<StarId, LadderLevel>;
  soulCoreBrightness: number;
}

export async function loadStarLevels(userId: string): Promise<StarBrightness> {
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from("records")
    .select("id, prompt, body, created_at, tags")
    .eq("user_id", userId)
    .eq("kind", "audit_response")
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as AuditResponseRow[];
  // Match buildPersona: interview transcripts don't count toward star1's
  // heuristic observation count.
  const proxyRows = rows.filter((r) => !(r.tags ?? []).includes("interview"));

  const [ipip, bfi, attachment, memorized] = await Promise.all([
    loadLatestIpip(supabase, userId),
    loadLatestBfi(supabase, userId),
    loadLatestAttachment(supabase, userId),
    loadMemorizedHistogram(supabase, userId),
  ]);

  // Prefer the more detailed instrument (IPIP-NEO-120 > BFI-44) for the
  // constellation's brightness, mirroring buildPersona. A 120-item IPIP result
  // with no BFI now lights the validated-instrument level instead of heuristic.
  const traitsSource: TraitsSource = ipip ? "ipip" : bfi ? "bfi" : "heuristic";
  const tc: TraitConfidence = traitConfidenceFor(
    traitsSource,
    isMeasuredSource(traitsSource) ? 1 : proxyRows.length,
  );
  const traitConfidence: Record<keyof PersonaTraits, TraitConfidence> = {
    openness: tc,
    conscientiousness: tc,
    extraversion: tc,
    agreeableness: tc,
    neuroticism: tc,
  };

  const topKinds = Object.entries(memorized)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const patterns: Record<string, string> = {};
  for (const [kind, count] of topKinds) patterns[`top_${kind}`] = `${count}`;

  const card: PersonaCard = {
    version: 1,
    traits: DEFAULT_TRAITS,
    traitsSource,
    traitConfidence,
    mbti: null,
    attachment,
    values: deriveValues(rows),
    patterns,
    markdownExport: "",
  };

  const esmCount = await loadEsmCount(userId);
  const starLevels = deriveStarLevels(card, esmCount);
  return { starLevels, soulCoreBrightness: soulCoreBrightness(starLevels) };
}

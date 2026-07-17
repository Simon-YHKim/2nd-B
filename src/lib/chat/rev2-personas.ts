// rev2 세컨비 personas (PRD v2.0 §02/§05): ONE character, THREE personas that
// share the same conversation context. Selecting a persona changes only the
// voice hint woven into the system prompt, the head tint (m3.persona), and the
// engine mode (트위비 owns the existing Divergent mode). The C9 -> C3 ->
// gemini path, grounding, citations, and safety behavior are untouched.
//
// This is SEPARATE from src/lib/chat/personas.ts — that file is the legacy
// per-character roster reached via ?character= (deprecated skin, preserved).

import { tLocale } from "@/lib/i18n/text";
import type { SystemLocale } from "@/lib/i18n/locales";
import { m3, type M3Persona } from "@/lib/theme/m3";

/** Selector order: 2nd-B (default) · 메타비 · 트위비. Ids double as m3.persona keys. */
export const REV2_PERSONA_IDS = ["secondb", "meta", "twi"] as const satisfies readonly M3Persona[];
export type Rev2PersonaId = (typeof REV2_PERSONA_IDS)[number];

export function rev2PersonaName(id: Rev2PersonaId, locale: SystemLocale): string {
  return tLocale(locale, "secondb", `rev2.${id}.name`);
}

export function rev2PersonaRole(id: Rev2PersonaId, locale: SystemLocale): string {
  return tLocale(locale, "secondb", `rev2.${id}.role`);
}

/**
 * Voice hint woven into the chat system prompt. 2nd-B returns null so the
 * default persona is byte-identical to the shipped voice (no regression);
 * 메타비/트위비 return their voice-shaping hint.
 */
export function rev2PersonaHint(id: Rev2PersonaId, locale: SystemLocale): string | null {
  if (id === "secondb") return null;
  const hint = tLocale(locale, "secondb", `rev2.${id}.systemHint`);
  return hint.length > 0 ? hint : null;
}

/** 트위비 owns Divergent: selecting it engages that engine mode. */
export function rev2PersonaMode(id: Rev2PersonaId): "analytic" | "divergent" {
  return id === "twi" ? "divergent" : "analytic";
}

/** Accent for chips/indicators — single source: m3.persona. */
export function rev2PersonaAccent(id: Rev2PersonaId): string {
  return m3.persona[id].accent;
}

/** Translucent lens fill behind the banner / selected toggle / cite chips. */
export function rev2PersonaSoftBg(id: Rev2PersonaId): string {
  return m3.persona[id].softBg;
}

/** On-accent ink used on the tinted lens fill (cite-chip label, tag). */
export function rev2PersonaOnSoft(id: Rev2PersonaId): string {
  return m3.persona[id].soft;
}

/** Accent bloom under the persona status dot. */
export function rev2PersonaGlow(id: Rev2PersonaId): string {
  return m3.persona[id].glow;
}

/**
 * Display name shown on the lens toggle (reference ChatScreen: KO 세컨비/메타비/
 * 트위비). Distinct from rev2PersonaName (the brand tag "2nd-B" used elsewhere).
 */
export function rev2PersonaLensName(id: Rev2PersonaId, locale: SystemLocale): string {
  return tLocale(locale, "secondb", `rev2.${id}.lensName`);
}

/** Monospace brand tag under the lens name (2nd-B / Meta-B / Twi-B). */
export function rev2PersonaTag(id: Rev2PersonaId, locale: SystemLocale): string {
  return tLocale(locale, "secondb", `rev2.${id}.tag`);
}

/** One-line lens description shown in the persona banner. */
export function rev2PersonaDesc(id: Rev2PersonaId, locale: SystemLocale): string {
  return tLocale(locale, "secondb", `rev2.${id}.desc`);
}

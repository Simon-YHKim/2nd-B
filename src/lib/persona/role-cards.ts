// Polaris role cards are derived from saved life-star interviews. Generation is
// explicit; only a user-ratified card may become a second-tier graph star.
// Keep this versioned cache with the existing persona row so the live app does
// not require a remote schema change to recover the missing wiring.
import { getSupabaseClient } from "../supabase/client";
import { baseLevelFor, type LadderLevel } from "./brightness";
import { loadPersonaSnapshot, type PersonaCard } from "./build";
import { loadSevenLevels } from "./load-seven-levels";
import { synthesizePersonas, type PersonaSynthesisInput, type SynthesizedPersona } from "./persona-synthesis";
import { isSevenStarId, type SevenStarId } from "./seven-stars";
import { getEnv } from "../env";
import { randomUUID } from "expo-crypto";
import { rpcWithCapturedSession } from "../supabase/captured-session-client";
import { failPolarisGeneration, loadPolarisQuota, reservePolarisGeneration } from "./polaris-quota";
import { isQaPolarisAutoEligible } from "./polaris-progress";
import { beginAccountSessionLease } from "../auth/account-session-lease";

export const ROLE_CARDS_KEY = "role_cards_v1";
export interface RoleCard extends SynthesizedPersona {
  evidenceRefs: string[];
  status: "proposed" | "ratified";
}

interface InterviewRow {
  id: string;
  audit_period: string | null;
  body: string | null;
  tags: string[] | null;
}

type PatternRow = { patterns: Record<string, unknown> | null };

export function parseRoleCards(value: unknown): RoleCard[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is RoleCard => {
      if (!item || typeof item !== "object") return false;
      const card = item as Partial<RoleCard>;
      return typeof card.id === "string" && typeof card.label === "string" &&
        typeof card.summary === "string" && (card.status === "proposed" || card.status === "ratified") &&
        Array.isArray(card.evidenceRefs) && card.evidenceRefs.every((ref) => typeof ref === "string" && /^record:[0-9a-f-]{36}$/i.test(ref)) &&
        Array.isArray(card.evidence?.domains) && card.evidence.domains.every((id) => isSevenStarId(String(id))) &&
        Array.isArray(card.evidence?.constructs) && typeof card.claimStrength === "number";
    }).slice(0, 3);
  } catch {
    return [];
  }
}

async function readPatterns(userId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await getSupabaseClient().from("personas")
    .select("patterns").eq("user_id", userId).eq("version", 1).maybeSingle();
  if (error) throw error;
  const patterns = (data as PatternRow | null)?.patterns;
  return patterns && typeof patterns === "object" && !Array.isArray(patterns) ? patterns : null;
}

export async function loadRoleCards(userId: string): Promise<RoleCard[]> {
  if (!userId) return [];
  const patterns = await readPatterns(userId);
  return parseRoleCards(patterns?.[ROLE_CARDS_KEY]);
}

export function roleEvidenceIds(cards: readonly RoleCard[]): string[] {
  return [...new Set(cards.filter((card) => card.status === "ratified")
    .flatMap((card) => card.evidenceRefs)
    .filter((ref) => /^record:[0-9a-f-]{36}$/i.test(ref))
    .map((ref) => ref.slice(7)))].slice(0, 60);
}

async function writeRoleCards(userId: string, cards: RoleCard[]): Promise<void> {
  const patterns = await readPatterns(userId);
  if (!patterns) throw new Error("Persona snapshot is not available");
  const { data, error } = await getSupabaseClient().from("personas")
    .update({ patterns: { ...patterns, [ROLE_CARDS_KEY]: JSON.stringify(cards) } })
    .eq("user_id", userId).eq("version", 1)
    .select("user_id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Persona role cards were not saved");
}

/** Keep the end of a long interview as well as its opening. */
export function interviewEvidenceExcerpt(body: string, max = 290): string {
  const text = body.trim();
  if (text.length <= max) return text;
  const part = Math.floor((max - 6) / 3);
  const middle = Math.floor(text.length / 2 - part / 2);
  return `${text.slice(0, part)} … ${text.slice(middle, middle + part)} … ${text.slice(-part)}`;
}

const qaClaims = new Set<string>();
/** One automatic QA attempt across route mounts/reloads; never a quota ledger. */
export async function claimQaPolarisAuto(userId: string, hasCards: boolean, hasEvidence: boolean): Promise<boolean> {
  if (!__DEV__ || typeof window === "undefined" || getEnv().EXPO_PUBLIC_LLM_MODE !== "live" || qaClaims.has(userId)) return false;
  // v1 could be consumed before the reservation RPC existed. v2 starts only
  // after the server reports an available generation.
  const storageKey = `polaris.qa-auto.v2:${userId}`;
  try {
    if (window.localStorage.getItem(storageKey)) return false;
    const client = getSupabaseClient();
    const [{ data: auth, error: authError }, { data: grant, error }] = await Promise.all([
      client.auth.getUser(),
      // The effective-tier RPC is service-internal. Like useProgression, read
      // the RLS-owned, server-written grant; never use local FORCE_TIER here.
      client.from("users").select("id, subscription_tier, subscription_expires_at").eq("id", userId).maybeSingle(),
    ]);
    const expiresAt = grant?.subscription_expires_at;
    const activeGrant = expiresAt === null ||
      (typeof expiresAt === "string" && Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) >= Date.now());
    const tier = grant?.id === userId && activeGrant ? grant.subscription_tier : null;
    if (authError || error || !isQaPolarisAutoEligible({ dev: __DEV__, userId, sessionUserId: auth.user?.id,
      email: auth.user?.email, tier, hasCards, hasEvidence,
      attempted: qaClaims.has(userId) || Boolean(window.localStorage.getItem(storageKey)) })) return false;
    // The new Edge path requires a server reservation. Wait for that contract
    // instead of consuming the QA attempt against an undeployed status RPC.
    if (!(await loadPolarisQuota(userId)).available || qaClaims.has(userId) || window.localStorage.getItem(storageKey)) return false;
    window.localStorage.setItem(storageKey, "attempted");
    qaClaims.add(userId);
    return true;
  } catch { return false; }
}

export function roleInputFromInterviews(
  rows: readonly InterviewRow[],
  levels: Record<SevenStarId, LadderLevel>,
  persona: PersonaCard,
  priorPersonas: SynthesizedPersona[],
): PersonaSynthesisInput {
  const byStar = new Map<SevenStarId, InterviewRow[]>();
  for (const row of rows) {
    if (!isSevenStarId(row.audit_period ?? "") || row.audit_period === "profile" ||
        !row.tags?.includes("interview") || !row.body?.trim()) continue;
    const id = row.audit_period as SevenStarId;
    const group = byStar.get(id) ?? [];
    group.push(row);
    byStar.set(id, group);
  }
  const domainSummaries = [...byStar].map(([domain, group]) => ({
    domain,
    level: levels[domain],
    itemCount: group.length,
    excerpts: group.slice(0, 3).reverse().map((r) => interviewEvidenceExcerpt(r.body!)),
  }));
  const constructEstimates = Object.entries(persona.traitConfidence ?? {})
    .filter(([, confidence]) => confidence.observationCount > 0)
    .map(([construct, confidence]) => ({ construct, level: baseLevelFor(confidence) }));
  // Interview-only users have no questionnaire or short-answer trait signal.
  // Their own life narrative is still an observed (same-source) construct, but
  // it can support only a tentative L2 proposal, never a measured claim.
  if (domainSummaries.length > 0 && constructEstimates.length === 0) {
    constructEstimates.push({ construct: "self-reported narrative (same-source)", level: 2 });
  }
  return { sourceKind: "life_star", domainSummaries, constructEstimates, priorPersonas };
}

export async function proposeRoleCards(
  userId: string, locale: "en" | "ko", minor = false,
): Promise<RoleCard[]> {
  if (!userId) return [];
  if (getEnv().EXPO_PUBLIC_LLM_MODE !== "live") throw new Error("polaris_live_required");
  const quota = await loadPolarisQuota(userId);
  if (!quota.available) throw new Error("polaris_unavailable");
  const previous = await loadRoleCards(userId);
  const { data, error } = await getSupabaseClient().from("records")
    .select("id, audit_period, body, tags")
    .eq("user_id", userId).eq("kind", "audit_response")
    .order("created_at", { ascending: false }).limit(120);
  if (error) throw error;
  const rows = (data ?? []) as InterviewRow[];
  if (!rows.some((row) => isSevenStarId(row.audit_period ?? "") && row.tags?.includes("interview") && row.body?.trim())) {
    throw new Error("polaris_no_evidence");
  }
  const [levels, persona] = await Promise.all([
    loadSevenLevels(userId),
    loadPersonaSnapshot(userId),
  ]);
  const input = roleInputFromInterviews(rows, levels.starLevels, persona ?? { traitConfidence: {} } as PersonaCard, previous.filter((p) => p.status === "ratified"));
  // These roles are derived from interviews. Questionnaires remain in their
  // own portrait; they do not independently corroborate the same narrative.
  input.constructEstimates = [{ construct: "self-reported narrative (same-source)", level: 2 }];
  if (input.domainSummaries.length === 0) throw new Error("polaris_no_evidence");
  const lease = beginAccountSessionLease(userId);
  let generationId: string | undefined;
  let proposed: SynthesizedPersona[];
  try {
    const session = await lease.authenticate();
    generationId = quota.available ? await reservePolarisGeneration(userId, randomUUID()) : undefined;
    session.assertCurrent();
    proposed = await synthesizePersonas(userId, input, locale, minor, generationId, session);
    session.assertCurrent();
  } catch (error) {
    if (generationId) await failPolarisGeneration(userId, generationId).catch(() => {});
    throw error;
  } finally {
    lease.release();
  }
  // The server persists the result and commits the allowance atomically.
  if (generationId) return loadRoleCards(userId);
  const byStar = new Map<SevenStarId, string[]>();
  for (const row of rows) {
    if (!isSevenStarId(row.audit_period ?? "") || !row.tags?.includes("interview")) continue;
    const star = row.audit_period as SevenStarId;
    const refs = byStar.get(star) ?? [];
    refs.push(`record:${row.id}`);
    byStar.set(star, refs);
  }
  const cards: RoleCard[] = proposed.map((p) => {
    const existing = previous.find((old) => old.id === p.id && old.label === p.label && old.summary === p.summary);
    return {
      ...p,
      evidenceRefs: [...new Set(p.evidence.domains.flatMap((id) => byStar.get(id as SevenStarId) ?? []))].slice(0, 20),
      status: existing?.status === "ratified" ? "ratified" as const : "proposed" as const,
    };
  }).filter((p) => p.evidenceRefs.length > 0);
  if (cards.length === 0) throw new Error("polaris_no_grounded_result");
  // Re-synthesis may reword or omit a role. That is a new *proposal*, never
  // permission to erase or silently rewrite an already approved self-model.
  const retained = previous.filter((old) => old.status === "ratified" &&
    !cards.some((next) => next.id === old.id && next.status === "ratified"));
  const next = [
    ...retained,
    ...cards.filter((card) => !retained.some((old) => old.id === card.id)),
  ].slice(0, 3);
  if (!persona) {
    const { error: createError } = await getSupabaseClient().from("personas").upsert({
      user_id: userId, version: 1,
      traits: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 },
      patterns: {}, values: [], markdown_export: "",
    }, { onConflict: "user_id,version", ignoreDuplicates: true });
    if (createError) throw createError;
  }
  await writeRoleCards(userId, next);
  return next;
}

export async function ratifyRoleCard(userId: string, card: RoleCard): Promise<RoleCard[]> {
  const lease = beginAccountSessionLease(userId);
  try {
    const session = await lease.authenticate();
    // Send the card the user actually saw. The server locks the current row,
    // compares its contents and updates only this card, preserving siblings.
    const { error } = await rpcWithCapturedSession("ratify_polaris_role_card", {
      p_user_id: userId, p_card: card,
    }, session.accessToken, session.signal);
    session.assertCurrent();
    if (error) throw error;
    const next = await loadRoleCards(userId);
    session.assertCurrent();
    // Existing server rule is once-only. Never award for an unapproved draft.
    await rpcWithCapturedSession("award_xp", { p_action: "persona_created" }, session.accessToken, session.signal).catch(() => {});
    session.assertCurrent();
    return next;
  } finally { lease.release(); }
}

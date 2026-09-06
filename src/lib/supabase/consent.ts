// C10 / PR-5 (task B): consent ledger writer.
//
// Appends one immutable row to consent_records per consent event (sign-up,
// re-consent on a version bump, age-out re-consent). Records WHAT the user
// agreed to and under which document versions, for PIPA accountability
// (general consent §15/§17/§22 + §23 sensitive-data ack + overseas-transfer
// notice for Gemini/Supabase processing).
//
// WIRED at sign-up: recordConsentBestEffort() is called after the consent UI
// collects the acknowledgements — src/app/(auth)/sign-up.tsx:103 and
// src/app/(auth)/complete-profile.tsx:90. Invariant stands: only record a
// consent AFTER the UI has actually collected it — never one the user did
// not give.
//
// These version constants track the 시행일 of the published documents
// (docs/legal/*.md, mirrored into src/lib/legal/legal-documents.ts). They had
// drifted: the constants said 2026-06-02 while the documents shipped 2026-07-17,
// so every consent row recorded a policy version that was never published.
//
// KNOWN GAP, deliberately not closed here: nothing re-asks for consent when
// these change. They are stamped onto new rows and read by nothing else, so a
// bump records the truth going forward but does not reach existing accounts. A
// re-consent flow is its own piece of work, and shipping a half-version of it
// would be worse than the gap.

import { getSupabaseClient } from "./client";

export const CONSENT_VERSION = "2026-08-16" as const;
// 2026-08-30 개정(제4조 수탁사에 GA4·Clarity 추가, 제5조 국외이전 고지 신설)에
// 맞춰 올린다. 이걸 안 올리면 그날 이후 가입자의 원장에 '08-16 판에 동의했다'고
// 남는데, 정작 화면에는 08-30 판이 떠 있다 — 원장이 거짓이 된다.
// ⚠ 위 주석대로 이 값을 올려도 **기존 계정에는 닿지 않는다.** 재동의 흐름은 별도 작업이다.
//
// 2026-09-04: 같은 이유로 다시 올린다. 이번 개정은 §4 수탁사에 OpenAI(대화·OCR·
// 음성 전사·임베딩)와 Google(Firebase Analytics)을 추가하고, §5 의 "음성·오디오는
// 텍스트 전사를 위해 Google에 전송됩니다" 를 OpenAI 로 정정한 것이다. 앞의 개정과
// 성격이 다르다 — 그때는 빠진 것을 채웠고, 이번엔 **적혀 있던 회사 이름이 틀렸다.**
// 문서의 시행일만 09-04 로 옮기고 이 상수를 08-30 에 두면 원장이 가리키는 판과
// 화면에 뜨는 판이 어긋난다. 그게 위 문단이 말하는 바로 그 거짓이다.
export const PRIVACY_POLICY_VERSION = "2026-09-04" as const;
export const TERMS_VERSION = "2026-08-16" as const;

export type ConsentAgeBand = "minor_self" | "adult";
export type MinorTier = "adult" | "minor_self" | "minor_guardian";

export interface RecordConsentArgs {
  userId: string;
  /** Coarse band the consent was given under. 14-17 -> minor_self, >=18 -> adult. */
  ageBand: ConsentAgeBand;
  /** Server-derived tier at consent time (from the age-gate trigger), if known. */
  minorTier?: MinorTier | null;
  locale: "en" | "ko";
  /** Agreed processing purposes, e.g. ["service", "personalization"]. */
  purposes: string[];
  /** Required (service) consent — must be true to use the app. */
  requiredAck: boolean;
  /** Optional per-purpose toggles (marketing, recommendations, ...). */
  optionalConsents?: Record<string, boolean>;
  /** Mandatory acknowledgements surfaced in the notice. */
  llmProcessingAck: boolean;
  overseasTransferAck: boolean;
  sensitiveDataAck: boolean;
  /**
   * PIPA 제23조 별도 동의 - 안전 안내(위기 라우팅). crisis_events 행을 만드는
   * 근거다. 0130 이전 계정은 질문받은 적이 없어 NULL 로 남는다.
   */
  safetyNoticeAck?: boolean | null;
  /** Hashed request metadata — never the raw IP / UA (data minimization). */
  ipHash?: string | null;
  uaHash?: string | null;
}

export async function recordConsent(args: RecordConsentArgs): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("consent_records").insert({
    user_id: args.userId,
    age_band: args.ageBand,
    minor_tier: args.minorTier ?? null,
    consent_version: CONSENT_VERSION,
    policy_version: PRIVACY_POLICY_VERSION,
    terms_version: TERMS_VERSION,
    purposes: args.purposes,
    required_ack: args.requiredAck,
    optional_consents: args.optionalConsents ?? {},
    llm_processing_ack: args.llmProcessingAck,
    overseas_transfer_ack: args.overseasTransferAck,
    sensitive_data_ack: args.sensitiveDataAck,
    safety_notice_ack: args.safetyNoticeAck ?? null,
    locale: args.locale,
    ip_hash: args.ipHash ?? null,
    ua_hash: args.uaHash ?? null,
  });
  if (error) throw error;
}

// Phase B Slice 1: record the explicit app-level opt-in to the health/activity
// ingest. Health data is PIPA 민감정보, so the consent is logged with the
// sensitive-data acknowledgement set. Reuses the existing consent ledger (no
// new path) and the best-effort writer so a flaky network does not lose it.
// Only call this AFTER the user has actually flipped health_import ON in the UI.
export async function recordHealthImportConsent(args: {
  userId: string;
  ageBand: ConsentAgeBand;
  minorTier?: MinorTier | null;
  locale: "en" | "ko";
}): Promise<boolean> {
  return recordConsentBestEffort({
    userId: args.userId,
    ageBand: args.ageBand,
    minorTier: args.minorTier ?? null,
    locale: args.locale,
    purposes: ["health_import"],
    requiredAck: true,
    optionalConsents: { health_import: true },
    // Health/activity is sensitive data; it is processed by our own pipeline
    // (no third-party LLM in this slice), so only the sensitive-data ack is set.
    llmProcessingAck: false,
    overseasTransferAck: false,
    sensitiveDataAck: true,
  });
}

// D-25 Phase 3: record the explicit adult opt-in to /ops recommendations. The
// recommend run sends a wiki snapshot to Gemini (LLM processing) which runs
// overseas, so BOTH the LLM-processing and overseas-transfer acknowledgements
// are set. Minors can never reach this (the recommendations pref is locked OFF
// and non-promotable for them); the caller guards on isMinor, so this is always
// an adult opt-in. Call AFTER the user confirms the understanding-gate in the UI.
export async function recordRecommendationsConsent(args: {
  userId: string;
  ageBand: ConsentAgeBand;
  minorTier?: MinorTier | null;
  locale: "en" | "ko";
}): Promise<boolean> {
  return recordConsentBestEffort({
    userId: args.userId,
    ageBand: args.ageBand,
    minorTier: args.minorTier ?? null,
    locale: args.locale,
    purposes: ["recommendations"],
    requiredAck: true,
    optionalConsents: { recommendations: true },
    llmProcessingAck: true,
    overseasTransferAck: true,
    sensitiveDataAck: false,
  });
}

// P0④ (integrations bridge): record the per-source consent the /import-hub
// sheet collects before a personal-data file import. Parsing is on-device (no
// LLM at import time) and the extracted signals land in the user's own rows,
// so only the sensitive-data ack varies: true for the critical/sensitive
// tiers (comms · location · health · email), false for normal notes/calendar.
// Call AFTER the user completed the consent sheet AND the import actually
// landed — never for a cancelled or failed import.
export async function recordImportConsent(args: {
  userId: string;
  ageBand: ConsentAgeBand;
  minorTier?: MinorTier | null;
  locale: "en" | "ko";
  /** Import-hub source key (kakao, sms, takeout, health, email, ...). */
  sourceKey: string;
  /** True for the critical/sensitive source tiers. */
  sensitive: boolean;
}): Promise<boolean> {
  return recordConsentBestEffort({
    userId: args.userId,
    ageBand: args.ageBand,
    minorTier: args.minorTier ?? null,
    locale: args.locale,
    purposes: ["personal_import"],
    requiredAck: true,
    optionalConsents: { [`import_${args.sourceKey}`]: true },
    llmProcessingAck: false,
    overseasTransferAck: false,
    sensitiveDataAck: args.sensitive,
  });
}

// A transient (network/timeout) failure should not lose a consent event, but a
// permanent error (missing table pre-migration, schema/permission, integrity)
// will never succeed on retry, so retrying it just wastes time. Distinguish the
// two so we only back off + retry the transient case.
const CONSENT_MAX_ATTEMPTS = 3;
function isPermanentConsentError(e: unknown): boolean {
  const code = String((e as { code?: string } | null)?.code ?? "");
  const msg = String((e as { message?: string } | null)?.message ?? "").toLowerCase();
  // PostgREST/Postgres: 42xxx undefined_table/column, 23xxx integrity, PGRSTxxx
  // schema/permission. A plain Error (no code) from a missing relation carries a
  // "does not exist" / "relation" message.
  return (
    code.startsWith("42") ||
    code.startsWith("23") ||
    code.startsWith("PGRST") ||
    msg.includes("does not exist") ||
    msg.includes("relation") ||
    msg.includes("permission denied")
  );
}

function consentRetryBackoff(attempt: number): Promise<void> {
  // 400ms then 800ms: short enough not to stall the sign-up hand-off, long
  // enough to ride out a brief network blip.
  return new Promise((resolve) => setTimeout(resolve, attempt * 400));
}

// Best-effort variant for the sign-up / complete-profile path. The user has
// already given the acknowledgements in the UI (the submit button gates on
// them), so a failed ledger write must NOT block account creation. Before the
// 0031 migration is applied to a given environment the consent_records table
// does not exist yet; that is a permanent error here and is NOT retried.
// Transient write failures are retried with a short backoff so a flaky network
// does not lose the consent event. Returns whether the row was written.
export async function recordConsentBestEffort(args: RecordConsentArgs): Promise<boolean> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= CONSENT_MAX_ATTEMPTS; attempt++) {
    try {
      await recordConsent(args);
      return true;
    } catch (e) {
      lastError = e;
      if (isPermanentConsentError(e) || attempt === CONSENT_MAX_ATTEMPTS) break;
      await consentRetryBackoff(attempt);
    }
  }
  // PIPA accountability: a lost consent record is a compliance gap, so surface
  // the failure at error level (captured by monitoring) instead of a swallowed
  // warn. We still don't block account creation -- the caller acts on the
  // returned `false`.
  if (typeof console !== "undefined") {
    console.error(
      "[consent] ledger write FAILED after retries (account created without a consent record)",
      (lastError as Error).message,
    );
  }
  return false;
}

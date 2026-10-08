import { beginAccountSessionLease } from "../auth/account-session-lease";
import { captureAccountOwnerLease, subscribeAccountTransition } from "../auth/account-epoch";
import { currentPrivacyChange, subscribePrivacyChanges } from "../privacy/changes";
import { invokeFunctionWithCapturedSession } from "../supabase/captured-session-client";
import { decodeBoardResponse, type ValidatedBoardOutput } from "./generation-output";
import type { GenerationState } from "./generation-state";

// Server deployment and canary precede this build flag. No local model fallback.
export const DASHBOARD_GENERATION_ENABLED = process.env.EXPO_PUBLIC_DASHBOARD_GENERATION === "true";

export async function requestBoardGeneration(
  ownerId: string, action: "open" | "summary" | "triage", locale: string, signal?: AbortSignal,
): Promise<ValidatedBoardOutput | { ok: false; reason: GenerationState }> {
  const invalid = { ok: false, reason: "unavailable" } as const;
  if (!DASHBOARD_GENERATION_ENABLED) return { ok: false, reason: "disabled" };
  if (currentPrivacyChange(ownerId)?.prefs.recommendations === false) return { ok: false, reason: "denied" };
  const owner = captureAccountOwnerLease(ownerId);
  if (!owner) return invalid;
  const pending = beginAccountSessionLease(ownerId, signal);
  const revision = currentPrivacyChange(ownerId)?.revision;
  const stopOwner = subscribeAccountTransition(() => { if (!owner.isCurrent()) pending.abort(); });
  const stopPrivacy = subscribePrivacyChanges((change) => { if (change.ownerId === ownerId) pending.abort(); });
  const timeout = setTimeout(() => pending.abort(), 35_000);
  try {
    const session = await pending.authenticate(); session.assertCurrent();
    const language = locale.toLowerCase().split("-")[0];
    const result = await invokeFunctionWithCapturedSession("dashboard-generate", session.accessToken, {
      body: { action, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locale: ["en", "ko", "es", "pt", "id"].includes(language) ? language : "en" }, signal: session.signal,
    });
    session.assertCurrent();
    if (!owner.isCurrent() || result.error || currentPrivacyChange(ownerId)?.revision !== revision) return invalid;
    const kind = result.data && typeof result.data === "object" && "kind" in result.data ? result.data.kind : null;
    if (kind === "empty" || kind === "denied" || kind === "busy" || kind === "waiting" || kind === "limited" || kind === "disabled" || kind === "unavailable") return { ok: false, reason: kind };
    const decoded = decodeBoardResponse(result.data);
    const expected = { open: "daily_note", summary: "day_summary", triage: "inbox_triage" }[action];
    return decoded.ok && decoded.seat === expected ? decoded : invalid;
  } catch { return invalid; }
  finally { clearTimeout(timeout); stopOwner(); stopPrivacy(); pending.release(); }
}
